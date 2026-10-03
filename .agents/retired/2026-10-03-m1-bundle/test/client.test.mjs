/**
 * M1 regression test for the client half.
 *
 * Runs the real lib/client.js in a minimal fake DOM + fake ctx — no browser, no
 * harness — and asserts the two observable behaviours M1 is accountable for:
 * the probe stylesheet reaches the page, and the inverse the host runs on
 * dispose puts the page back the way it was.
 *
 * The factory's return value IS the module's export surface: lib/client.js
 * returns module.exports, whose value is { apply }, and the roster calls
 * apply(ctx) off it. The test asserts that shape rather than assuming it.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import test from 'node:test'

const CLIENT_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))
const source = readFileSync(CLIENT_PATH, 'utf8')

/**
 * The smallest DOM the install/teardown path touches. A real element.remove()
 * detaches the node from its parent, so head.children drops it and
 * getElementById stops finding it — the fake reproduces that, which is exactly
 * the behaviour the teardown assertion depends on.
 */
function makeSandbox() {
  const head = { children: [] }
  const attributes = new Map()
  const effects = []

  const sandbox = {
    document: {
      createElement: () => ({
        id: '',
        textContent: '',
        tagName: 'style',
        remove() {
          const index = head.children.indexOf(this)
          if (index !== -1) head.children.splice(index, 1)
        },
      }),
      head: {
        appendChild(el) { head.children.push(el) },
      },
      documentElement: {
        setAttribute(name, value) { attributes.set(name, value) },
        removeAttribute(name) { attributes.delete(name) },
      },
      getElementById(id) { return head.children.find((el) => el.id === id) ?? null },
    },
    window: { __ModuleLoader__: { load(definition) { sandbox.loaded = definition } } },
  }

  return {
    sandbox,
    head,
    attributes,
    effects,
    ctx: { effect(fn, label) { effects.push({ fn, label }) } },
  }
}

function loadClient() {
  const env = makeSandbox()
  vm.createContext(env.sandbox)
  vm.runInContext(source, env.sandbox)
  assert.ok(env.sandbox.loaded, 'client.js must call window.__ModuleLoader__.load')
  const exported = env.sandbox.loaded.factory(() => {
    throw new Error('M1 client half must not require any module')
  })
  return { ...env, exported }
}

test('the factory hands the roster a callable apply', () => {
  const { exported } = loadClient()
  assert.equal(typeof exported.apply, 'function')
})

test('apply injects one probe stylesheet and marks the root element', () => {
  const { exported, head, attributes, effects, ctx } = loadClient()
  exported.apply(ctx)

  assert.equal(head.children.length, 1, 'exactly one stylesheet element')
  assert.ok(head.children[0].textContent.includes('background-color'), 'probe CSS carries the test colour')
  assert.ok(attributes.has('data-dsh-theme'), 'root attribute marks the document')
  assert.equal(effects.length, 1, 'one reversible effect registered with the host')
})

test('the effect the host runs on dispose restores the page', () => {
  const { exported, head, attributes, effects, ctx } = loadClient()
  exported.apply(ctx)

  effects[0].fn()

  assert.equal(head.children.length, 0, 'stylesheet detached from the page')
  assert.equal(attributes.has('data-dsh-theme'), false, 'root attribute removed')
})
