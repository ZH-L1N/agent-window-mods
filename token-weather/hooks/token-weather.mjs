// Copyright 2026 Anthropic PBC
// SPDX-License-Identifier: Apache-2.0
//
// Token Weather: a live forecast of the context window, above the prompt.
//
// turn.complete: after each main-loop turn, read the context window's fill
// from $.session.usage() (the same figures the status line shows) and keep
// the last HISTORY readings.
// session.start: take a first reading, so the band shows before any turn.
// ui.render (AbovePrompt): one line: icon, forecast word, percent, tokens
// used of the window, a block-character chart of the recent turns, the
// session cost in USD and the rate-limit windows when the API reports them.
//
// Local change (zehui-mods): the line now reads, left to right, a ` ◔ PLAN `
// chip, the weather glyph, the plain fill percent (option showPercent),
// tokens used of the window, the turn chart and delta, the session cost,
// rate-limit windows, and this month's usage summed over every session on
// this machine ($.store). The breakdown is read on turn.complete,
// session.start and after session.compact, never on render.
//
// Local change 6 (zehui-mods): the stacked context bar, its percent colours
// and the top-three categories moved to the handoff mod's ⇄ HANDOFF row.
// This module still reads the breakdown, once per turn, and publishes the
// latest reading to $.state under token-weather.context for that row.
//
// Local change 10 (zehui-mods): "today 12.4M tok" before the month figure:
// the same per-turn usage sums the month keeps, per day, under
// token-weather.day.<YYYY-MM-DD>.<sessionId>, pruned with the month keys.
//
// Local change 11 (zehui-mods): the PLAN row is a Box keyed "zm-20-plan" and
// the hook returns stackRow(line, below): the zehui-mods band rows stack by
// their number (SYS 10, PLAN 20, HANDOFF 30, CACHE 40, AGENTS 50, GOAL 60,
// HERE 70, NEXT 80), not by the plugins' load order; other bands follow.
//
// The host reads on(...) and $.noun.method(...) from source, so they are
// spelled literally, and helpers that take $ are top-level functions.

const HISTORY = 12;
const BARS = "▁▂▃▄▅▆▇█";

// Forecast bands, by percent of the window used.
const FORECAST = [
// Single-width text symbols, not emoji: they line up in every terminal font.
  // Local change 8 (zehui-mods): U+FE0E after each symbol that has an emoji twin, so
  // the terminal draws the text glyph in the band colour, not the colour-emoji picture.
  { upTo: 25, icon: "☀\uFE0E", word: "Clear", color: "yellow" },
  { upTo: 50, icon: "☁\uFE0E", word: "Cloudy", color: "cyan" },
  { upTo: 75, icon: "☂\uFE0E", word: "Showers", color: "blue" },
  { upTo: 90, icon: "☇", word: "Storm", color: "magenta" },
  { upTo: Infinity, icon: "↯", word: "Compact soon", color: "red" },
];

