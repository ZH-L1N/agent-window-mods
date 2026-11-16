import { expect, test } from 'claude-code/testing'

import type { SendConfig, SendSeen } from '../types'
import { CONFIG_PATH, EXAMPLE, NEVER_MS, PANE, SLACK_DRAFT, SLACK_SEND, cardText, mountCard, pressCard, world } from './test-kit'

const HELLO = { channel: '#general', text: 'Hi <@U123> and @sam, ship by 2026-11-20 or Friday 3:30 pm <!here>' }
const DENY_CANCEL =
  'Send Gate held this message and did not send it: the user chose Cancel (or dismissed the dialog). Do not retry it unless the user asks you to.'
const FAILED = 'Send Gate failed while checking this call and refused it. Do not retry it unless the user asks you to.'
const PERSON_ONLY = 'Only the person can answer a hold.'
const JUST_APPEARED = 'A new hold just appeared: read it, then answer again.'

const recent = (w: { state: (key: string) => unknown }) => (w.state('recent') ?? []) as SendSeen[]

test('register 1: bypass mode: a message is held, Send once sends it', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  expect(w.state('mode')).toBe('bypassPermissions')
  expect(w.state('modeFrom')).toBe('event')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.sent).toEqual([])
  expect(w.opened).toHaveLength(1)
  expect(w.opened[0]).toMatchObject({ id: PANE, title: 'Send Gate', focus: true })
  expect(w.notified).toEqual([{ text: 'Would send a message', title: 'Send Gate: holding' }])
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(true)
  expect(r.deny).toBeUndefined()
  expect(w.sent).toEqual([{ tool: SLACK_SEND, args: HELLO }])
  expect(w.closed).toContain(PANE)
  expect(recent(w)[0]).toMatchObject({ tool: SLACK_SEND, kind: 'message', verdict: 'sent', target: 'channel: #general' })
  // One call per approval: the same send is held again.
  const again = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.sent).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await again).isRun).toBe(false)
})

test('register 2: Cancel refuses', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(r.deny).toBe(DENY_CANCEL)
  expect(w.sent).toEqual([])
  expect(recent(w)[0]).toMatchObject({ verdict: 'denied', kind: 'message', why: 'the user chose Cancel (or dismissed the dialog)' })
})

test('register 2b: no answer refuses', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(119_000)
  expect(w.sent).toEqual([])
  await w.clock.advance(2_000)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(r.deny).toBe(
    'Send Gate held this message and did not send it: no answer within 120 seconds. Do not retry it unless the user asks you to.',
  )
  expect(w.asked).toEqual([])
  expect(w.closed).toContain(PANE)
})

test('register 2c: the timeoutSeconds option sets the limit', { options: { timeoutSeconds: 20 } }, async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(await cardText($)).toContain('Refused after 20 s.')
  await w.clock.advance(20_500)
  expect((await call).deny).toContain('no answer within 20 seconds')
})

test('register 3: default mode is not gated', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('default')
  const r = await w.call(SLACK_SEND, HELLO)
  expect(r.isRun).toBe(true)
  expect(w.opened).toEqual([])
  expect(w.asked).toEqual([])
  expect(recent(w)[0]).toMatchObject({ tool: SLACK_SEND, kind: 'message', verdict: 'not-gated' })
  // The other modes that ask or stop are not gated either.
  for (const mode of ['acceptEdits', 'plan', 'dontAsk', 'auto']) {
    await w.prompt(mode)
    expect((await w.call(SLACK_SEND, HELLO)).isRun, mode).toBe(true)
  }
  expect(w.opened).toEqual([])
})

test('register 4: an unknown mode is gated', async ($, on) => {
  const w = await world($, on, { permissions: 'throw' })
  await w.start()
  expect(w.state('mode')).toBe('unknown')
  expect(w.state('modeFrom')).toBe('none')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).deny).toBe(DENY_CANCEL)
  // A mode name the mod does not know is unknown too.
  await w.prompt('somethingNew')
  expect(w.state('mode')).toBe('unknown')
  const odd = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.opened).toHaveLength(2)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await odd).isRun).toBe(false)
})

