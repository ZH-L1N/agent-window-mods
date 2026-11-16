import { expect, test } from 'claude-code/testing'

import { kindOf, parseGateConfig, previewOf, shouldGate } from './rules'
import type { GateRead, Mode, SendKind } from './rules'

/** The neutral example config of the README and examples/send-gate.example.json. */
const EXAMPLE = JSON.stringify({ gate: ['mcp__deploy__set_env'], pass: [] })
const OK = parseGateConfig(EXAMPLE)
const NONE = parseGateConfig(null)
const BROKEN = parseGateConfig('{')
const PASS_DEPLOY = parseGateConfig(JSON.stringify({ gate: ['mcp__deploy__set_env'], pass: ['mcp__deploy__*'] }))

type Case = { n: string; tool: string; read?: GateRead; want: SendKind | null }

const CASES: Case[] = [
  { n: 'slack send', tool: 'mcp__claude_ai_Slack__slack_send_message', want: 'message' },
  { n: 'slack schedule', tool: 'mcp__claude_ai_Slack__slack_schedule_message', want: 'message' },
  { n: 'slack draft', tool: 'mcp__claude_ai_Slack__slack_send_message_draft', want: null },
  { n: 'mail send_message', tool: 'mcp__claude_ai_Gmail__send_message', want: 'email' },
  { n: 'mail reply', tool: 'mcp__claude_ai_Gmail__reply', want: 'email' },
  { n: 'mail forward', tool: 'mcp__claude_ai_Gmail__forward', want: 'email' },
  { n: 'mail draft', tool: 'mcp__claude_ai_Gmail__create_draft', want: null },
  { n: 'a read', tool: 'mcp__notes__get_page', want: null },
  { n: 'not mcp', tool: 'Bash', want: null },
  { n: 'configured', tool: 'mcp__deploy__set_env', read: OK, want: 'site' },
  { n: 'configured, then passed', tool: 'mcp__deploy__set_env', read: PASS_DEPLOY, want: null },
  { n: 'broken: a write', tool: 'mcp__deploy__update_app', read: BROKEN, want: 'site' },
  { n: 'broken: a read', tool: 'mcp__deploy__list_apps', read: BROKEN, want: null },
  { n: 'calendar create', tool: 'mcp__cal__create_event', want: 'notify' },
  { n: 'calendar respond', tool: 'mcp__cal__respond_to_event', want: 'notify' },
  { n: 'calendar list', tool: 'mcp__cal__list_events', want: null },
  { n: 'share a file', tool: 'mcp__drive__share_file', want: 'notify' },
  { n: 'add a comment', tool: 'mcp__issues__addCommentToIssue', want: 'notify' },
  { n: 'read comments', tool: 'mcp__issues__getIssueComments', want: null },
  { n: 'publish a page', tool: 'mcp__wiki__createPage', want: null },
  // Beyond the plan's table.
  { n: 'send_message on a chat server', tool: 'mcp__chat__send_message', want: 'message' },
  { n: 'send_draft', tool: 'mcp__mail__send_draft', want: 'email' },
  { n: 'post_message', tool: 'mcp__chat__post_message', want: 'message' },
  { n: 'a dashed comment', tool: 'mcp__issues__reply-to-comment', want: 'notify' },
  { n: 'a draft comment', tool: 'mcp__issues__add_draft_comment', want: null },
  { n: 'broken: a built-in kind keeps its kind', tool: 'mcp__claude_ai_Gmail__send_message', read: BROKEN, want: 'email' },
  { n: 'broken: a draft is held', tool: 'mcp__claude_ai_Gmail__create_draft', read: BROKEN, want: 'site' },
  { n: 'broken: not mcp', tool: 'Bash', read: BROKEN, want: null },
  { n: 'no config: a write', tool: 'mcp__deploy__update_app', read: NONE, want: null },
]

for (const c of CASES) {
  test(`kindOf ${c.n}: ${c.tool}`, () => {
    expect(kindOf(c.tool, c.read ?? OK)).toBe(c.want)
  })
}

