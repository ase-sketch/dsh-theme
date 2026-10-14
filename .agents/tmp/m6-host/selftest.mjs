// M6/T2 host 路由自测：纯函数 + 复刻框架 dispatch 的最小 http 服务器。
// 端口用 listen(0) 由 OS 分配，绝不碰 19488。
// DSH_HOME 指向临时目录，绝不写真实 ~/.dsh/dsh-theme/state.json。
import fs from 'node:fs'
import os from 'node:os'
import net from 'node:net'
import path from 'node:path'
import http from 'node:http'
import { createHash } from 'node:crypto'

const HOST_INDEX = 'E:/dsh-theme/plugins/dsh-theme/host/index.js'
const PLUGIN = 'E:/dsh-theme/plugins/dsh-theme'
const ASSET_DIR = PLUGIN + '/assets/deepy'
const PREFIX = '/api/dsh-theme/deepy'
const md5 = (buf) => createHash('md5').update(buf).digest('hex')

let pass = 0, fail = 0
const failures = []
function ok(cond, label, extra = '') {
  if (cond) { pass++; console.log('  PASS', label) }
  else { fail++; failures.push(label); console.log('  FAIL', label, extra) }
}

// ---- 假 ctx：收集注册路由；DSH_HOME 指向临时目录 ----
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'm6-host-'))
const REAL_STATE = 'C:/Users/pass/.dsh/dsh-theme/state.json'
const fingerprint = () => (fs.existsSync(REAL_STATE)
  ? fs.readFileSync(REAL_STATE, 'utf8') + '|' + fs.statSync(REAL_STATE).mtimeMs
  : '<absent>')
const realStateBefore = fingerprint()

function makeCtx() {
  const routes = []
  const ctx = {
    routes,
    effect: (fn) => fn(),
    webServer: {
      register(route) {
        routes.push(route)
        return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1) }
      },
    },
    get: (key) => (key === 'dshHomePath' ? () => tmpHome : undefined),
  }
  return ctx
}

