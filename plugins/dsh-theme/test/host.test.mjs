/**
 * dsh-theme · host 半回归测试。
 * 覆盖素材路径解析、状态原子落盘，以及 apply 真实注册的 state 路由处理器。
 * 运行：node plugins/dsh-theme/test/host.test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { apply, readState, writeState, resolveDeepyAsset, resolveIconAsset, normalizeWeather, normalizeLocation, readWeatherLocation, writeWeatherLocation } from '../host/index.js'

const tests = []
function test(name, fn) { tests.push({ name, fn }) }
function tempHome() { return fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-theme-host-')) }
function contextFor(home) { return { get(key) { return key === 'dshHomePath' ? () => home : undefined } } }
function cleanupHome(home) {
  const dir = path.join(home, 'dsh-theme')
  for (const name of ['state.json', 'state.json.tmp', 'weather-location.json', 'weather-location.json.tmp']) {
    const file = path.join(dir, name)
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }
  if (fs.existsSync(dir)) fs.rmdirSync(dir)
  if (fs.existsSync(home)) fs.rmdirSync(home)
}

test('素材名只解码一次并拒绝穿越与非法扩展', () => {
  const base = path.resolve('assets')
  assert.equal(resolveDeepyAsset('idle.png', base).ok, true)
  assert.equal(resolveDeepyAsset('deepy.json', base).ok, true)
  assert.equal(resolveDeepyAsset('../secret.png', base).ok, false)
  assert.equal(resolveDeepyAsset('%2e%2e%2fsecret.png', base).ok, false)
  assert.equal(resolveDeepyAsset('%252e%252e%252fsecret.png', base).ok, false)
  assert.equal(resolveDeepyAsset('%E0%A4%A', base).reason, 'malformed-encoding')
  assert.equal(resolveDeepyAsset('idle.svg', base).ok, false)
  assert.equal(resolveIconAsset('icon-map.json', base).ok, true)
  assert.equal(resolveIconAsset('lucide.png', base).ok, false)
  assert.equal(resolveIconAsset('%2e%2e%2fsecret.json', base).ok, false)
})

test('Open-Meteo 响应收敛为五日契约并拒绝坏数据', () => {
  const value = normalizeWeather({
    current: { temperature_2m: 30.6, weather_code: 3 },
    daily: { time: ['2026-10-31', '2026-11-01'], weather_code: [3, 61], temperature_2m_max: [31, 28], temperature_2m_min: [24, 22] },
  })
  assert.equal(value.city, '东莞')
  assert.equal(value.current.temperature, 31)
  assert.equal(value.current.weatherCode, 3)
  assert.equal(value.daily.length, 2)
  assert.deepEqual(value.daily[1], { date: '2026-11-01', weatherCode: 61, max: 28, min: 22 })
  assert.throws(() => normalizeWeather({ current: {}, daily: {} }), /malformed current/)
  assert.throws(() => normalizeWeather({ current: { temperature_2m: 30, weather_code: 3 }, daily: { time: [], weather_code: [] } }), /incomplete daily/)
})

test('状态缺失默认 ON，写入后可读且损坏文件安全降级', () => {
  const home = tempHome()
  try {
    const ctx = contextFor(home)
    assert.deepEqual(readState(ctx), { enabled: true, source: 'default' })
    assert.deepEqual(writeState(ctx, false), { enabled: false, source: 'file' })
    assert.deepEqual(readState(ctx), { enabled: false, source: 'file' })
    const file = path.join(home, 'dsh-theme', 'state.json')
    assert.equal(fs.existsSync(file + '.tmp'), false)
    fs.writeFileSync(file, '{broken', 'utf8')
    assert.deepEqual(readState(ctx), { enabled: true, source: 'default' })
  } finally { cleanupHome(home) }
})

function responseStub() {
  return {
    status: null, headers: null, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(body) { if (body !== undefined) this.body = Buffer.isBuffer(body) ? body : String(body); return this },
  }
}
async function callRoute(route, options = {}) {
  const body = options.body === undefined ? [] : [Buffer.from(options.body)]
  const req = Readable.from(body)
  req.method = options.method || 'GET'
  req.url = options.url || route.path
  req.headers = options.headers || {}
  const res = responseStub()
  await route.handler(req, res)
  return res
}

test('apply 注册的 state 路由处理同源写入、非法请求与方法限制', async () => {
  const home = tempHome()
  let dispose = null
  const routes = []
  try {
    const base = contextFor(home)
    const ctx = {
      get: base.get,
      effect(body) { dispose = body() },
      webServer: { register(route) { routes.push(route); return () => {} } },
    }
    apply(ctx)
    const state = routes.find((route) => route.path === '/api/dsh-theme/state')
    assert.ok(state)
    let res = await callRoute(state)
    assert.equal(res.status, 200)
    assert.equal(JSON.parse(res.body).enabled, true)

    res = await callRoute(state, {
      method: 'POST', body: JSON.stringify({ enabled: false }),
      headers: { host: 'localhost', origin: 'http://localhost' },
    })
    assert.equal(res.status, 200)
    assert.equal(readState(base).enabled, false)

    res = await callRoute(state, {
      method: 'POST', body: JSON.stringify({ enabled: true }),
      headers: { host: 'localhost', origin: 'https://evil.example' },
    })
    assert.equal(res.status, 403)
    assert.equal(readState(base).enabled, false)

    res = await callRoute(state, { method: 'POST', body: '{broken' })
    assert.equal(res.status, 400)
    res = await callRoute(state, { method: 'POST', body: JSON.stringify({ enabled: 'yes' }) })
    assert.equal(res.status, 400)
    res = await callRoute(state, { method: 'PUT' })
    assert.equal(res.status, 405)

    for (const prefix of ['/api/dsh-theme/deepy', '/api/dsh-theme/icons']) {
      const route = routes.find((item) => item.path === prefix)
      assert.ok(route)
      res = await callRoute(route, { method: 'POST', url: prefix + '/idle.png' })
      assert.equal(res.status, 405)
    }
  } finally {
    if (typeof dispose === 'function') dispose()
    cleanupHome(home)
  }
})

test('地点默认值为东莞，选择与坐标校验后可原子持久化', () => {
  const home = tempHome()
  try {
    const ctx = contextFor(home)
    assert.equal(readWeatherLocation(ctx).name, '东莞')
    const location = writeWeatherLocation(ctx, { id: 'shanghai', name: '上海', admin1: '上海市', country: '中国', latitude: 31.2304, longitude: 121.4737 })
    assert.equal(location.name, '上海')
    assert.equal(readWeatherLocation(ctx).latitude, 31.2304)
    assert.throws(() => normalizeLocation({ name: '北京', latitude: 999, longitude: 116 }), /invalid-location-coordinates/)
    assert.throws(() => normalizeLocation({ name: '', latitude: 39, longitude: 116 }), /invalid-location-name/)
  } finally { cleanupHome(home) }
})

test('weather 路由返回真实上游契约、缓存结果并在失败时返回 503', async () => {
  const home = tempHome()
  const originalFetch = globalThis.fetch
  const originalError = console.error
  const disposers = []
  function mount() {
    const base = contextFor(home)
    const routes = []
    const ctx = {
      get: base.get,
      effect(body) { disposers.push(body()) },
      webServer: { register(route) { routes.push(route); return () => {} } },
    }
    apply(ctx)
    return routes.find((route) => route.path === '/api/dsh-theme/weather')
  }
  try {
    let calls = 0
    globalThis.fetch = async () => {
      calls += 1
      return { ok: true, json: async () => ({
        current: { temperature_2m: 30.6, weather_code: 3 },
        daily: { time: ['2026-10-31'], weather_code: [3], temperature_2m_max: [31], temperature_2m_min: [24] },
      }) }
    }
    let route = mount()
    let res = await callRoute(route)
    assert.equal(res.status, 200)
    assert.equal(JSON.parse(res.body).current.temperature, 31)
    res = await callRoute(route)
    assert.equal(res.status, 200)
    assert.equal(calls, 1)
    res = await callRoute(route, { method: 'POST' })
    assert.equal(res.status, 405)

    globalThis.fetch = async () => { throw new Error('offline') }
    console.error = () => {}
    route = mount()
    res = await callRoute(route)
    assert.equal(res.status, 503)
    assert.deepEqual(JSON.parse(res.body), { ok: false, error: 'weather-unavailable' })
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalError
    for (const dispose of disposers) dispose()
    cleanupHome(home)
  }
})

test('地点搜索、选择与天气刷新使用同一持久化地点', async () => {
  const home = tempHome()
  const originalFetch = globalThis.fetch
  const disposers = []
  const routes = []
  try {
    const base = contextFor(home)
    const ctx = {
      get: base.get,
      effect(body) { disposers.push(body()) },
      webServer: { register(route) { routes.push(route); return () => {} } },
    }
    const candidate = { id: 'shanghai', name: '上海', admin1: '上海市', country: '中国', latitude: 31.2304, longitude: 121.4737 }
    globalThis.fetch = async (url) => {
      if (String(url).startsWith('https://geocoding-api.open-meteo.com/')) {
        return { ok: true, json: async () => ({ results: [candidate] }) }
      }
      return { ok: true, json: async () => ({
        current: { temperature_2m: 25.2, weather_code: 1 },
        daily: { time: ['2026-10-31'], weather_code: [1], temperature_2m_max: [27], temperature_2m_min: [20] },
      }) }
    }
    apply(ctx)
    const search = routes.find((route) => route.path === '/api/dsh-theme/weather/locations')
    const location = routes.find((route) => route.path === '/api/dsh-theme/weather/location')
    const weather = routes.find((route) => route.path === '/api/dsh-theme/weather')
    let res = await callRoute(search, { url: '/api/dsh-theme/weather/locations?q=' + encodeURIComponent('上海') })
    assert.equal(res.status, 200)
    assert.equal(JSON.parse(res.body).results[0].name, '上海')

    res = await callRoute(location, {
      method: 'POST', body: JSON.stringify(candidate),
      headers: { host: 'localhost', origin: 'http://localhost' },
    })
    assert.equal(res.status, 200)
    assert.equal(readWeatherLocation(base).name, '上海')
    res = await callRoute(weather)
    assert.equal(res.status, 200)
    assert.equal(JSON.parse(res.body).city, '上海')
    assert.equal(JSON.parse(res.body).location.latitude, 31.2304)

    res = await callRoute(location, { method: 'POST', body: JSON.stringify({ name: '坏地点', latitude: 999, longitude: 0 }) })
    assert.equal(res.status, 400)
    res = await callRoute(location, {
      method: 'POST', body: JSON.stringify(candidate),
      headers: { host: 'localhost', origin: 'https://evil.example' },
    })
    assert.equal(res.status, 403)
  } finally {
    globalThis.fetch = originalFetch
    for (const dispose of disposers) dispose()
    cleanupHome(home)
  }
})

let passed = 0
const failures = []
for (const { name, fn } of tests) {
  try { await fn(); passed += 1; console.log('PASS ' + name) }
  catch (error) { failures.push(name + ': ' + error.stack); console.error('FAIL ' + name + '\n' + error.stack) }
}
console.log('\npassed: ' + passed)
console.log('failed: ' + failures.length)
console.log(failures.length === 0 ? 'RESULT: PASS' : 'RESULT: FAIL')
process.exit(failures.length === 0 ? 0 : 1)