test('register 4b: no settings and no event is unknown, and gated', async ($, on) => {
  const w = await world($, on)
  await w.start()
  expect(w.state('mode')).toBe('unknown')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
})

test('register 5: the configured default counts until an event says otherwise', async ($, on) => {
  const w = await world($, on, { permissions: { defaultMode: 'acceptEdits', allow: [] } })
  await w.start()
  expect(w.state('mode')).toBe('acceptEdits')
  expect(w.state('modeFrom')).toBe('settings')
  expect((await w.call(SLACK_SEND, HELLO)).isRun).toBe(true)
  await w.prompt('bypassPermissions')
  expect(w.state('modeFrom')).toBe('event')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
  // A tool result and the end of a turn carry the mode too.
  await $.classic.PostToolUse({ permission_mode: 'default', tool_name: 'Read', tool_input: {}, tool_response: {}, tool_use_id: 't1' } as never)
  expect(w.state('mode')).toBe('default')
  await $.classic.Stop({ permission_mode: 'bypassPermissions', stop_hook_active: false } as never)
  expect(w.state('mode')).toBe('bypassPermissions')
})

test('register 5b: a settings default of bypass is gated; a permissions value that is not an object is unknown', async ($, on) => {
  const w = await world($, on, { permissions: { defaultMode: 'bypassPermissions' } })
  await w.start()
  expect(w.state('mode')).toBe('bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
})

test('register 5c: permissions with no string defaultMode leave the mode unknown', async ($, on) => {
  const w = await world($, on, { permissions: { defaultMode: 3 } })
  await w.start()
  expect(w.state('mode')).toBe('unknown')
  expect(w.state('modeFrom')).toBe('none')
})

test('register 5d: a first session start with no stored mode takes the settings default until an event', async ($, on) => {
  const w = await world($, on, { permissions: { defaultMode: 'default' } })
  await w.start()
  expect(w.state('mode')).toBe('default')
  expect(w.state('modeFrom')).toBe('settings')
  expect((await w.call(SLACK_SEND, HELLO)).isRun).toBe(true)
  expect(w.opened).toEqual([])
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
})

test('register 5e: a session start again after an event keeps the event\'s mode over the settings', async ($, on) => {
  const w = await world($, on, { permissions: { defaultMode: 'default' } })
  await w.start()
  await w.prompt('bypassPermissions')
  // A reload, an enable or a worker respawn runs session.start again; the settings never saw the live mode.
  await w.start()
  expect(w.state('mode')).toBe('bypassPermissions')
  expect(w.state('modeFrom')).toBe('event')
  expect(await w.command('status')).toContain('Mode: bypassPermissions (from a session event) · gated')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.sent).toEqual([])
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).deny).toBe(DENY_CANCEL)
  // An event still sets the mode at any time.
  await w.prompt('default')
  await w.start()
  expect(w.state('mode')).toBe('default')
  expect((await w.call(SLACK_SEND, HELLO)).isRun).toBe(true)
})

test('register 5f: a session start that cannot read the stored mode leaves it unknown, which is gated', async ($, on) => {
  let isDown = false
  const w = await world($, on, { permissions: { defaultMode: 'default' }, isStateDown: () => isDown })
  await w.start()
  await w.prompt('bypassPermissions')
  isDown = true
  await w.start()
  isDown = false
  expect(await w.command('status')).toContain('Mode: unknown')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.sent).toEqual([])
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).deny).toBe(DENY_CANCEL)
})

test('register 6: a draft is never held', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const r = await w.call(SLACK_DRAFT, HELLO)
  expect(r.isRun).toBe(true)
  expect(w.opened).toEqual([])
  expect(recent(w)).toEqual([])
  // Nor is a read.
  expect((await w.call('mcp__notes__get_page', { id: 'p1' })).isRun).toBe(true)
  expect(w.opened).toEqual([])
})