// Local change (zehui-mods): chip of the deck-style band.
// Local change 9 (zehui-mods): padded to the widest zehui-mods chip (HANDOFF) so the colour bars line up.
const CHIP = " ◔ PLAN    ";
const CHIP_FG = "#0b0b0f";
const CHIP_BG = "#60a5fa";
// Local change 11 (zehui-mods): the PLAN row's key in the zehui-mods stack.
const PLAN_KEY = "zm-20-plan";
// The breakdown names each category's colour by its theme key. These are
// the dark theme's values, approximately; a key not listed draws grey.
const THEME_HEX = {
  text: "#ffffff",
  inactive: "#999999",
  subtle: "#505050",
  suggestion: "#b1b9f9",
  remember: "#b1b9f9",
  success: "#4eba65",
  error: "#ff6b80",
  warning: "#ffc107",
  merged: "#af87ff",
  claude: "#d77757",
  permission: "#b1b9f9",
  planMode: "#48968c",
  autoAccept: "#af87ff",
  promptBorder: "#888888",
  bashBorder: "#fd5db1",
  ide: "#4782c8",
  red_FOR_SUBAGENTS_ONLY: "#dc2626",
  blue_FOR_SUBAGENTS_ONLY: "#2563eb",
  green_FOR_SUBAGENTS_ONLY: "#16a34a",
  yellow_FOR_SUBAGENTS_ONLY: "#ca8a04",
  purple_FOR_SUBAGENTS_ONLY: "#9333ea",
  orange_FOR_SUBAGENTS_ONLY: "#ea580c",
  pink_FOR_SUBAGENTS_ONLY: "#db2777",
  cyan_FOR_SUBAGENTS_ONLY: "#0891b2",
};
const FALLBACK_HEX = "#9a9a96";
const MONTH_PREFIX = "token-weather.month.";
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Months kept besides the current one; older keys are deleted at session.start.
const MONTHS_KEPT = 2;
// Local change 10 (zehui-mods): today's tokens, one key per session per day;
// a day key goes when its month's keys go.
const DAY_PREFIX = "token-weather.day.";

// Local change 6 (zehui-mods): the latest context reading, for the handoff
// mod's row (declared in types/index.d.ts). Any plugin may read it; only this
// one writes it.
const CONTEXT_STATE = { plugin: "token-weather", key: "context" };

// Readings: { tokens, window, percent, isEstimate? }, oldest first.
let readings = [];
// Local change (zehui-mods): session cost in USD and the rate-limit windows, from the latest reading.
let costUsd = null;
let rateLimits = [];
// Local change (zehui-mods): tokens counted by turns since the last month write, and this month's totals.
let pendingTokens = 0;
let month = null;
// Local change 10 (zehui-mods): today's tokens summed over this machine's sessions: { ymd, tokens }.
// The row shows it only while ymd is still the clock's day, so an idle session
// never shows yesterday's sum as today's past midnight.
let today = null;

export function register(on, options = {}) {
  // Local change 6 (zehui-mods): the plain percent after the glyph; on unless the option is false.
  const showPercent = options.showPercent !== false;

  on("session.start", async ($, e, next) => {
    const result = await next(e);
    readings = [];
    month = null;
    // Local change 10 (zehui-mods): today's figure is read again with the month's.
    today = null;
    await takeReading($);
    // Local change (zehui-mods): month usage.
    await pruneMonths($);
    await recordMonth($);
    return result;
  });

  on("turn.complete", async ($, e, next) => {
    const result = await next(e);
    // Local change (zehui-mods): every loop's tokens count toward the month, a subagent's too.
    pendingTokens += turnTokens(e.usage);
    if (e.agentId) {
      return result;
    }
    await takeReading($);
    // Local change (zehui-mods): month usage.
    await recordMonth($);
    return result;
  });

  // Local change (zehui-mods): after a compaction of the main conversation, read the breakdown again.
  on("session.compact", async ($, e, next) => {
    const result = await next(e);
    if (e.agentId || e.trigger === "precompute" || !result || typeof result.skip === "string") {
      return result;
    }
    await takeReading($);
    return result;
  }).catch(($, e, next) => next(e)); // A failed reading never changes the compaction.

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    // Local change (zehui-mods): the props live under e.props (upstream read e.hasSurvey / e.bodyColumns).
    const props = e.props ?? {};
    // Local change 7 (zehui-mods): terminal surface only, as the other zehui-mods bands.
    if (e.surface !== "terminal" || props.hasSurvey || readings.length === 0) {
      return next(e);
    }
    const { Box, Text } = $.ui.resolve(e);
    // Local change 10 (zehui-mods): the day now, to drop a today figure from an earlier day.
    let nowYmd = null;
    try {
      nowYmd = dayOf(await $.clock.now());
    } catch {
      nowYmd = null;
    }
    const line = band(Box, Text, props.bodyColumns ?? 80, showPercent, nowYmd);
    // Local change (zehui-mods): compose: whatever another band mod beneath
    // draws goes under this line. The engine's own placeholder
    // ({ type: "engine" }) is not nested.
    let below = null;
    try {
      below = await next(e);
    } catch {
      below = null;
    }
    // Local change 11 (zehui-mods): this row takes PLAN 20 among the zehui-mods
    // rows beneath; any other band follows them (stackRow skips the engine's placeholder).
    return stackRow(line, below);
  });
}

