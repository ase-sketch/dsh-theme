/**
 * dsh-theme — host 半。
 *
 * 职责（M5 三层开关里的 L2 层）：**开关状态的所有权在这里**。
 * client 半只发 HTTP 请求，从不自己决定状态、也从不落盘。
 *
 * 三条路由（前缀 /api/dsh-theme/，与 skin-center 的 /api/skin-center/v2/ 平行、不冲突）：
 *   GET  /api/dsh-theme/state         读开关状态
 *   POST /api/dsh-theme/state         写开关状态（body: {"enabled": true|false}）
 *   GET  /api/dsh-theme/theme.css     送出构建产物 assets/theme.css（插件版自包含样式）
 *   GET  /api/dsh-theme/deepy/<name>  送出 Deepy 素材 assets/deepy/<name>（M6，只读）
 *   GET  /api/dsh-theme/icons/<name>  送出图标数据 assets/icons/<name>（M7，只读）
 *
 * 图标数据为什么**整文件**服务、而不是逐图标路由（M7 选型备案）：
 *   icon-map.json（约 29 KB）+ lucide.json（约 930 KB）各拉一次即可，client 半在内存里缓存、
 *   OFF→ON 不重拉。本地回环 + 同源，930 KB 一次传输的代价远低于「逐图标路由」带来的复杂度：
 *   后者要为每个指纹维护一个 URL、把 2141 个图标切成 2141 个响应、还要在 client 侧做并发
 *   与失败重试管理，而收益只是首屏少传几十 KB。真实实例实测首屏替换在百毫秒量级完成。
 *
 * 持久化通道：host 半自建 HTTP 路由，状态文件写 $DSH_HOME/dsh-theme/state.json。
 * 选型理由备案（父代理 2026-10-10 裁决 Q5）：官方 settings 服务链路实测复杂（client 侧
 * 要经 configForms + remote.settings.mutate 走 RPC，且要逐层声明 inject），自用形态下
 * 可测性优先。「迁移到官方 settings 服务」列为待复核决策点。
 *
 * 命名导出，绝不 default export：loader 的 unwrapExports 取 exports.default ?? exports，
 * 有 default 时会把整个命名空间丢掉（inject/name 全失效），插件崩在加载时。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

export const name = 'dsh-theme'
/** 挂路由前必须先有 webServer 服务。 */
export const inject = ['webServer']

const ROUTE_PREFIX = '/api/dsh-theme'
/** 默认状态：插件启用时主题默认 ON（M5 功能契约）。 */
const DEFAULT_ENABLED = true
/** 构建产物，与 lib/client.js 相对定位；插件自注入时不依赖 skin-center。 */
const THEME_CSS_FILE = fileURLToPath(new URL('../assets/theme.css', import.meta.url))

/** M6 Deepy 素材目录（构建生成物：8 态 *.png + deepy.json），同样相对定位。 */
const DEEPY_ASSET_DIR = fileURLToPath(new URL('../assets/deepy', import.meta.url))
/**
 * 素材路由前缀。**必须 kind:'prefix'，不能是 'exact'**：dsh-host-webserver 的 exact 是
 * pathname 严格相等匹配（lib/index.js:177-184 的表选择、:322-331 的 match()），框架没有
 * 参数化路由，<name> 那一段只能由 handler 从 pathname 里切出来自己校验。
 *
 * 冲突检查：本前缀与本插件现有两条 exact 路由（/state、/theme.css）路径不相等，且框架把
 * exact 与 prefix 分两张表存放（:148-149），故互不干扰；将来再加路由时留意 prefix 表的
 * 重复注册会 throw（:179）。
 */
const DEEPY_ROUTE_PREFIX = ROUTE_PREFIX + '/deepy'
/** 素材白名单：小写字母开头，只允许 .png / .json。正则本身不含分隔符与点号。 */
const DEEPY_NAME_RE = /^[a-z][a-z0-9-]*\.(png|json)$/
const DEEPY_CONTENT_TYPES = { '.png': 'image/png', '.json': 'application/json; charset=utf-8' }

/**
 * 把 URL 里的素材残段解析成「绝对且仍在资产目录内」的文件路径。**纯函数，不做 IO。**
 *
 * @param {string} rawSegment - 前缀之后、**解码前**的 pathname 残段。框架用 URL.pathname
 *   做匹配、不做 percent 解码，所以这里拿到的是 %2e%2e%2f 这种形态。
 * @param {string} [baseDir] - 资产目录，仅供测试注入。
 * @returns {{ok:true,name:string,file:string,contentType:string}|{ok:false,reason:string}}
 */