test('register 7: a subagent\'s send is held', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO, { agentId: 'a1' })
  await w.clock.advance(500)
  expect(w.sent).toEqual([])
  expect(await cardText($)).toContain('From a subagent')
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(true)
})

test('register 7b: a subagent\'s event does not set the mode', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  await w.prompt('default', 'agent-1')
  expect(w.state('mode')).toBe('bypassPermissions')
  await $.classic.PostToolUse({ permission_mode: 'default', agent_id: 'agent-1', tool_name: 'Read', tool_input: {}, tool_response: {}, tool_use_id: 't1' } as never)
  expect(w.state('mode')).toBe('bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
})

test('register 8: /send-gate send needs the person', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  for (const origin of ['plugin', 'sdk', 'peer'] as const) {
    expect(await w.command('send', origin)).toBe(PERSON_ONLY)
    expect(await w.command('cancel', origin)).toBe(PERSON_ONLY)
  }
  await w.clock.advance(1000)
  expect(w.sent).toEqual([])
  expect(await w.command('send', 'bridge')).toBe('Sending it once.')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(true)
  expect(await w.command('send')).toBe('No hold is pending.')

  const second = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(await w.command('cancel')).toBe('Cancelled: the call is refused.')
  await w.clock.advance(500)
  expect((await second).deny).toBe(DENY_CANCEL)
})

test('register 8b: /send-gate send approves only a hold that has been on screen long enough to read', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(250)
  expect(await w.command('send')).toBe(JUST_APPEARED)
  await w.clock.advance(500)
  expect(w.sent).toEqual([])
  expect(await w.command('send')).toBe(JUST_APPEARED)
  await w.clock.advance(1000)
  expect(w.sent).toEqual([])
  expect(await w.command('send')).toBe('Sending it once.')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(true)
  expect(w.sent).toHaveLength(1)

  // Cancel answers at once.
  const second = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(250)
  expect(await w.command('cancel')).toBe('Cancelled: the call is refused.')
  await w.clock.advance(500)
  expect((await second).deny).toBe(DENY_CANCEL)
  expect(w.sent).toHaveLength(1)
})

test('register 8c: /send-gate send never approves a hold that was waiting behind the one on screen', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const first = w.call(SLACK_SEND, { channel: '#first', text: 'one' })
  await w.clock.advance(250)
  const second = w.call(SLACK_SEND, { channel: '#second', text: 'two' })
  await w.clock.advance(2000)
  expect(w.opened).toHaveLength(1)
  expect(await w.command('send')).toBe('Sending it once.')
  await w.clock.advance(500)
  expect((await first).isRun).toBe(true)
  // The waiting hold has just taken the slot: a send typed for the first one approves nothing.
  expect(w.opened).toHaveLength(2)
  expect(await w.command('send')).toBe(JUST_APPEARED)
  await w.clock.advance(500)
  expect(w.sent.map(s => s.args.channel)).toEqual(['#first'])
  expect(await cardText($)).toContain('To channel: #second')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await second).deny).toBe(DENY_CANCEL)
  expect(w.sent.map(s => s.args.channel)).toEqual(['#first'])
})

test('register 9: a failing gate refuses', async ($, on) => {
  let isDown = false
  const w = await world($, on, { isStateDown: () => isDown })
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  isDown = true
  await pressCard($, 'hold-run')
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(w.sent).toEqual([])
  expect(r.deny).toBe(FAILED)
})

test('register 9b: a hold that cannot open its pane refuses', async ($, on) => {
  const w = await world($, on, { isOpenBroken: true })
  await w.start()
  await w.prompt('bypassPermissions')
  const r = await w.call(SLACK_SEND, HELLO)
  expect(r.isRun).toBe(false)
  expect(r.deny).toBe('Send Gate held this message and did not send it: the hold failed. Do not retry it unless the user asks you to.')
})