async function takeReading($) {
  try {
    // Local change (zehui-mods): a summary breakdown is estimated locally and sends no request.
    const usage = await $.session.usage({ breakdown: "summary" });
    const { context } = usage;
    costUsd = usage.cost?.usd ?? costUsd;
    rateLimits = usage.rateLimits ?? [];
    if (!context || !context.window) {
      return;
    }
    const breakdown = readBreakdown(context);
    // Local change (zehui-mods): before a response of the live window (a fresh
    // session, or one just compacted) the breakdown's estimate stands in.
    const isEstimate = context.tokens == null && breakdown != null;
    const tokens = context.tokens ?? (isEstimate ? breakdown.totalTokens : 0);
    const percent = Math.round(context.percent ?? (tokens / context.window) * 100);
    // The session.start reading is 0 before any response; drop it once real readings arrive.
    readings = readings.filter((r) => r.tokens > 0 && !r.isEstimate);
    readings.push({ tokens, window: context.window, percent, ...(isEstimate ? { isEstimate } : {}) });
    if (readings.length > HISTORY) {
      readings = readings.slice(-HISTORY);
    }
    $.ui.invalidate("ui.render");
    // Local change 6 (zehui-mods): publish the reading for the handoff mod's row.
    await publishContext($, { breakdown, tokens, window: context.window, percent });
  } catch {
    // No reading this turn; the band keeps the last one.
  }
}

// Local change 6 (zehui-mods): the reading as token-weather.context:
// { categories: [{ name, tokens, color, kind }], totalTokens, maxTokens,
// autoCompactThreshold?, percent, readAt }. Categories are in /context's
// order with the deferred rows left out and colours as hex; empty on a build
// without a breakdown. totalTokens is the reading's tokens (the PLAN row's),
// maxTokens the window; autoCompactThreshold is left out when auto-compact is
// off or the build does not say.
async function publishContext($, r) {
  try {
    const value = {
      categories: r.breakdown ? r.breakdown.categories : [],
      totalTokens: r.tokens,
      maxTokens: r.window,
      ...(r.breakdown && r.breakdown.autoCompactThreshold ? { autoCompactThreshold: r.breakdown.autoCompactThreshold } : {}),
      percent: r.percent,
      readAt: await $.clock.now(),
    };
    await $.state.set(CONTEXT_STATE, value);
  } catch {
    // The handoff row keeps the last reading it had.
  }
}

// Local change (zehui-mods): the breakdown's rows in /context's order, the
// deferred tool schemas left out as /context leaves them out.
function readBreakdown(context) {
  const bd = context.breakdown;
  if (!bd || !Array.isArray(bd.categories)) {
    return null;
  }
  const categories = bd.categories
    .filter((c) => c && c.kind !== "deferred" && !c.isDeferred && Number(c.tokens) > 0)
    .map((c) => ({ name: String(c.name), tokens: Number(c.tokens), color: hexFor(c.color), kind: String(c.kind) }));
  if (categories.length === 0) {
    return null;
  }
  return {
    categories,
    totalTokens: Number(bd.totalTokens) || 0,
    // Local change 6 (zehui-mods): the compaction point, when auto-compact is on.
    autoCompactThreshold: bd.isAutoCompactEnabled === false ? 0 : Number(bd.autoCompactThreshold) || 0,
  };
}

function hexFor(color) {
  if (typeof color !== "string") return FALLBACK_HEX;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  return Object.prototype.hasOwnProperty.call(THEME_HEX, color) ? THEME_HEX[color] : FALLBACK_HEX;
}

