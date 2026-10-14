// 负控制：临时移除路径校验后，逐个探针判定「被哪一层拦下」，避免把别的机制误记成校验的功劳。
//   LEAK          = 真的读到了 host/index.js 源码（校验形同虚设）
//   route-404     = 进了 handler、被我的 404 拦下（body='not found'）
//   framework-404 = 压根没进 handler，被框架/URL 归一化拦下（body 为空）
import fs from 'node:fs'
import net from 'node:net'
import http from 'node:http'

const HOST_INDEX = 'E:/dsh-theme/plugins/dsh-theme/host/index.js'
const PREFIX = '/api/dsh-theme/deepy'
const MARKER = 'dsh-theme — host 半'

const routes = []
const ctx = {
  routes,
  effect: (fn) => fn(),
  webServer: { register(r) { routes.push(r); return () => {} } },
  get: () => () => 'C:/Users/pass/AppData/Local/Temp/m6-negctl-unused',
}
const mod = await import('file:///' + HOST_INDEX + '?negctl=' + Date.now())
mod.apply(ctx)
const deepyRoute = routes.find((r) => r.path === PREFIX)
const usesPureFn = typeof deepyRoute?.handler === 'function' && /resolveDeepyAsset\(pathname/.test(deepyRoute.handler.toString())

function match(list, pathname) {
  for (const r of list) if (r.kind === 'exact' && r.path === pathname) return r
  let best
  for (const r of list) {
    if (r.kind === 'exact') continue
    if (pathname !== r.path && !pathname.startsWith(r.path + '/')) continue
    if (!best || r.path.length > best.path.length) best = r
  }
  return best
}
const server = http.createServer((req, res) => {
  const route = match(routes, new URL(req.url ?? '/', 'http://x').pathname)
  if (!route) { res.writeHead(404); res.end(); return }
  try { route.handler(req, res) } catch (e) { console.log('  handler 抛异常:', e.message); if (!res.headersSent) { res.writeHead(500); res.end() } }
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
console.log('# 负控制端口', port, '| handler 是否走纯函数:', usesPureFn ? '是（校验在）' : '否（校验已移除）')

function get(p) {
  return new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1', () => s.write('GET ' + p + ' HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n'))
    const c = []
    s.on('data', (x) => c.push(x))
    s.on('end', () => {
      const b = Buffer.concat(c)
      const sep = b.indexOf('\r\n\r\n')
      const head = b.toString('latin1', 0, sep)
      let payload = b.subarray(sep + 4)
      if (/chunked/i.test(head)) {
        const out = []
        let i = 0
        while (i < payload.length) {
          const nl = payload.indexOf('\r\n', i)
          if (nl === -1) break
          const size = Number.parseInt(payload.toString('latin1', i, nl).trim(), 16)
          if (!Number.isFinite(size) || size === 0) break
          out.push(payload.subarray(nl + 2, nl + 2 + size))
          i = nl + 2 + size + 2
        }
        payload = Buffer.concat(out)
      }
      resolve({ status: Number(head.split(' ')[1]), body: payload.toString('utf8') })
    })
    s.on('error', () => resolve({ status: -1, body: '' }))
  })
}

const probes = [
  ['..%2f..%2fhost%2findex.js', 'percent 编码穿越'],
  ['%2e%2e%2f%2e%2e%2fhost%2findex.js', '编码点号穿越'],
  ['../host/index.js', '字面 .. 穿越'],
  ['..%252f..%252fhost%252findex.js', '双重编码穿越'],
  ['..%252e%252e%2fhost%2findex.js', '双重编码点号穿越'],
  ['idle.png', '正常素材（对照）'],
]
const rows = []
let leaked = 0
for (const [p, label] of probes) {
  const r = await get(PREFIX + '/' + p)
  const isLeak = r.body.includes(MARKER)
  let verdict
  if (isLeak) { verdict = 'LEAK'; leaked++ }
  else if (r.status === 404 && r.body === '') verdict = 'framework-404（没进 handler）'
  else if (r.status === 404 && r.body === 'not found') {
    // 同样是 'not found'，必须分清是被白名单挡下的，还是文件真的不存在（ENOENT 分支）。
    const rejected = usesPureFn && typeof mod.resolveDeepyAsset === 'function' && mod.resolveDeepyAsset(p).ok === false
    verdict = rejected ? 'route-404（白名单/路径校验拦下，未读文件系统）' : 'route-404（ENOENT：目标文件不存在）'
  }
  else verdict = 'HTTP ' + r.status
  rows.push({ label, verdict, status: r.status })
  console.log('  ' + label.padEnd(24) + ' status=' + String(r.status).padEnd(4) + ' -> ' + verdict)
}
server.close()
console.log('')
console.log('负控制结论: ' + leaked + ' 个探针读到了 host/index.js 源码。')
if (leaked >= 1) console.log('→ 校验移除后穿越确实成功：**白名单+path.resolve 校验是在真拦**，负控制有效。')
else console.log('→ 一个都没漏：不能据此声称校验在拦（假阴性，负控制无效）。')
process.exit(leaked >= 1 ? 0 : 1)