test('register 10: the card shows the target, mentions and dates', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, { ...HELLO, text: `${HELLO.text}\u001b[2J` })
  await w.clock.advance(500)
  const card = await cardText($)
  expect(card).toContain('■ Send Gate')
  expect(card).toContain('Would send a message')
  expect(card).toContain(`Tool ${SLACK_SEND}`)
  expect(card).toContain('To channel: #general')
  expect(card).toContain('Mentions <@U123>, @sam, <!here>')
  expect(card).toContain('Dates 2026-11-20, Friday, 3:30 pm')
  expect(card).toContain(`Text ${HELLO.text}[2J`)
  expect(card).not.toContain('\u001b')
  expect(card).not.toContain('From a subagent')
  expect(card).toContain('Enter or 2 cancels. Tab then Enter sends it once. Refused after 120 s. Twins: /send-gate send, /send-gate cancel.')
  const ui = await mountCard($)
  expect(await ui.find({ key: 'hold-cancel' })).toMatchObject({ props: { label: 'Cancel', hotkey: '2', autoFocus: true } })
  const run = await ui.find({ key: 'hold-run' })
  expect(run?.props).toMatchObject({ label: 'Send once' })
  expect((run?.props as { hotkey?: string } | undefined)?.hotkey).toBeUndefined()
  await ui.unmount()
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  await call
  // No hold: the card says so.
  expect(await cardText($)).toBe('No hold is pending.')
})

test('register 10b: an email with no mentions and no dates says none', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call('mcp__claude_ai_Gmail__send_message', { to: 'sam@example.com', subject: 'Notes', body: 'Here are the notes.' })
  await w.clock.advance(500)
  const card = await cardText($)
  expect(card).toContain('Would send an email')
  expect(card).toContain('To to: sam@example.com · subject: Notes')
  expect(card).toContain('Mentions none')
  expect(card).toContain('Dates none')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).deny).toContain('Send Gate held this email and did not send it')
})

test('register 11: a configured tool is held with its fields, secrets masked', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call('mcp__deploy__set_env', { app: 'demo', API_KEY: 'abc', replicas: 2 })
  await w.clock.advance(500)
  const card = await cardText($)
  expect(card).toContain('Would call mcp__deploy__set_env')
  // Every field on one Also line (item A of the second fix round).
  expect(card).toContain('Also app: demo · API_KEY: •••• · replicas: 2')
  expect(card).not.toContain('abc')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).deny).toBe(
    'Send Gate held this call and did not send it: the user chose Cancel (or dismissed the dialog). Do not retry it unless the user asks you to.',
  )
  expect(w.notified[0]?.text).toBe('Would call mcp__deploy__set_env')
})

test('register 11b: a broken config holds every MCP tool that is not a read', async ($, on) => {
  const w = await world($, on, { configText: '{' })
  await w.start()
  await w.prompt('bypassPermissions')
  expect((w.state('config') as SendConfig).status).toBe('broken')
  expect(w.toasts.some(t => t.startsWith('send-gate: the config is broken'))).toBe(true)
  expect((await w.call('mcp__deploy__list_apps')).isRun).toBe(true)
  const call = w.call('mcp__deploy__update_app', { app: 'demo' })
  await w.clock.advance(500)
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
  expect(await w.command('status')).toContain('Config: BROKEN')
})

test('register 12: narrow terminal: the dialog path', async ($, on) => {
  const w = await world($, on, { isPlaced: false, answer: 'Send once' })
  await w.start()
  await w.prompt('bypassPermissions')
  const first = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect((await first).isRun).toBe(true)
  expect(w.asked).toHaveLength(1)
  expect(w.asked[0]?.options).toEqual(['Cancel', 'Send once'])
  expect(w.asked[0]?.header).toBe('Send Gate')
  expect(w.asked[0]?.question).toContain('Would send a message')
  expect(w.asked[0]?.question).toContain('To channel: #general')
  for (const answer of ['Cancel', 'dismiss', 'send once', 'Yes']) {
    w.setAnswer(answer)
    const call = w.call(SLACK_SEND, HELLO)
    await w.clock.advance(500)
    const r = await call
    expect(r.isRun, answer).toBe(false)
    expect(r.deny, answer).toBe(DENY_CANCEL)
  }
  expect(w.sent).toHaveLength(1)
})