// Local change (zehui-mods): the line is built from groups, each with a drop
// rank; while the line is wider than the columns, the lowest rank goes first
// (rate limits, the trend, the chart, the cost, the tokens, the month).
// Local change 6 (zehui-mods): the stacked bar, its percent colours and the
// top three categories are gone (they are the handoff mod's now); a plain
// percent follows the glyph while showPercent is on.
function band(Box, Text, columns, showPercent, nowYmd) {
  const now = readings[readings.length - 1];
  const f = forecastFor(now.percent);
  const groups = [];
  const add = (rank, texts) => groups.push({ rank, texts });
  const t = (children, style = {}) => ({ children, style });

  add(Infinity, [t(CHIP, { color: CHIP_FG, backgroundColor: CHIP_BG, bold: true })]);
  add(Infinity, [t(` ${f.icon} `, { color: f.color, bold: true })]);
  if (showPercent) {
    add(Infinity, [t(`${now.percent}%`)]);
  }
  add(6, [t(`  ${short(now.tokens)} / ${short(now.window)}`, { dimColor: true })]);
  add(4, [t("  last turns ", { dimColor: true }), t(chart(), { color: f.color })]);
  const trend = trendWord();
  if (trend) {
    add(3, [t(`  ${trend}`, { dimColor: true })]);
  }
  // Local change (zehui-mods): session cost.
  if (costUsd != null) {
    add(5, [t("  cost ", { dimColor: true }), t(`$${costUsd.toFixed(2)}`)]);
  }
  // Local change (zehui-mods): rate-limit windows (a gateway's spend_limit among them).
  const limits = limitsText();
  if (limits) {
    add(2, [t(`  ${limits}`, { dimColor: true })]);
  }
  // Local change 10 (zehui-mods): today's tokens, just before the month
  // figure; dropped after the tokens / window, before the month. Only while
  // its day is the clock's day.
  if (today && today.ymd === nowYmd) {
    add(6.5, [t("  today ", { dimColor: true }), t(`${short(today.tokens)} tok`)]);
  }
  if (month) {
    add(7, [t("  "), t(monthText(month), { bold: true })]);
  }

  const width = (g) => g.texts.reduce((sum, x) => sum + [...x.children].length, 0);
  let total = groups.reduce((sum, g) => sum + width(g), 0);
  while (total > columns) {
    let drop = -1;
    groups.forEach((g, i) => {
      if (g.rank !== Infinity && (drop < 0 || g.rank < groups[drop].rank)) drop = i;
    });
    if (drop < 0) break;
    total -= width(groups[drop]);
    groups.splice(drop, 1);
  }
  const parts = groups.flatMap((g) => g.texts.map((x) => Text({ ...x.style, children: x.children })));
  // Local change 11 (zehui-mods): keyed for the zehui-mods stack order.
  return Box({ key: PLAN_KEY, flexDirection: "row", children: parts });
}

function forecastFor(percent) {
  return FORECAST.find((band) => percent < band.upTo) ?? FORECAST[FORECAST.length - 1];
}

// Bars scale to the busiest reading shown, so growth shows at any fill level.
function chart() {
  const top = Math.max(...readings.map((r) => r.tokens), 1);
  const bars = readings.map((r) => BARS[Math.min(BARS.length - 1, Math.floor((r.tokens / top) * (BARS.length - 1)))]);
  return bars.join("");
}

function trendWord() {
  if (readings.length < 2) {
    return "";
  }
  const delta = readings[readings.length - 1].tokens - readings[readings.length - 2].tokens;
  if (delta > 0) return `▲ +${short(delta)} last turn`;
  if (delta < 0) return `▼ ${short(-delta)} last turn`;
  return "steady";
}