export function resolveDeepyAsset(rawSegment, baseDir = DEEPY_ASSET_DIR) {
  if (typeof rawSegment !== 'string' || rawSegment === '') return { ok: false, reason: 'empty-name' }
  // 只解码一次：解两次会让 %252e%252f 还原成 ../，等于自己开一个绕过。
  let name
  try { name = decodeURIComponent(rawSegment) } catch { return { ok: false, reason: 'malformed-encoding' } }
  if (!DEEPY_NAME_RE.test(name)) return { ok: false, reason: 'name-not-whitelisted' }
  const base = path.resolve(baseDir)
  const file = path.resolve(base, name)
  // 契约要求「path.resolve 后仍在资产目录内」：正则已排除分隔符，这里是第二道防线。
  const rel = path.relative(base, file)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, reason: 'outside-asset-dir' }
  return { ok: true, name, file, contentType: DEEPY_CONTENT_TYPES[path.extname(name)] }
}

/** M7 图标数据目录（icon-map.json 是构建生成物、lucide.json 是 lucide-static 构建产物）。 */
const ICON_ASSET_DIR = fileURLToPath(new URL('../assets/icons', import.meta.url))
/** 图标数据路由前缀。同样必须 kind:'prefix'（框架没有参数化路由）。 */
const ICON_ROUTE_PREFIX = ROUTE_PREFIX + '/icons'
/** 白名单：小写字母开头、只允许 .json。正则本身不含分隔符与点号。 */
const ICON_NAME_RE = /^[a-z][a-z0-9-]*\.json$/

/**
 * 把 URL 残段解析成「绝对且仍在图标目录内」的文件路径。**纯函数，不做 IO。**
 * 与 resolveDeepyAsset 同一套加固：只解码一次（解两次会让 %252e%252f 还原成 ../）、
 * 正则白名单、path.resolve 后仍在目录内。
 *
 * @param {string} rawSegment - 前缀之后、**解码前**的 pathname 残段。
 * @param {string} [baseDir] - 资产目录，仅供测试注入。
 * @returns {{ok:true,name:string,file:string,contentType:string}|{ok:false,reason:string}}
 */
export function resolveIconAsset(rawSegment, baseDir = ICON_ASSET_DIR) {
  if (typeof rawSegment !== 'string' || rawSegment === '') return { ok: false, reason: 'empty-name' }
  let name
  try { name = decodeURIComponent(rawSegment) } catch { return { ok: false, reason: 'malformed-encoding' } }
  if (!ICON_NAME_RE.test(name)) return { ok: false, reason: 'name-not-whitelisted' }
  const base = path.resolve(baseDir)
  const file = path.resolve(base, name)
  const rel = path.relative(base, file)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return { ok: false, reason: 'outside-asset-dir' }
  return { ok: true, name, file, contentType: 'application/json; charset=utf-8' }
}

/** $DSH_HOME，缺省 ~/.dsh。与 dsh-claude-style 的 harness-home 同口径。 */
function harnessHome(ctx) {
  const resolvePath = typeof ctx?.get === 'function' ? ctx.get('dshHomePath') : undefined
  if (typeof resolvePath === 'function') return resolvePath()
  return process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
}
function stateFile(ctx) {
  return path.join(harnessHome(ctx), 'dsh-theme', 'state.json')
}

/**
 * 读状态。任何异常都降级到默认值——状态文件坏掉不该让 GUI 起不来。
 * @returns {{ enabled: boolean, source: 'file'|'default' }}
 */
export function readState(ctx) {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(ctx), 'utf8'))
    if (typeof parsed?.enabled === 'boolean') return { enabled: parsed.enabled, source: 'file' }
  } catch {
    /* 首次运行或文件损坏 → 默认值 */
  }
  return { enabled: DEFAULT_ENABLED, source: 'default' }
}

/** 原子写状态（临时文件 + rename），返回写入后的状态。 */
export function writeState(ctx, enabled) {
  const file = stateFile(ctx)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify({ enabled: !!enabled, updatedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, file)
  return { enabled: !!enabled, source: 'file' }
}

function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
/**
 * 统一 404：非法名、越界、目录里不存在，三者在响应上**完全不可区分**——
 * 少一个探测面，也不泄露资产目录是否存在。响应体固定，不回显任何路径细节。
 */
function writeNotFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  res.end('not found')
}
function readJsonBody(req, limit = 16384) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) { resolve(null); req.destroy(); return }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { resolve(null) }
    })
    req.on('error', () => resolve(null))
  })
}
/** 同源校验：跨站页面不得改本机主题状态。 */
function sameOrigin(req) {
  const origin = req.headers?.origin
  if (typeof origin !== 'string' || origin === '') return true
  try { return new URL(origin).host === req.headers?.host } catch { return false }
}

