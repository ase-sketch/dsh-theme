/**
 * dsh-theme · 今日工作台纯函数回归。
 * 运行：node plugins/dsh-theme/test/today.test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_PATH = path.resolve(HERE, '..', 'lib', 'client.js')
let client
const sandbox = {}
globalThis.window = sandbox
globalThis.document = { head: { appendChild() {} }, getElementById: () => null }
sandbox.__ModuleLoader__ = {
  load(spec) {
    client = spec.factory((name) => {
      if (name === 'react') return { createElement: () => null, useState: () => [null, () => {}], useEffect: () => {} }
      throw new Error('unexpected require: ' + name)
    })
  },
}
;(0, eval)(fs.readFileSync(CLIENT_PATH, 'utf8'))

const T = client.__today
assert.ok(T)
const now = new Date(2026, 9, 31, 13, 5, 0, 0)
assert.equal(T.formatClock(now), '13:05')
assert.equal(T.formatDate(now), '10月31日，星期六')
assert.equal(T.formatClock(new Date(2026, 0, 2, 8, 9)), '08:09')

const october = T.calendar(now, T.monthStart(now))
assert.equal(october.year, 2026)
assert.equal(october.month, 10)
assert.equal(october.days.length, 42)
assert.equal(october.days[3].day, 1)
assert.equal(october.days[3].inMonth, true)
assert.equal(october.days[33].day, 31)
assert.equal(october.days[33].isToday, true)
assert.equal(october.days.filter((day) => day.isToday).length, 1)
assert.equal(october.days[0].inMonth, false)

const november = T.calendar(now, new Date(2026, 10, 1, 12))
assert.equal(november.month, 11)
assert.equal(november.days.some((day) => day.isToday && day.inMonth), false)
assert.equal(T.weatherLabel(0), '晴')
assert.equal(T.weatherLabel(3), '多云')
assert.equal(T.weatherLabel(61), '雨')
assert.equal(T.weatherLabel(95), '雷暴')
assert.equal(T.weatherLabel(999), '天气未知')
assert.equal(T.weatherKind(0), 'clear')
assert.equal(T.weatherKind(3), 'cloud')
assert.equal(T.weatherKind(61), 'rain')
assert.equal(T.weatherKind(71), 'snow')
assert.equal(T.forecastLabel('2026-10-31', 0), '今天')
assert.equal(T.forecastLabel('2026-11-01', 1), '周日')
assert.equal(T.locationLabel({ name: '上海', admin1: '上海市', country: '中国' }), '上海 · 上海市 · 中国')
assert.equal(T.locationLabel({ name: '上海', admin1: '上海', country: '中国' }), '上海 · 中国')

console.log('passed: 29')
console.log('failed: 0')
console.log('RESULT: PASS')
