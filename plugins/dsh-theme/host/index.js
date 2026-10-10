/**
 * dsh-theme — host 半。
 *
 * 职责（M5 三层开关里的 L2 层）：**开关状态的所有权在这里**。
 * client 半只发 HTTP 请求，从不自己决定状态、也从不落盘。
 *
 * 两条路由（前缀 /api/dsh-theme/，与 skin-center 的 /api/skin-center/v2/ 平行、不冲突）：
 *   GET  /api/dsh-theme/state       读开关状态
 *   POST /api/dsh-theme/state       写开关状态（body: {"enabled": true|false}）
 *   GET  /api/dsh-theme/theme.css   送出构建产物 assets/theme.css（插件版自包含样式）
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
      } catch (error) {
        for (const dispose of disposers) dispose()
        throw error
      }
      return () => {
        for (const dispose of disposers) dispose()
      }
    }, 'dsh-theme: state routes')
  } catch (error) {
    // 路由挂不上不该把整个 GUI 的 boot 带下去（skin-center 同口径）。
    console.error('[dsh-theme] failed to mount state routes:', error)
  }
}