/**
 * @param ctx - cordis context。
 */
export function apply(ctx) {
  try {
    ctx.effect(() => {
      const disposers = []
      try {
        disposers.push(ctx.webServer.register({
          kind: 'exact',
          path: ROUTE_PREFIX + '/state',
          handler: async (req, res) => {
            if (req.method === 'GET') {
              const state = readState(ctx)
              writeJson(res, 200, { ok: true, enabled: state.enabled, source: state.source })
              return
            }
            if (req.method === 'POST') {
              if (!sameOrigin(req)) { writeJson(res, 403, { ok: false, error: 'cross-origin' }); return }
              const body = await readJsonBody(req)
              if (body === null || typeof body.enabled !== 'boolean') {
                writeJson(res, 400, { ok: false, error: 'enabled-must-be-boolean' })
                return
              }
              writeJson(res, 200, { ok: true, ...writeState(ctx, body.enabled) })
              return
            }
            writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
          },
        }))
        disposers.push(ctx.webServer.register({
          kind: 'exact',
          path: ROUTE_PREFIX + '/theme.css',
          handler: (_req, res) => {
            try {
              const css = fs.readFileSync(THEME_CSS_FILE)
              res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' })
              res.end(css)
            } catch (error) {
              console.error('[dsh-theme] theme.css unreadable:', error)
              res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
              res.end('theme.css missing; run node scripts/build-skin.mjs')
            }
          },
        }))
        // M6 Deepy 素材。只读、无副作用，故不做 sameOrigin 校验（同源校验只防跨站写，
        // 防不了路径穿越——穿越防护全在 resolveDeepyAsset 里）。
        disposers.push(ctx.webServer.register({
          kind: 'prefix',
          path: DEEPY_ROUTE_PREFIX,
          handler: (req, res) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
              return
            }
            // 框架算过 rawPath 却没传给 handler，这里按同样口径再算一次：
            // 去掉 query、保留 percent 编码，再切掉路由前缀。
            const pathname = new URL(req.url ?? '/', 'http://x').pathname
            const asset = resolveDeepyAsset(pathname.slice(DEEPY_ROUTE_PREFIX.length + 1))
            if (!asset.ok) {
              // 客户端发了非法名是正常 4xx，不是本机故障，故不进 console.error
              //（M6 验收要求 console 零错，且探针会把日志刷满）。
              writeNotFound(res)
              return
            }
            try {
              const body = fs.readFileSync(asset.file)
              res.writeHead(200, { 'content-type': asset.contentType, 'cache-control': 'no-store' })
              res.end(body)
            } catch (error) {
              // 素材还没构建出来 = 对客户端同样是不存在；其余 IO 故障才算本机故障。
              if (error?.code === 'ENOENT') { writeNotFound(res); return }
              console.error('[dsh-theme] deepy asset unreadable:', error)
              res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
              res.end('deepy asset unreadable')
            }
          },
        }))
        // M7 图标数据。只读、无副作用，与 deepy 同口径：不做 sameOrigin 校验
        //（同源校验只防跨站写，防不了路径穿越——穿越防护全在 resolveIconAsset 里）。
        disposers.push(ctx.webServer.register({
          kind: 'prefix',
          path: ICON_ROUTE_PREFIX,
          handler: (req, res) => {
            if (req.method !== 'GET' && req.method !== 'HEAD') {
              writeJson(res, 405, { ok: false, error: 'method-not-allowed' })
              return
            }
            const pathname = new URL(req.url ?? '/', 'http://x').pathname
            const asset = resolveIconAsset(pathname.slice(ICON_ROUTE_PREFIX.length + 1))
            if (!asset.ok) { writeNotFound(res); return }
            try {
              const body = fs.readFileSync(asset.file)
              res.writeHead(200, { 'content-type': asset.contentType, 'cache-control': 'no-store' })
              res.end(body)
            } catch (error) {
              if (error?.code === 'ENOENT') { writeNotFound(res); return }
              console.error('[dsh-theme] icon data unreadable:', error)
              res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
              res.end('icon data unreadable')
            }
          },
        }))
      } catch (error) {
        for (const dispose of disposers) dispose()
        throw error
      }
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-theme: state + theme.css + deepy asset + icon data routes')
  } catch (error) {
    // 路由挂不上不该把整个 GUI 的 boot 带下去（skin-center 同口径）。
    console.error('[dsh-theme] failed to mount state routes:', error)
  }
}
