
// ── 分组 3：tool/call 计数（callId 配对是承重的） ──────────────────────
{
  let s = fresh()
  s = run(s, ev('tool/call', { callId: 'a' })); eq('1 个活跃工具 -> typing', s.base, 'typing')
  s = run(s, ev('tool/call', { callId: 'b' })); eq('2 个活跃工具 -> music', s.base, 'music')
  s = run(s, ev('tool/call', { callId: 'c' })); eq('3 个活跃工具 -> building', s.base, 'building')
  s = run(s, ev('tool/call', { callId: 'd' })); eq('4 个活跃工具 -> building', s.base, 'building')
  s = run(s, ev('tool/call', { callId: 'a' })); eq('重复 callId 不重复计数', s.activeTools.length, 4)

  // 正确配对：用 message.toolCallId
  const s2 = run(s, ev('tool/result', { message: { isError: false, toolCallId: 'a' } }))
  eq('用 toolCallId 配对 -> 计数下降到 3', s2.activeTools.length, 3)
  eq('仍是 building（>=3）', s2.base, 'building')

  // 故意用错字段（data.callId）——配对必须失败，计数不下降
  const wrong = run(s, ev('tool/result', { callId: 'a', message: { isError: false } }))
  eq('用错字段 data.callId -> 计数不下降（配对是承重的）', wrong.activeTools.length, 4)
  eq('计数未降到 3', wrong.activeTools.length === 3, false)

  // 降到 1 应回 typing
  const s3 = run(s2, ev('tool/result', { message: { isError: false, toolCallId: 'b' } }))
  eq('降到 2 -> music', s3.base, 'music')
  const s4 = run(s3, ev('tool/result', { message: { isError: false, toolCallId: 'c' } }))
  eq('降到 1 -> typing', s4.base, 'typing')

  // turn/end 清零
  const s5 = run(s4, ev('turn/end', { reason: { kind: 'aborted' } }))
  eq('turn/end 清零活跃工具', s5.activeTools.length, 0)
}

// ── 分组 4：live-chunk ────────────────────────────────────────────────
{
  eq('reasoning-delta -> thinking', run(fresh(), tr('assistant/live-chunk', { chunk: { type: 'reasoning-delta' } })).base, 'thinking')
  eq('text-delta -> typing', run(fresh(), tr('assistant/live-chunk', { chunk: { type: 'text-delta' } })).base, 'typing')
  const before = run(fresh(), ev('turn/start', {}))
  for (const t of ['block-start', 'block-end', 'usage', 'finish', 'tool-call-delta']) {
    const after = run(before, tr('assistant/live-chunk', { chunk: { type: t } }))
    eq('chunk ' + t + ' 不改变状态', after.base, before.base)
  }
  const noChunk = run(before, tr('assistant/live-chunk', {}))
  eq('live-chunk 无 chunk 字段不崩', noChunk.base, 'thinking')
}

// ── 分组 5：窗口形状（settle-assistant 无 entries / 小数 seq） ────────
{
  // 投影层不接收 change 对象；这里验证「settle-assistant 无 entries」时调用方不崩，
  // 即：把 undefined entry 传进来应返回等价状态而不是抛错。
  let threw = false
  let out = null
  try { out = D.project(fresh(), undefined, T0) } catch (e) { threw = true }
  check('project(undefined) 不抛错', !threw)
  eq('project(undefined) 返回等价状态', out && out.base, 'idle')
  const noEvent = D.project(fresh(), { type: 'transient' }, T0)
  eq('entry 无 event 字段也不崩', noEvent.base, 'idle')

  // 小数 seq（transient 事件实测 seq 形如 18.979166666666668）：不应被当整数索引。
  // 投影只读 event.data，不读 seq，因此这里断言「带小数 seq 的事件照常投影」。
  const fractional = { type: 'transient', event: { type: 'assistant/live-chunk', seq: 18.979166666666668, data: { chunk: { type: 'text-delta' } } } }
  eq('小数 seq 的事件照常投影', D.project(fresh(), fractional, T0).base, 'typing')
}

// ── 分组 6：跨会话档位 ────────────────────────────────────────────────
{
  eq('空 Map -> null（由焦点会话决定）', D.concurrencyState(new Map(), null), null)
  eq('null 状态源 -> null', D.concurrencyState(null, null), null)
  eq('非 Map 对象 -> null', D.concurrencyState({}, null), null)

  function mk(entries) { const m = new Map(); for (const [id, running] of entries) m.set(id, { running, pendingInteraction: undefined, completionUnread: false }); return m }
  const list = (rows) => ({ byId: rows })

  eq('1 个 running -> null', D.concurrencyState(mk([['s1', true]]), list({ s1: {} })), null)
  eq('2 个 running -> music', D.concurrencyState(mk([['s1', true], ['s2', true]]), list({ s1: {}, s2: {} })), 'music')
  eq('3 个 running -> building', D.concurrencyState(mk([['s1', true], ['s2', true], ['s3', true]]), list({ s1: {}, s2: {} })), 'building')
  eq('running=false 不计数', D.concurrencyState(mk([['s1', true], ['s2', false]]), list({})), null)
  eq('running=undefined 不计数', D.concurrencyState(mk([['s1', true], ['s2', undefined]]), list({})), null)

  // origin 过滤（防御性：SessionStatus 无 origin，取自 sessions.list.byId）
  eq('subagent 行被过滤（2 真 + 1 subagent）', D.concurrencyState(
    mk([['s1', true], ['s2', true], ['sub', true]]),
    list({ s1: {}, s2: {}, sub: { origin: 'subagent' } })
  ), 'music')
  eq('subagent 行被过滤（3 真 + 2 subagent 仍 building）', D.concurrencyState(
    mk([['s1', true], ['s2', true], ['s3', true], ['x', true], ['y', true]]),
    list({ s1: {}, s2: {}, s3: {}, x: { origin: 'subagent' }, y: { origin: 'subagent' } })
  ), 'building')
  eq('缺行视为非 subagent（计入）', D.concurrencyState(
    mk([['s1', true], ['s2', true]]), list({})
  ), 'music')
  eq('list 为 null 时全部计入', D.concurrencyState(mk([['s1', true], ['s2', true]]), null), 'music')
}