// Local change (zehui-mods): rate-limit windows as "5h 23% · 7d 41%"; a window past 80% names its reset.
function limitsText() {
  const names = { five_hour: "5h", seven_day: "7d", spend_limit: "spend" };
  return rateLimits
    .filter((r) => typeof r.percentUsed === "number")
    .map((r) => {
      const label = `${names[r.kind] ?? r.kind} ${Math.round(r.percentUsed)}%`;
      if (r.percentUsed >= 80 && r.resetsAt) {
        const d = new Date(r.resetsAt);
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return `${label} (resets ${hh}:${mm})`;
      }
      return label;
    })
    .join(" · ");
}

// Local change (zehui-mods): month usage. Each session keeps one record per
// month under token-weather.month.<YYYY-MM>.<sessionId>: { usd, tokens }
// spent in that month. A session that runs across a month boundary carries
// its earlier months' usd forward as already counted, so each part counts once.

function turnTokens(usage) {
  if (!usage) return 0;
  return (
    (Number(usage.input_tokens) || 0) +
    (Number(usage.output_tokens) || 0) +
    (Number(usage.cache_read_input_tokens) || 0) +
    (Number(usage.cache_creation_input_tokens) || 0)
  );
}

function monthOf(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Local change 10 (zehui-mods): "YYYY-MM-DD", local time, as monthOf.
function dayOf(ms) {
  const d = new Date(ms);
  return `${monthOf(ms)}-${String(d.getDate()).padStart(2, "0")}`;
}

// Local change 10 (zehui-mods): "<YYYY-MM-DD>.<sessionId>" of a day key, or null for any other key.
function parseDayKey(key) {
  if (!key.startsWith(DAY_PREFIX)) return null;
  const m = /^(\d{4}-\d{2})-(\d{2})\.(.+)$/.exec(key.slice(DAY_PREFIX.length));
  return m ? { ym: m[1], ymd: `${m[1]}-${m[2]}`, sessionId: m[3] } : null;
}

function monthIndex(ym) {
  const [y, m] = ym.split("-").map(Number);
  return y * 12 + (m - 1);
}

// "<YYYY-MM>.<sessionId>" of a month key, or null for any other key.
function parseMonthKey(key) {
  if (!key.startsWith(MONTH_PREFIX)) return null;
  const rest = key.slice(MONTH_PREFIX.length);
  const m = /^(\d{4}-\d{2})\.(.+)$/.exec(rest);
  return m ? { ym: m[1], sessionId: m[2] } : null;
}

function record(value) {
  const v = value && typeof value === "object" ? value : {};
  return { usd: Number(v.usd) || 0, tokens: Number(v.tokens) || 0 };
}

async function pruneMonths($) {
  try {
    const current = monthIndex(monthOf(await $.clock.now()));
    for (const key of await $.store.keys()) {
      // Local change 10 (zehui-mods): a day key goes with its month.
      const k = parseMonthKey(key) ?? parseDayKey(key);
      if (k && monthIndex(k.ym) < current - MONTHS_KEPT) {
        await $.store.delete(key);
      }
    }
  } catch {
    // Pruning waits for the next session.
  }
}

async function recordMonth($) {
  try {
    const ym = monthOf(await $.clock.now());
    const sessionId = await $.session.id();
    const key = `${MONTH_PREFIX}${ym}.${sessionId}`;
    const keys = await $.store.keys();
    const mine = record(await $.store.get(key));
    let earlierUsd = 0;
    for (const k of keys) {
      const p = parseMonthKey(k);
      if (p && p.sessionId === sessionId && p.ym !== ym) {
        earlierUsd += record(await $.store.get(k)).usd;
      }
    }
    const usd = costUsd != null ? Math.max(0, costUsd - earlierUsd) : mine.usd;
    // Local change 10 (zehui-mods): the turns' tokens go to the day's key too.
    const added = pendingTokens;
    const tokens = mine.tokens + added;
    pendingTokens = 0;
    await $.store.set(key, { usd, tokens });
    await recordDay($, keys, sessionId, added);
    let sumUsd = usd;
    let sumTokens = tokens;
    for (const k of keys) {
      const p = parseMonthKey(k);
      if (p && p.ym === ym && k !== key) {
        const r = record(await $.store.get(k));
        sumUsd += r.usd;
        sumTokens += r.tokens;
      }
    }
    month = { label: MONTH_NAMES[Number(ym.slice(5)) - 1], usd: sumUsd, tokens: sumTokens };
    $.ui.invalidate("ui.render");
  } catch {
    // The month line keeps its last figures.
  }
}

// Local change 10 (zehui-mods): adds this session's new tokens to its key for
// today, { tokens }, and sums today's keys of every session on this machine
// into today = { ymd, tokens }.
// A failure here leaves the month's figures as they are.
async function recordDay($, keys, sessionId, added) {
  try {
    const ymd = dayOf(await $.clock.now());
    const key = `${DAY_PREFIX}${ymd}.${sessionId}`;
    const tokens = record(await $.store.get(key)).tokens + added;
    await $.store.set(key, { tokens });
    let sum = tokens;
    for (const k of keys) {
      const p = parseDayKey(k);
      if (p && p.ymd === ymd && k !== key) {
        sum += record(await $.store.get(k)).tokens;
      }
    }
    today = { ymd, tokens: sum };
  } catch {
    // The today figure keeps its last value.
  }
}

function monthText(m) {
  const usd = m.usd >= 100 ? String(Math.round(m.usd)) : m.usd.toFixed(2);
  return `${m.label} $${usd} · ${compact(m.tokens)} tokens`;
}

// 38M, 4.2M, 950k: whole units from ten up.
function compact(n) {
  const units = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "k"],
  ];
  for (const [size, suffix] of units) {
    if (n >= size) {
      const v = n / size;
      return `${v >= 10 ? Math.round(v) : v.toFixed(1)}${suffix}`;
    }
  }
  return String(Math.round(n));
}