test('register 12b: a dialog nobody answers is refused at the limit', { options: { timeoutSeconds: 20 } }, async ($, on) => {
  const w = await world($, on, { isPlaced: false, answer: 'never' })
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(21_000)
  expect((await call).deny).toContain('no answer within 20 seconds')
  await w.clock.advance(NEVER_MS)
  expect(w.sent).toEqual([])
})

test('register 13: a calendar invitation is held, with its attendees and times', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  // The connected calendar tool's own argument names.
  const call = w.call('mcp__cal__create_event', {
    summary: 'Review',
    description: 'see @sam tomorrow',
    attendees: [{ email: 'sam@example.com' }, { email: 'kim@example.com' }],
    startTime: '2026-11-20T15:00:00Z',
    endTime: '2026-11-20T16:00:00Z',
    calendarId: 'primary',
    sendUpdates: 'all',
  })
  await w.clock.advance(500)
  const card = await cardText($)
  expect(card).toContain('Would notify people through create_event')
  expect(card).toContain('To attendees: {"email":"sam@example.com"}, {"email":"kim@example.com"} · calendarId: primary')
  expect(card).toContain('Mentions @sam')
  expect(card).toContain('Dates tomorrow, 2026-11-20T15:00:00Z, 2026-11-20T16:00:00Z')
  expect(card).toContain('Also sendUpdates: all')
  // A line break inside the text is drawn as the mark (item C of the second fix round).
  expect(card).toContain('Text see @sam tomorrow⏎Review')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(false)
  expect(r.deny).toContain('held this notification')
  expect(recent(w)[0]).toMatchObject({ kind: 'notify', verdict: 'denied' })
})

test('register 13b: a saved draft\'s send names the draft and says its text is not in this call', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call('mcp__mail__send_message', { draftId: 'd-1' })
  await w.clock.advance(500)
  const card = await cardText($)
  expect(card).toContain('Would send an email')
  expect(card).toContain('To draftId: d-1')
  expect(card).toContain('Text not in this call')
  expect(card).not.toContain('Text none')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
})

test('register 14: /send-gate tools lists what is neither gated nor a read', async ($, on) => {
  const w = await world($, on, {
    tools: [
      { name: SLACK_SEND, description: 'Send.', mcp: true },
      { name: 'mcp__notes__get_page', description: 'Read.', mcp: true },
      { name: 'mcp__wiki__createPage', description: 'Publish.', mcp: true },
      { name: 'Bash', description: 'Shell.', mcp: false },
    ],
  })
  await w.start()
  const text = await w.command('tools')
  expect(text).toContain('mcp__wiki__createPage')
  expect(text).not.toContain(SLACK_SEND)
  expect(text).not.toContain('mcp__notes__get_page')
  expect(text).not.toContain('Bash')
})

test('register 14b: /send-gate tools when the list cannot be read', async ($, on) => {
  const w = await world($, on, { tools: 'throw' })
  await w.start()
  expect(await w.command('tools')).toBe('The tool list could not be read.')
})