test('parseGateConfig: none, ok, broken, warnings', () => {
  expect(NONE).toEqual({ status: 'none' })
  expect(OK).toEqual({ status: 'ok', config: { gate: ['mcp__deploy__set_env'], pass: [] }, warnings: [] })
  expect(BROKEN.status).toBe('broken')
  expect(parseGateConfig('[]').status).toBe('broken')
  expect(parseGateConfig('{"gate": "mcp__x__y"}').status).toBe('broken')
  expect(parseGateConfig('{"gate": [1]}').status).toBe('broken')
  expect(parseGateConfig('{"gate": [""]}').status).toBe('broken')
  expect(parseGateConfig('{}')).toEqual({ status: 'ok', config: { gate: [], pass: [] }, warnings: [] })
  const odd = parseGateConfig('{"gate": [], "extra": 1}')
  expect(odd.status).toBe('ok')
  expect(odd.status === 'ok' ? odd.warnings : []).toEqual(['unknown key "extra"'])
})

test('kindOf: gate globs match the whole name, case aside; pass globs exactly', () => {
  const read = parseGateConfig(JSON.stringify({ gate: ['mcp__deploy__*'], pass: ['mcp__deploy__get_?'] }))
  expect(kindOf('mcp__deploy__restart', read)).toBe('site')
  expect(kindOf('mcp__DEPLOY__restart', read)).toBe('site')
  expect(kindOf('mcp__deploy__get_x', read)).toBe(null)
  expect(kindOf('mcp__deploy__get_xy', read)).toBe('site')
  expect(kindOf('mcp__deployer__restart', read)).toBe(null)
  // A pass glob also passes a built-in kind.
  const passMail = parseGateConfig(JSON.stringify({ pass: ['mcp__claude_ai_Gmail__*'] }))
  expect(kindOf('mcp__claude_ai_Gmail__send_message', passMail)).toBe(null)
})

test('previewOf: target, mentions and dates of a message', () => {
  const p = previewOf('message', 'mcp__chat__post_message', {
    channel: '#general',
    text: 'Hi <@U123> and @sam, ship by 2026-11-20 or Friday 3:30 pm <!here>',
  })
  expect(p.kind).toBe('message')
  expect(p.tool).toBe('mcp__chat__post_message')
  expect(p.target).toBe('channel: #general')
  expect(p.mentions).toEqual(['<@U123>', '@sam', '<!here>'])
  expect(p.dates).toEqual(['2026-11-20', 'Friday', '3:30 pm'])
  expect(p.body).toBe('Hi <@U123> and @sam, ship by 2026-11-20 or Friday 3:30 pm <!here>')
  expect(p.fields).toEqual([])
})

test('previewOf: mentions and dates are read from the whole text, before the cut', () => {
  const tail = '<!channel> on 2026-12-01'
  const p = previewOf('message', 'mcp__chat__post_message', { channel: '#general', text: `${'a '.repeat(450 - tail.length / 2)}${tail}` })
  expect(p.body.length).toBe(600)
  expect(p.body).not.toContain('<!channel>')
  expect(p.mentions).toEqual(['<!channel>'])
  expect(p.dates).toEqual(['2026-12-01'])
})

test('previewOf: a 900-character body is cut to 600', () => {
  const p = previewOf('message', 'mcp__chat__post_message', { channel: '#general', text: 'a'.repeat(900) })
  expect(p.body.length).toBe(600)
  expect(p.body.endsWith('…')).toBe(true)
})

test('previewOf: a site call lists its scalar fields, secrets masked', () => {
  const p = previewOf('site', 'mcp__deploy__set_env', { app: 'demo', API_KEY: 'abc', replicas: 2 })
  expect(p.fields).toEqual([
    ['app', 'demo'],
    ['API_KEY', '••••'],
    ['replicas', '2'],
  ])
})