// ---- 复刻 dsh-host-webserver/lib/index.js 的 match + dispatch（不依赖 DSH 实例）----
function match(routes, pathname) {
  for (const r of routes) if (r.kind === 'exact' && r.path === pathname) return r
  let best
  for (const r of routes) {
    if (r.kind === 'exact') continue
    if (pathname !== r.path && !pathname.startsWith(r.path + '/')) continue
    if (best === undefined || r.path.length > best.path.length) best = r
  }
  return best
}
async function startServer(routes) {
  const server = http.createServer((req, res) => {
    const rawPath = new URL(req.url ?? '/', 'http://x').pathname
    const route = match(routes, rawPath)
    if (route === undefined) { res.writeHead(404); res.end(); return }
    Promise.resolve(route.handler(req, res)).catch(() => {
      if (!res.headersSent) { res.writeHead(400); res.end() }
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { server, port: server.address().port }
}

function dechunk(buf) {
  const out = []
  let i = 0
  while (i < buf.length) {
    const nl = buf.indexOf('\r\n', i)
    if (nl === -1) break
    const size = Number.parseInt(buf.toString('latin1', i, nl).trim(), 16)
    if (!Number.isFinite(size) || size === 0) break
    out.push(buf.subarray(nl + 2, nl + 2 + size))
    i = nl + 2 + size + 2
  }
  return Buffer.concat(out)
}

// 裸 socket 发请求：绕开 WHATWG URL 归一化，才能真正发出字面 .. 与 %2e%2e。
function request(port, requestPath, { method = 'GET', body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1', () => {
      let head = method + ' ' + requestPath + ' HTTP/1.1\r\nHost: 127.0.0.1:' + port + '\r\nConnection: close\r\n'
      if (body !== null) head += 'Content-Type: application/json\r\nContent-Length: ' + Buffer.byteLength(body) + '\r\n'
      for (const [k, v] of Object.entries(headers)) head += k + ': ' + v + '\r\n'
      sock.write(head + '\r\n' + (body === null ? '' : body))
    })
    const chunks = []
    sock.on('data', (c) => chunks.push(c))
    sock.on('end', () => {
      const buf = Buffer.concat(chunks)
      const sep = buf.indexOf('\r\n\r\n')
      const headText = buf.toString('latin1', 0, sep)
      let payload = buf.subarray(sep + 4)
      const hdrs = {}
      for (const line of headText.split('\r\n').slice(1)) {
        const i = line.indexOf(':')
        if (i > 0) hdrs[line.slice(0, i).toLowerCase().trim()] = line.slice(i + 1).trim()
      }
      if ((hdrs['transfer-encoding'] || '').includes('chunked')) payload = dechunk(payload)
      resolve({ status: Number(headText.split(' ')[1]), headers: hdrs, body: payload, head: headText })
    })
    sock.on('error', reject)
  })
}
const raw = (port, p, opts) => request(port, p, opts)

const mod = await import('file:///' + HOST_INDEX)
const ctx = makeCtx()
mod.apply(ctx)
const { server, port } = await startServer(ctx.routes)
console.log('# 测试服务器端口', port, '（OS 分配，19488 未被占用）')
console.log('# 测试用 DSH_HOME 临时目录', tmpHome)

// ============ 1. 注册面：三条路由，前两条与 M5 逐字一致 ============
console.log('\n== 1. 路由注册 ==')
ok(ctx.routes.length === 3, '注册 3 条路由 (state / theme.css / deepy)', 'actual=' + ctx.routes.length)
ok(ctx.routes[0].kind === 'exact' && ctx.routes[0].path === '/api/dsh-theme/state', '/state 仍是第 1 条 exact 路由')
ok(ctx.routes[1].kind === 'exact' && ctx.routes[1].path === '/api/dsh-theme/theme.css', '/theme.css 仍是第 2 条 exact 路由')
ok(ctx.routes[2].kind === 'prefix' && ctx.routes[2].path === PREFIX, 'deepy 挂在 prefix ' + PREFIX)
ok(new Set(ctx.routes.map((r) => r.kind + ' ' + r.path)).size === 3, '三条路由 (kind,path) 无重复（框架 duplicate 会 throw）')

// ============ 2. 纯函数直接调用 ============
console.log('\n== 2. 纯函数 resolveDeepyAsset ==')
ok(typeof mod.resolveDeepyAsset === 'function', '纯函数已导出')
const R = mod.resolveDeepyAsset
if (typeof R === 'function') {
  const good = R('idle.png')
  ok(good.ok === true && good.file === path.join(ASSET_DIR, 'idle.png'), 'idle.png -> 资产目录内绝对路径', JSON.stringify(good))
  ok(good.contentType === 'image/png', 'idle.png content-type=image/png', good.contentType)
  const man = R('deepy.json')
  ok(man.ok === true && man.contentType === 'application/json; charset=utf-8', 'deepy.json content-type', man.contentType)
  ok(R('..%2f..%2fhost%2findex.js').ok === false, '纯函数拒绝 percent 编码穿越')
  ok(R('..%252f..%252fhost%252findex.js').ok === false, '纯函数拒绝双重编码（证明只解码一次）')
  ok(R('../host/index.js').ok === false, '拒绝字面 ../host/index.js')
  ok(R('/etc/passwd').ok === false, '拒绝绝对路径')
  ok(R('a.txt').ok === false, '拒绝非白名单扩展名')
  ok(R('A.png').ok === false, '拒绝大写 A.png')
  ok(R('').ok === false, '拒绝空名')
  ok(R('0abc.png').ok === false, '拒绝数字开头')
  ok(R('idle.png/../../x').ok === false, '拒绝夹带路径的混合输入')
  ok(R('../../../../../../Windows/win.ini', 'E:/dsh-theme/.agents/tmp/m6-host/fixture-assets').ok === false, '换 baseDir 后仍只认该目录内')
  const inj = R('idle.png', 'E:/dsh-theme/.agents/tmp/m6-host/fixture-assets')
  ok(inj.ok === true && inj.file === path.join('E:/dsh-theme/.agents/tmp/m6-host/fixture-assets', 'idle.png'), 'baseDir 可注入（供测试用）', JSON.stringify(inj))
  ok(R('..', ASSET_DIR).ok === false, '拒绝裸 ..')
  ok(R('...', ASSET_DIR).ok === false, '拒绝 ...')
  ok(R(null).ok === false && R(undefined).ok === false && R(123).ok === false, '拒绝非字符串输入（不抛异常）')
  ok(R('idle.png', '').ok === false || R('idle.png', '').ok === true, 'baseDir 空串不崩溃（仅要求不抛）')
}

// ============ 3. HTTP 200：真实素材字节与 content-type ============
console.log('\n== 3. HTTP 200 真实素材 ==')
for (const [name, ctype] of [['idle.png', 'image/png'], ['deepy.json', 'application/json; charset=utf-8']]) {
  const r = await raw(port, PREFIX + '/' + name)
  const disk = fs.readFileSync(path.join(ASSET_DIR, name))
  ok(r.status === 200, 'GET ' + name + ' -> 200', 'status=' + r.status)
  ok(r.headers['content-type'] === ctype, name + ' content-type=' + ctype, r.headers['content-type'])
  ok(r.headers['cache-control'] === 'no-store', name + ' cache-control=no-store', r.headers['cache-control'])
  ok(md5(r.body) === md5(disk), name + ' 字节与磁盘逐字节一致', md5(r.body) + ' vs ' + md5(disk) + ' len=' + r.body.length + '/' + disk.length)
  ok(disk.length > 0, name + ' 磁盘文件非空 (' + disk.length + ' B)')
}
for (const s of ['thinking', 'typing', 'happy', 'error', 'notification', 'music', 'building']) {
  const r = await raw(port, PREFIX + '/' + s + '.png')
  ok(r.status === 200 && r.headers['content-type'] === 'image/png', '8 态全可达: ' + s + '.png', 'status=' + r.status)
}
const q = await raw(port, PREFIX + '/idle.png?v=1')
ok(q.status === 200, '带 query 仍 200（query 已剥离）', 'status=' + q.status)
const headReq = await raw(port, PREFIX + '/idle.png', { method: 'HEAD' })
ok(headReq.status === 200 && headReq.body.length === 0, 'HEAD 200 且无 body', 'status=' + headReq.status + ' bodyLen=' + headReq.body.length)
const postReq = await raw(port, PREFIX + '/idle.png', { method: 'POST' })
ok(postReq.status === 405, '非 GET/HEAD -> 405', 'status=' + postReq.status)

// ============ 4. HTTP 非法名 / 穿越：404 + 不泄露 ============
console.log('\n== 4. 非法名与路径穿越 ==')
const LEAK = ['dsh-theme', 'host', 'index.js', 'plugins', 'assets', 'E:', 'ENOENT', '.js', 'deepy']
const attacks = [
  ['..%2f..%2fhost%2findex.js', 'percent 编码穿越'],
  ['%2e%2e%2f%2e%2e%2fhost%2findex.js', '编码点号穿越'],
  ['..%252f..%252fhost%252findex.js', '双重编码穿越'],
  ['..%252e%252e%2fhost%2findex.js', '双重编码点号穿越'],
  ['../host/index.js', '字面 .. 穿越'],
  ['..\\..\\host\\index.js', '反斜杠穿越'],
  ['%2fetc%2fpasswd', '编码绝对路径'],
  ['..%2f..%2f..%2f..%2fWindows%2fwin.ini', '上跳到系统目录'],
  ['a.txt', '非白名单扩展名'],
  ['A.png', '大写名'],
  ['idle.PNG', '大写扩展名'],
  ['%00.png', 'null 字节'],
  ['.png', '空 stem'],
  ['-x.png', '非法首字符'],
  ['idle.png%00', '尾部 null'],
  ['%zz.png', '畸形百分号编码'],
]
for (const [p, label] of attacks) {
  const r = await raw(port, PREFIX + '/' + p)
  const text = r.body.toString('utf8')
  const leaked = LEAK.filter((k) => text.includes(k))
  ok(r.status === 404, label + ' -> 404', 'status=' + r.status + ' body=' + JSON.stringify(text.slice(0, 80)))
  ok(leaked.length === 0, label + ' 响应体不泄露路径/目录内容', 'leaked=' + JSON.stringify(leaked))
}
for (const [p, label] of [[PREFIX + '/', '空名(尾斜杠)'], [PREFIX, '前缀本身'], [PREFIX + '/a/b/c.png', '多层子路径']]) {
  const r = await raw(port, p)
  ok(r.status === 404, label + ' -> 404', 'status=' + r.status)
}
const miss = await raw(port, PREFIX + '/nope.png')
ok(miss.status === 404, '合法但不存在的名字 -> 404（与非法名响应体一致）', 'status=' + miss.status + ' body=' + JSON.stringify(miss.body.toString()))
const miss2 = await raw(port, PREFIX + '/a.txt')
ok(miss.body.toString() === miss2.body.toString(), '不存在与非法名响应体逐字节相同（探测面为零）')

// ============ 5. 现有两条路由回归 ============
console.log('\n== 5. 现有路由回归 ==')
const g = await raw(port, '/api/dsh-theme/state')
let gj = {}
try { gj = JSON.parse(g.body.toString('utf8')) } catch (e) { /* 下面断言会红 */ }
ok(g.status === 200 && gj.ok === true && typeof gj.enabled === 'boolean', 'state GET 200 + JSON', g.body.toString('utf8').slice(0, 120))
ok(g.headers['content-type'] === 'application/json; charset=utf-8', 'state GET content-type', g.headers['content-type'])
const statePath = path.join(tmpHome, 'dsh-theme', 'state.json')
ok(statePath.startsWith(tmpHome), 'state 文件落在临时 DSH_HOME 内: ' + statePath)
const postState = await raw(port, '/api/dsh-theme/state', { method: 'POST', body: JSON.stringify({ enabled: false }) })
ok(postState.status === 200, 'state POST 200', 'status=' + postState.status + ' body=' + postState.body.toString().slice(0, 120))
ok(fs.existsSync(statePath) && JSON.parse(fs.readFileSync(statePath, 'utf8')).enabled === false, 'state POST 真落盘到临时目录')
const g2 = JSON.parse((await raw(port, '/api/dsh-theme/state')).body.toString('utf8'))
ok(g2.enabled === false && g2.source === 'file', 'state GET 回读刚写入的值（持久化闭环）', JSON.stringify(g2))
const postState2 = await raw(port, '/api/dsh-theme/state', { method: 'POST', body: JSON.stringify({ enabled: true }) })
ok(postState2.status === 200 && JSON.parse(postState2.body.toString()).enabled === true, 'state POST 再写一次（覆盖写）')
const badBody = await raw(port, '/api/dsh-theme/state', { method: 'POST', body: JSON.stringify({ enabled: 'yes' }) })
ok(badBody.status === 400, 'state POST 坏 body -> 400（既有行为未变）', 'status=' + badBody.status)
const xo = await raw(port, '/api/dsh-theme/state', { method: 'POST', body: JSON.stringify({ enabled: false }), headers: { Origin: 'http://evil.example' } })
ok(xo.status === 403, '跨站 POST -> 403（sameOrigin 既有行为未变）', 'status=' + xo.status)
const del = await raw(port, '/api/dsh-theme/state', { method: 'DELETE' })
ok(del.status === 405, 'state DELETE -> 405（既有行为未变）', 'status=' + del.status)
const css = await raw(port, '/api/dsh-theme/theme.css')
ok(css.status === 200 && css.headers['content-type'] === 'text/css; charset=utf-8', 'theme.css 200 + text/css', css.status + ' ' + css.headers['content-type'])
ok(css.body.equals(fs.readFileSync(PLUGIN + '/assets/theme.css')), 'theme.css 字节与磁盘一致', 'len=' + css.body.length)
ok(css.headers['cache-control'] === 'no-store', 'theme.css cache-control=no-store', css.headers['cache-control'])

// ============ 6. 卸载：三张表清空 ============
console.log('\n== 6. 卸载 ==')
const ctx2 = makeCtx()
let disposer2 = null
ctx2.effect = (fn) => { disposer2 = fn(); return disposer2 }
mod.apply(ctx2)
ok(ctx2.routes.length === 3, '第二个 ctx 注册 3 条', 'actual=' + ctx2.routes.length)
ok(typeof disposer2 === 'function', 'ctx.effect 的 body 返回了卸载函数（M1 红线）')
disposer2()
ok(ctx2.routes.length === 0, '卸载后 0 条路由残留', 'actual=' + ctx2.routes.length)

server.close()
ok(fingerprint() === realStateBefore, '真实 $DSH_HOME/dsh-theme/state.json 零改动')
fs.rmSync(tmpHome, { recursive: true, force: true })
ok(!fs.existsSync(tmpHome), '临时 DSH_HOME 已清理')

console.log('\n========================================')
console.log('PASS ' + pass + '   FAIL ' + fail)
if (fail) { console.log('失败用例:'); for (const f of failures) console.log('  - ' + f) }
process.exit(fail ? 1 : 0)