test('register: /send-gate status, test, recent, reload, help and an unknown word', async ($, on) => {
  const w = await world($, on, { permissions: { defaultMode: 'default' } })
  await w.start()
  const status = await w.command('')
  expect(status).toContain('Mode: default (from the settings) · not gated')
  expect(status).toContain(`Config: none (no file at ${CONFIG_PATH})`)
  expect(status).toContain('No hold is pending.')
  await w.prompt('bypassPermissions')
  expect(await w.command('status')).toContain('Mode: bypassPermissions (from a session event) · gated')

  expect(await w.command(`test ${SLACK_SEND}`)).toBe(`${SLACK_SEND}: message`)
  expect(await w.command('test mcp__notes__get_page')).toBe('mcp__notes__get_page: not gated')
  expect(await w.command('test')).toContain('Usage: /send-gate')

  expect(await w.command('recent')).toBe('Nothing yet: no sending call was seen.')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(await w.command('status')).toContain('Hold pending: Would send a message (/send-gate send, /send-gate cancel)')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  await call
  expect(await w.command('recent')).toMatch(/^\d\d:\d\d:\d\d {2}denied {2}message {2}mcp__claude_ai_Slack__slack_send_message {2}channel: #general {2}\(the user chose Cancel/)

  expect(await w.command('reload')).toContain('Reloaded. Config: none')
  expect(await w.command('help')).toContain('/send-gate tools')
  expect(await w.command('bogus')).toContain('Usage: /send-gate')
})

test('register: the card is drawn on the terminal only, and a call before any session start is still gated', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE })
  const call = w.call('mcp__deploy__set_env', { app: 'demo' })
  await w.clock.advance(500)
  expect(w.opened).toHaveLength(1)
  const ui = await mountCard($, 100, 'desktop')
  expect(await ui.find({ key: 'hold-card' })).toBeUndefined()
  await ui.unmount()
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
})

// Second fix round: items A to G of PROVENANCE.md.

/** A message with five arguments no list knows. */
const FIVE_UNKNOWN = {
  channel: '#general',
  text: 'SECRET PLAN <!channel>',
  unfurl_links: false,
  unfurl_media: false,
  reply_broadcast: true,
  icon_emoji: ':x:',
  username: 'bot',
}
const ALSO_FIVE = 'Also unfurl_links: false · unfurl_media: false · reply_broadcast: true · icon_emoji: :x: · username: bot'

test('register A: narrow terminal: a message with five unknown arguments still shows its Text, then one Also line', async ($, on) => {
  const w = await world($, on, { isPlaced: false, answer: 'Cancel' })
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, FIVE_UNKNOWN)
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(false)
  const q = w.asked[0]?.question ?? ''
  const lines = q.split('\n')
  expect(lines).toEqual([
    'Send Gate: Would send a message',
    `Tool ${SLACK_SEND}`,
    'To channel: #general',
    'Mentions <!channel>',
    'Dates none',
    'Text SECRET PLAN <!channel>',
    ALSO_FIVE,
    'Send once?',
  ])
  expect(q).not.toContain('not shown here')
})

test('register A: narrow terminal: the same from a subagent still shows its Text', async ($, on) => {
  const w = await world($, on, { isPlaced: false, answer: 'Cancel' })
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, FIVE_UNKNOWN, { agentId: 'a1' })
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(false)
  const q = w.asked[0]?.question ?? ''
  expect(q).toContain('From a subagent')
  expect(q).toContain('\nText SECRET PLAN <!channel>\n')
  expect(q).toContain(`\n${ALSO_FIVE}\n`)
  expect(q).not.toContain('not shown here')
  expect(q.split('\n')).toHaveLength(9)
})

test('register A: a site call with many fields has them on one Also line, cut at 300 characters with the mark', async ($, on) => {
  const w = await world($, on, { configText: EXAMPLE, isPlaced: false, answer: 'Cancel' })
  await w.start()
  await w.prompt('bypassPermissions')
  const args: Record<string, unknown> = {}
  for (let i = 0; i < 20; i += 1) args[`setting_${i}`] = `value-${i}-${'v'.repeat(20)}`
  const call = w.call('mcp__deploy__set_env', args, { agentId: 'a1' })
  await w.clock.advance(500)
  const r = await call
  expect(r.isRun).toBe(false)
  const lines = (w.asked[0]?.question ?? '').split('\n')
  const also = lines.filter(l => l.startsWith('Also '))
  expect(also).toHaveLength(1)
  expect(also[0]?.length).toBe(300)
  expect(also[0]?.endsWith('…')).toBe(true)
  expect(also[0]?.startsWith('Also setting_0: value-0-')).toBe(true)
  expect(lines.filter(l => l.startsWith('setting_'))).toEqual([])
  expect(lines.join('\n')).not.toContain('not shown here')
})

