import fs from 'node:fs'
import path from 'node:path'
const ROOT = 'C:/Users/pass/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai'
const needles = ['turn/end', 'turn/start', 'step/start', 'tool/call', 'tool/result', 'assistant/message']
const pkgs = ['dsh-session', 'dsh-agent', 'dsh-agent-loop', 'dsh-api-session-controller']
for (const p of pkgs) {
  const dir = path.join(ROOT, p, 'lib/types')
  const out = []
  const walk = (d) => {
    let e; try { e = fs.readdirSync(d, { withFileTypes: true }) } catch { return }
    for (const x of e) {
      const q = path.join(d, x.name)
      if (x.isDirectory()) walk(q)
      else if (x.name.endsWith('.d.ts')) out.push(q)
    }
  }
  walk(dir)
  for (const f of out) {
    const t = fs.readFileSync(f, 'utf8')
    const hits = needles.filter(n => t.includes("'" + n + "'") || t.includes('"' + n + '"'))
    if (hits.length) console.log(p, path.relative(dir, f), '=>', hits.join(','))
  }
}