test('previewOf: a site field is cut to 80, and a list or an object shows as compact JSON', () => {
  const p = previewOf('site', 'mcp__deploy__set_env', {
    value: 'v'.repeat(200),
    nested: { a: 1, b: 'two' },
    list: [1, 'x'],
    password_hint: 'x',
    isOn: true,
    long: { w: 'w'.repeat(200) },
  })
  expect(p.fields.map(f => f[0])).toEqual(['value', 'nested', 'list', 'password_hint', 'isOn', 'long'])
  expect(p.fields[0]?.[1].length).toBe(80)
  expect(p.fields[1]?.[1]).toBe('{"a":1,"b":"two"}')
  expect(p.fields[2]?.[1]).toBe('[1,"x"]')
  expect(p.fields[3]?.[1]).toBe('••••')
  expect(p.fields[4]?.[1]).toBe('true')
  expect(p.fields[5]?.[1].length).toBe(80)
})

test('previewOf: every target key in order, lists joined, every body value joined in the lists\' order', () => {
  const p = previewOf('email', 'mcp__mail__send_email', {
    html: '<p>Also on Monday</p>',
    to: ['a@example.com', 'b@example.com'],
    cc: 'c@example.com',
    subject: 'Plans',
    body: 'See you tomorrow at 10:00, or next week. EOD is fine.',
  })
  expect(p.target).toBe('to: a@example.com, b@example.com · cc: c@example.com · subject: Plans')
  expect(p.body).toBe('See you tomorrow at 10:00, or next week. EOD is fine.\n<p>Also on Monday</p>')
  expect(p.dates).toEqual(['tomorrow', '10:00', 'next week', 'EOD', 'Monday'])
  // An address is not a mention.
  expect(p.mentions).toEqual([])
  expect(p.fields).toEqual([])
})

test('previewOf: a calendar event in the connected tool\'s own argument names', () => {
  const p = previewOf('notify', 'mcp__cal__create_event', {
    summary: 'Review',
    description: 'see @sam tomorrow',
    attendees: [{ email: 'sam@example.com' }],
    startTime: '2026-11-20T15:00:00Z',
    endTime: '2026-11-20T16:00:00Z',
    calendarId: 'primary',
  })
  expect(p.target).toBe('attendees: {"email":"sam@example.com"} · calendarId: primary')
  expect(p.body).toBe('see @sam tomorrow\nReview')
  expect(p.mentions).toEqual(['@sam'])
  expect(p.dates).toEqual(['tomorrow', '2026-11-20T15:00:00Z', '2026-11-20T16:00:00Z'])
  expect(p.fields).toEqual([])
  expect(p.hasBodyKey).toBe(true)
})

test('previewOf: a mail send of a saved draft names the draft and carries no text', () => {
  const p = previewOf('email', 'mcp__mail__send_message', { draftId: 'd-1' })
  expect(p.target).toBe('draftId: d-1')
  expect(p.body).toBe('')
  expect(p.hasBodyKey).toBe(false)
  expect(p.fields).toEqual([])
})

test('previewOf: a mail reply shows the message, reply-all, the text, its mention and its date', () => {
  const p = previewOf('email', 'mcp__mail__reply', { messageId: 'm-1', replyAll: true, htmlBody: '<p>@team see you Friday</p>' })
  expect(p.target).toBe('messageId: m-1 · replyAll: true')
  expect(p.body).toBe('<p>@team see you Friday</p>')
  expect(p.mentions).toEqual(['@team'])
  expect(p.dates).toEqual(['Friday'])
})

test('previewOf: an issue comment shows the issue and the comment', () => {
  const p = previewOf('notify', 'mcp__issues__addCommentToIssue', { issueIdOrKey: 'ABC-1', commentBody: 'Done, @kim: due 2026-12-01' })
  expect(p.target).toBe('issueIdOrKey: ABC-1')
  expect(p.body).toBe('Done, @kim: due 2026-12-01')
  expect(p.mentions).toEqual(['@kim'])
  expect(p.dates).toEqual(['2026-12-01'])
})

test('previewOf: keys match with case, _ and - ignored, and dueDate is a date', () => {
  const p = previewOf('notify', 'mcp__issues__create_comment', { Channel_ID: 'C1', 'post-at': '2026-12-02', due_date: '2026-12-03', MESSAGE: 'hi' })
  expect(p.target).toBe('Channel_ID: C1')
  expect(p.body).toBe('hi')
  expect(p.dates).toEqual(['2026-12-02', '2026-12-03'])
  expect(p.fields).toEqual([])
})