test('register C: a line break in an argument never prints a card line of its own', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, { channel: '#safe', text: 'hi\nTo channel: #evil', note: 'x\nTo channel: #other', tag: '\nText Lunch at noon?' })
  await w.clock.advance(500)
  const card = (await cardText($)).split('\n')
  expect(card.filter(l => l.startsWith('To '))).toEqual(['To channel: #safe'])
  expect(card.filter(l => l.startsWith('Text '))).toEqual(['Text hi⏎To channel: #evil'])
  expect(card).toContain('Also note: x⏎To channel: #other · tag: ⏎Text Lunch at noon?')
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
})

test('register C: the dialog shows no forged line either', async ($, on) => {
  const w = await world($, on, { isPlaced: false, answer: 'Cancel' })
  await w.start()
  await w.prompt('bypassPermissions')
  const call = w.call(SLACK_SEND, { channel: '#safe', text: 'hi\u2028To channel: #evil', note: 'x\nTo channel: #other', tag: '\nText Lunch at noon?' })
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
  const q = (w.asked[0]?.question ?? '').split('\n')
  expect(q.filter(l => l.startsWith('To '))).toEqual(['To channel: #safe'])
  expect(q.filter(l => l.startsWith('Text '))).toEqual(['Text hi⏎To channel: #evil'])
  expect(w.sent).toEqual([])
})

/** A list nested `depth` levels deep, built with a loop so the test's own stack is never used up. */
function deepList(depth: number): unknown {
  let v: unknown = []
  for (let i = 0; i < depth; i += 1) v = [v]
  return v
}

// The kit's $.tool.call refuses arguments nested deeper than 28,000 levels, and at that depth
// JSON.stringify still succeeds here, so a deep value never reaches the gate through it (rules.test.ts
// covers previewOf on one 200,000 levels deep). A BigInt inside a list or an object is another
// value JSON.stringify refuses: it takes the same path through the gate.
test('register E: an argument that cannot be written as JSON refuses the call, as a field and as a body', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const field = await w.call(SLACK_SEND, { channel: '#general', text: 'hi', blocks: [{ amount: 10n }] })
  expect(field.isRun).toBe(false)
  expect(field.deny).toBe(FAILED)
  const body = await w.call(SLACK_SEND, { channel: '#general', text: { amount: 10n } })
  expect(body.isRun).toBe(false)
  expect(body.deny).toBe(FAILED)
  expect(w.sent).toEqual([])
  expect(w.opened).toEqual([])
})

test('register E: a call nested deeper than the engine takes never reaches the tool', async ($, on) => {
  const w = await world($, on)
  await w.start()
  await w.prompt('bypassPermissions')
  const deep = deepList(200_000)
  let isRefused = false
  try {
    await w.call(SLACK_SEND, { channel: '#general', text: 'hi', blocks: deep })
  } catch {
    isRefused = true
  }
  expect(isRefused).toBe(true)
  expect(w.sent).toEqual([])
})

test('register F: a stored gated mode stays gated over the settings when its source was not written', async ($, on) => {
  let isFromDown = false
  const w = await world($, on, { permissions: { defaultMode: 'default' }, isStateWriteDown: key => isFromDown && key === 'modeFrom' })
  await w.start()
  expect(w.state('modeFrom')).toBe('settings')
  isFromDown = true
  await w.prompt('bypassPermissions')
  isFromDown = false
  // The two writes were split: the store holds the event's mode with the settings as its source.
  expect(w.state('mode')).toBe('bypassPermissions')
  expect(w.state('modeFrom')).toBe('settings')
  await w.start()
  expect(await w.command('status')).toContain('Mode: bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.sent).toEqual([])
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).deny).toBe(DENY_CANCEL)
})

