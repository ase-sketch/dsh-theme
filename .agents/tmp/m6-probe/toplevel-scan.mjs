import fs from 'node:fs'
// 顶层声明扫描：把 factory 函数体整段挖掉后，看剩下的代码里还有没有 const/let/function。
// 用法：node toplevel-scan.mjs <file>
const file = process.argv[2]
const src = fs.readFileSync(file, 'utf8')
// 策略：逐行扫描，跟踪花括号深度；深度 0 的行里出现 const/let/function 即违规。
// factory 箭头函数体从 'factory: (require) => {' 开始，其 { 使深度变 1。
let depth = 0
let line = 0
const violations = []
let inBlockComment = false
for (const raw of src.split(/\r?\n/)) {
  line += 1
  let text = raw
  if (inBlockComment) {
    const end = text.indexOf('*/')
    if (end === -1) continue
    text = text.slice(end + 2)
    inBlockComment = false
  }
  const start = text.indexOf('/*')
  if (start !== -1 && text.indexOf('*/', start) === -1) { inBlockComment = true; text = text.slice(0, start) }
  // strip line comments and strings (rough but adequate for declaration detection)
  text = text.replace(/\/\/.*$/, '').replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""').replace(/`[^`]*`/g, '``')
  if (depth === 0) {
    if (/(^|[;{}\s])(const|let|var|function|class)\s/.test(text)) {
      violations.push({ line, text: raw.trim().slice(0, 120) })
    }
  }
  for (const ch of text) {
    if (ch === '{') depth += 1
    else if (ch === '}') depth -= 1
  }
}
console.log(JSON.stringify({ file, topLevelViolations: violations }, null, 1))
process.exit(violations.length === 0 ? 0 : 1)