test('previewOf: an argument no list knows is a field for every kind, secrets masked', () => {
  const p = previewOf('message', 'mcp__chat__post_message', { channel: '#general', text: 'hi', unfurl: false, blocks: [{ type: 'x' }], token: 'abc' })
  expect(p.fields).toEqual([
    ['unfurl', 'false'],
    ['blocks', '[{"type":"x"}]'],
    ['token', '••••'],
  ])
})

test('previewOf: date fields and month-day dates, unique and in order', () => {
  const p = previewOf('notify', 'mcp__cal__create_event', {
    attendees: ['sam@example.com'],
    start: { dateTime: '2026-11-20T15:00:00Z' },
    end: '2026-11-20T16:00:00Z',
    content: 'Review on November 20, again on Nov 20, and on Friday',
  })
  expect(p.target).toBe('attendees: sam@example.com')
  expect(p.dates).toEqual(['November 20', 'Nov 20', 'Friday', '2026-11-20T15:00:00Z', '2026-11-20T16:00:00Z'])
})

test('previewOf: control characters are cleaned from the body and the target', () => {
  const p = previewOf('message', 'mcp__chat__post_message', { channel: '#gen\u001b[31meral', text: 'a\u0007b\tc\nd\u009be' })
  expect(p.target).toBe('channel: #gen[31meral')
  expect(p.body).toBe('ab\tc\nde')
})

test('previewOf: no body and no target', () => {
  const p = previewOf('message', 'mcp__chat__post_message', {})
  expect(p.target).toBe('')
  expect(p.body).toBe('')
  expect(p.mentions).toEqual([])
  expect(p.dates).toEqual([])
  expect(p.hasBodyKey).toBe(false)
  // A body key with an empty value is in the call: the card says Text none.
  expect(previewOf('message', 'mcp__chat__post_message', { text: '' }).hasBodyKey).toBe(true)
})

test('shouldGate: bypassPermissions and unknown only', () => {
  const gated: Mode[] = ['bypassPermissions', 'unknown']
  const passed: Mode[] = ['default', 'acceptEdits', 'plan', 'dontAsk', 'auto']
  for (const m of gated) expect(shouldGate(m), m).toBe(true)
  for (const m of passed) expect(shouldGate(m), m).toBe(false)
})

// Second fix round (items B to E of PROVENANCE.md, "Second fix round").

test('previewOf B: a secret nested in an object field is masked at any depth', () => {
  const p = previewOf('site', 'mcp__deploy__set_env', { app: 'demo', env: { DATABASE_PASSWORD: 'hunter2', API_KEY: 'sk-live-123' } })
  expect(p.fields).toEqual([
    ['app', 'demo'],
    ['env', '{"DATABASE_PASSWORD":"••••","API_KEY":"••••"}'],
  ])
  const vars = previewOf('site', 'mcp__deploy__set_env', { app: 'demo', vars: { DB_PASSWORD: 'hunter2', API_TOKEN: 'abc' } })
  expect(vars.fields[1]).toEqual(['vars', '{"DB_PASSWORD":"••••","API_TOKEN":"••••"}'])
  expect(JSON.stringify(vars)).not.toContain('hunter2')
})

test('previewOf B: authorization, bearer and cookie keys are masked, nested, in lists and at the top', () => {
  const p = previewOf('site', 'mcp__deploy__set_env', {
    headers: { Authorization: 'Bearer abc' },
    items: [{ token: 'x' }, { deep: { inner: { cookie: 'c1', bearer: 'b1' } } }],
    Cookie: 'session=1',
    authorization: 'Bearer top',
  })
  expect(p.fields).toEqual([
    ['headers', '{"Authorization":"••••"}'],
    ['items', '[{"token":"••••"},{"deep":{"inner":{"cookie":"••••","bearer":"••••"}}}]'],
    ['Cookie', '••••'],
    ['authorization', '••••'],
  ])
  const all = JSON.stringify(p)
  for (const secret of ['Bearer abc', '"x"', 'c1', 'b1', 'session=1', 'Bearer top']) expect(all, secret).not.toContain(secret)
})