function short(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

// Local change 11 (zehui-mods): the stack-order helper, a JavaScript port of
// ~/.claude/skills/building-claude-code-mods/references/stack-row.tsx (keep the
// two in step). A zehui-mods row is a Box keyed "zm-<order>-<name>".
function stackOrderOf(node) {
  const key = node && typeof node === "object" ? node.props?.key : undefined;
  const m = typeof key === "string" ? /^zm-(\d+)-/.exec(key) : null;
  return m ? Number(m[1]) : null;
}

// The column a band hook beneath built: a Box whose only prop is
// flexDirection "column" and whose direct children hold a zm row.
function isStack(node) {
  return (
    node.type === "Box" &&
    node.props?.flexDirection === "column" &&
    Object.keys(node.props).every((k) => k === "flexDirection") &&
    Array.isArray(node.children) &&
    node.children.some((c) => stackOrderOf(c) !== null)
  );
}

// `row` put in its slot among the zm rows of `below` (what next(e) drew): zm
// rows sorted by their number, then every other child in its original order.
// Nothing beneath (null, a failed next, the engine placeholder): the row alone.
function stackRow(row, below) {
  const tree = below && typeof below === "object" && below.type !== "engine" ? below : null;
  if (!tree) return row;
  let items = [tree];
  if (isStack(tree)) {
    items = [...tree.children];
    // The column's mark moves to the one row that carries none, its own; the
    // engine lets a mark move, never multiply.
    const bare = items.filter((c) => c && typeof c === "object" && !c.part);
    if (tree.part && bare.length === 1) items = items.map((c) => (c === bare[0] ? { ...c, part: tree.part } : c));
  }
  const rows = items.filter((c) => stackOrderOf(c) !== null);
  const others = items.filter((c) => stackOrderOf(c) === null);
  // A stable sort: two rows of one number keep their order, this row after.
  const sorted = [...rows, row].sort((a, b) => (stackOrderOf(a) ?? 0) - (stackOrderOf(b) ?? 0));
  return { type: "Box", props: { flexDirection: "column" }, children: [...sorted, ...others] };
}