test('register F: nor can the launcher\'s variable open a stored gated mode', async ($, on) => {
  let isFromDown = false
  const w = await world($, on, { env: { SEND_GATE_MODE: 'auto' }, permissions: { defaultMode: 'default' }, isStateWriteDown: key => isFromDown && key === 'modeFrom' })
  await w.start()
  expect(w.state('modeFrom')).toBe('env')
  isFromDown = true
  await w.prompt('bypassPermissions')
  isFromDown = false
  await w.start()
  expect(await w.command('status')).toContain('Mode: bypassPermissions')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
})

test('register G: SEND_GATE_MODE auto wins over a settings default of bypass, and status names it', async ($, on) => {
  const w = await world($, on, { env: { SEND_GATE_MODE: 'auto' }, permissions: { defaultMode: 'bypassPermissions' } })
  await w.start()
  expect(w.state('mode')).toBe('auto')
  expect(w.state('modeFrom')).toBe('env')
  expect(await w.command('status')).toContain("Mode: auto (from the launcher's SEND_GATE_MODE) · not gated")
  const r = await w.call(SLACK_SEND, HELLO)
  expect(r.isRun).toBe(true)
  expect(w.opened).toEqual([])
  expect(recent(w)[0]).toMatchObject({ verdict: 'not-gated', why: 'mode auto' })
})

test('register G: SEND_GATE_MODE bypassPermissions over a settings default holds a send', async ($, on) => {
  const w = await world($, on, { env: { SEND_GATE_MODE: 'bypassPermissions' }, permissions: { defaultMode: 'default' } })
  await w.start()
  expect(w.state('modeFrom')).toBe('env')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.sent).toEqual([])
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).deny).toBe(DENY_CANCEL)
})

test('register G: a value around spaces counts trimmed', async ($, on) => {
  const w = await world($, on, { env: { SEND_GATE_MODE: ' auto ' }, permissions: { defaultMode: 'bypassPermissions' } })
  await w.start()
  expect(w.state('mode')).toBe('auto')
  expect(w.state('modeFrom')).toBe('env')
})

for (const value of ['off', '', 'unknown', 'BYPASSPERMISSIONS']) {
  test(`register G: SEND_GATE_MODE ${JSON.stringify(value)} is ignored and the settings decide`, async ($, on) => {
    const w = await world($, on, { env: { SEND_GATE_MODE: value }, permissions: { defaultMode: 'bypassPermissions' } })
    await w.start()
    expect(w.state('mode')).toBe('bypassPermissions')
    expect(w.state('modeFrom')).toBe('settings')
    const call = w.call(SLACK_SEND, HELLO)
    await w.clock.advance(500)
    expect(w.opened).toHaveLength(1)
    await pressCard($, 'hold-cancel')
    await w.clock.advance(500)
    expect((await call).isRun).toBe(false)
  })
}

test('register G: an event naming bypassPermissions after SEND_GATE_MODE auto gates again', async ($, on) => {
  const w = await world($, on, { env: { SEND_GATE_MODE: 'auto' }, permissions: { defaultMode: 'default' } })
  await w.start()
  expect((await w.call(SLACK_SEND, HELLO)).isRun).toBe(true)
  await w.prompt('bypassPermissions')
  expect(w.state('modeFrom')).toBe('event')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
})

test('register G: a stored event mode wins over the variable at a second session start', async ($, on) => {
  const w = await world($, on, { env: { SEND_GATE_MODE: 'auto' }, permissions: { defaultMode: 'default' } })
  await w.start()
  await w.prompt('bypassPermissions')
  await w.start()
  expect(w.state('mode')).toBe('bypassPermissions')
  expect(w.state('modeFrom')).toBe('event')
  expect(await w.command('status')).toContain('Mode: bypassPermissions (from a session event) · gated')
  const call = w.call(SLACK_SEND, HELLO)
  await w.clock.advance(500)
  expect(w.opened).toHaveLength(1)
  await pressCard($, 'hold-cancel')
  await w.clock.advance(500)
  expect((await call).isRun).toBe(false)
})