test('previewOf B: a secret inside a target value that is an object or a list is masked', () => {
  const p = previewOf('message', 'mcp__chat__post_message', { channel: { id: 'C1', token: 'abc' }, recipients: [{ email: 'a@example.com', api_key: 'k1' }], text: 'hi' })
  expect(p.target).toBe('channel: {"id":"C1","token":"••••"} · recipients: {"email":"a@example.com","api_key":"••••"}')
})

test('previewOf C: a line break in a field never makes a line of its own', () => {
  const p = previewOf('message', 'mcp__chat__post_message', { channel: '#safe', text: 'hi', note: 'x\nTo channel: #other', tag: '\nText Lunch at noon?' })
  expect(p.fields).toEqual([
    ['note', 'x⏎To channel: #other'],
    ['tag', '⏎Text Lunch at noon?'],
  ])
  const keyed = previewOf('site', 'mcp__deploy__set_env', { 'a\r\nTo b': 'v w z\rq' })
  expect(keyed.fields).toEqual([['a⏎To b', 'v⏎w⏎z⏎q']])
})

test('previewOf C: a line break in a target, a date value or a date read from the text is drawn as the mark', () => {
  const p = previewOf('notify', 'mcp__cal__create_event', {
    subject: 'Plans\nMentions none',
    start: '2026-11-20\nText fake',
    text: 'see you on November\n20',
  })
  expect(p.target).toBe('subject: Plans⏎Mentions none')
  expect(p.dates).toEqual(['November⏎20', '2026-11-20⏎Text fake'])
  for (const d of p.dates) expect(d).not.toContain('\n')
})

test('previewOf D: a date object shows its dateTime (or date) and its timeZone', () => {
  const p = previewOf('notify', 'mcp__cal__create_event', { summary: 'x', start: { dateTime: '2026-11-20T15:00:00', timeZone: 'Asia/Tokyo' }, end: { date: '2026-11-21' } })
  expect(p.dates).toEqual(['2026-11-20T15:00:00 Asia/Tokyo', '2026-11-21'])
  expect(p.fields).toEqual([])
})

test('previewOf D: a date object with any other key shows as compact JSON, cut and masked', () => {
  const p = previewOf('notify', 'mcp__cal__create_event', { summary: 'x', End: { dateTime: 'x', cmd: 'also post to #all' } })
  expect(p.dates).toEqual(['{"dateTime":"x","cmd":"also post to #all"}'])
  const both = previewOf('notify', 'mcp__cal__create_event', { start: { dateTime: '2026-11-20T15:00:00', date: '2026-11-21' } })
  expect(both.dates).toEqual(['{"dateTime":"2026-11-20T15:00:00","date":"2026-11-21"}'])
  const long = previewOf('notify', 'mcp__cal__create_event', { start: { dateTime: 'x', note: 'n'.repeat(200), token: 'abc' } })
  expect(long.dates[0]?.length).toBe(80)
  expect(long.dates[0]?.endsWith('…')).toBe(true)
  const masked = previewOf('notify', 'mcp__cal__create_event', { start: { dateTime: 'x', token: 'abc' } })
  expect(masked.dates).toEqual(['{"dateTime":"x","token":"••••"}'])
})

/** A list nested `depth` levels deep, built with a loop so the test's own stack is never used up. */
function deepList(depth: number): unknown {
  let v: unknown = []
  for (let i = 0; i < depth; i += 1) v = [v]
  return v
}

test('previewOf E: an argument that cannot be written as JSON throws, as a field and as a body', () => {
  const deep = deepList(200_000)
  expect(() => previewOf('message', 'mcp__chat__post_message', { channel: '#general', text: 'hi', blocks: deep })).toThrow()
  expect(() => previewOf('message', 'mcp__chat__post_message', { channel: '#general', text: deep })).toThrow()
})
