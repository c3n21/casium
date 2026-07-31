#!/usr/bin/env node
/**
 * Backlog tooling for `plan/tickets/`.
 *
 *   node scripts/backlog.mjs check          validate frontmatter, refs, cycles, budgets
 *   node scripts/backlog.mjs gen            regenerate plan/state.md
 *   node scripts/backlog.mjs next [lane]    list tickets whose dependencies are all done
 *   node scripts/backlog.mjs show RD-215    print one ticket with its rule files
 *
 * The ticket files are the source of truth. Everything else about ticket state is
 * derived — never hand-maintained — because the hand-maintained index is what drifted
 * in the previous structure.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TICKETS = join(ROOT, "plan", "tickets");
const RULES = join(ROOT, "plan", "rules");
const EPICS = join(ROOT, "plan", "epics");

/** Budget in characters. ~4 chars/token, so 6000 chars ≈ 1.5k tokens. */
const MAX_TICKET_CHARS = 6000;
/** A single line longer than this is unreadable for a small model. */
const MAX_LINE_CHARS = 1200;

const STATUSES = new Set(["todo", "in-progress", "blocked", "partial", "done"]);
const LANES = new Set([
  "project", "move", "sui-ts", "provider-api", "agentkit", "walrus",
  "seal", "frontend", "agent", "docs", "e2e", "llm",
]);
const REQUIRED = ["id", "title", "epic", "lane", "status", "deps", "rules"];
/** RD-001..RD-108 live in the frozen plan/backlog-archive.md and are all complete. */
const ARCHIVED = (id) => Number(id.slice(3)) <= 108;

// ── frontmatter ──────────────────────────────────────────────────────────────

/** Minimal YAML subset: `key: scalar`, `key: [a, b]`, and `key:` + `  - item`. */
function parseFrontmatter(text, file) {
  if (!text.startsWith("---\n")) throw new Error(`${file}: missing frontmatter`);
  const end = text.indexOf("\n---", 4);
  if (end === -1) throw new Error(`${file}: unterminated frontmatter`);
  const out = {};
  let listKey = null;
  for (const line of text.slice(4, end).split("\n")) {
    if (!line.trim()) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      if (item[1].trim() !== "[]") out[listKey].push(item[1].trim());
      continue;
    }
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, raw] = kv;
    if (raw === "") {
      listKey = key;
      out[key] = [];
    } else if (raw.startsWith("[")) {
      listKey = null;
      out[key] = raw.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      listKey = null;
      out[key] = raw.startsWith('"') ? JSON.parse(raw) : raw;
    }
  }
  return { fm: out, body: text.slice(end + 4) };
}

/** Epic metadata lives in `plan/epics/<letter>.md` frontmatter, not in this script. */
function loadEpics() {
  const out = new Map();
  for (const f of readdirSync(EPICS).filter((n) => /^[A-Z]\.md$/.test(n))) {
    const { fm } = parseFrontmatter(readFileSync(join(EPICS, f), "utf8"), f);
    const spans = String(fm.range ?? "")
      .split(",")
      .map((s) => s.trim().split("-").map(Number))
      .filter((p) => p.length && Number.isFinite(p[0]))
      .map(([a, b]) => [a, b ?? a]);
    out.set(fm.letter, { ...fm, spans, file: f });
  }
  return out;
}

const inRange = (epic, id) => epic.spans.some(([a, b]) => Number(id.slice(3)) >= a && Number(id.slice(3)) <= b);

function load() {
  if (!existsSync(TICKETS)) throw new Error(`no ticket directory at ${TICKETS}`);
  return readdirSync(TICKETS)
    .filter((f) => /^RD-\d{3}\.md$/.test(f))
    .sort()
    .map((f) => {
      const text = readFileSync(join(TICKETS, f), "utf8");
      const { fm, body } = parseFrontmatter(text, f);
      return { file: f, path: join(TICKETS, f), text, body, ...fm };
    });
}

// ── check ────────────────────────────────────────────────────────────────────

function check(tickets, epics) {
  const errors = [];
  const warnings = [];
  const byId = new Map(tickets.map((t) => [t.id, t]));

  for (const t of tickets) {
    const at = t.file;
    for (const key of REQUIRED) {
      if (t[key] === undefined) errors.push(`${at}: missing required field '${key}'`);
    }
    if (t.id && `${t.id}.md` !== t.file) errors.push(`${at}: id '${t.id}' does not match filename`);
    const epic = epics.get(t.epic);
    if (!epic) errors.push(`${at}: unknown epic '${t.epic}' — no plan/epics/${t.epic}.md`);
    else if (!inRange(epic, t.id)) {
      errors.push(`${at}: ${t.id} is outside epic ${t.epic}'s range (${epic.range})`);
    }
    if (t.status && !STATUSES.has(t.status)) {
      errors.push(`${at}: status '${t.status}' not one of ${[...STATUSES].join(", ")}`);
    }
    for (const lane of t.lane ?? []) {
      if (!LANES.has(lane)) errors.push(`${at}: unknown lane '${lane}'`);
    }
    for (const rule of t.rules ?? []) {
      if (!existsSync(join(RULES, `${rule}.md`))) errors.push(`${at}: rules references missing plan/rules/${rule}.md`);
    }
    for (const dep of t.deps ?? []) {
      if (!byId.has(dep) && !ARCHIVED(dep)) errors.push(`${at}: deps references unknown ticket ${dep}`);
    }
    if (t.blocks) warnings.push(`${at}: remove 'blocks' — it is derived from deps, not stored`);
    if (t.text.length > MAX_TICKET_CHARS) {
      warnings.push(`${at}: ${t.text.length} chars exceeds budget of ${MAX_TICKET_CHARS} (~${Math.round(t.text.length / 4)} tokens)`);
    }
    for (const [i, line] of t.body.split("\n").entries()) {
      if (line.length > MAX_LINE_CHARS) {
        warnings.push(`${at}: line ${i + 1} is ${line.length} chars — split into steps`);
      }
    }
    if (t.status === "done" && !existsSync(join(ROOT, "plan", "evidence", `${t.id}.md`))) {
      warnings.push(`${at}: status is done but plan/evidence/${t.id}.md does not exist`);
    }
  }

  // Depth-first cycle detection over deps.
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    if (state.get(id) === "done") return;
    if (state.get(id) === "open") {
      errors.push(`dependency cycle: ${[...stack.slice(stack.indexOf(id)), id].join(" -> ")}`);
      return;
    }
    state.set(id, "open");
    stack.push(id);
    for (const dep of byId.get(id)?.deps ?? []) if (byId.has(dep)) visit(dep);
    stack.pop();
    state.set(id, "done");
  };
  for (const t of tickets) visit(t.id);

  return { errors, warnings };
}

// ── generate ─────────────────────────────────────────────────────────────────

const MARK = { done: "x", partial: "~", "in-progress": ">", blocked: "!", todo: " " };

/** Reverse edges of `deps`. Derived, never stored. */
function deriveBlocks(tickets) {
  const map = new Map(tickets.map((t) => [t.id, []]));
  for (const t of tickets) {
    for (const dep of t.deps ?? []) map.get(dep)?.push(t.id);
  }
  return map;
}

function ready(tickets) {
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const satisfied = (d) => ARCHIVED(d) || byId.get(d)?.status === "done";
  return tickets.filter((t) => t.status === "todo" && (t.deps ?? []).every(satisfied));
}

function gen(tickets, epics) {
  const byEpic = {};
  for (const t of tickets) (byEpic[t.epic] ??= []).push(t);

  const counts = tickets.reduce((a, t) => ((a[t.status] = (a[t.status] ?? 0) + 1), a), {});
  const lines = [
    "<!-- GENERATED by scripts/backlog.mjs — do not edit by hand. Edit plan/tickets/*.md. -->",
    "# Backlog State",
    "",
    `${tickets.length} tickets — ` +
      ["done", "partial", "in-progress", "blocked", "todo"]
        .filter((s) => counts[s])
        .map((s) => `${counts[s]} ${s}`)
        .join(", "),
    "",
    "Legend: `[x]` done · `[~]` partial · `[>]` in progress · `[!]` blocked · `[ ]` todo",
    "",
  ];

  for (const [letter, epic] of [...epics].sort((a, b) => a[0].localeCompare(b[0]))) {
    const list = byEpic[letter];
    if (!list) continue;
    const open = list.filter((t) => t.status !== "done").length;
    lines.push(`## Epic ${letter} — ${epic.name}`, "");
    lines.push(`${list.length} tickets, ${open} open. Background: \`plan/epics/${letter}.md\`.`, "");
    lines.push("| | Ticket | Title | Lane | Deps |", "|---|---|---|---|---|");
    for (const t of list) {
      const deps = (t.deps ?? []).length ? t.deps.join(", ") : "—";
      lines.push(`| \`[${MARK[t.status] ?? " "}]\` | \`${t.id}\` | ${t.title} | ${(t.lane ?? []).join(", ")} | ${deps} |`);
    }
    lines.push("");
  }

  const r = ready(tickets);
  lines.push("## Ready To Start", "", "Dependencies satisfied, nothing blocking:", "");
  lines.push(r.length ? r.map((t) => `- \`${t.id}\` ${t.title} _(${(t.lane ?? []).join(", ")})_`).join("\n") : "_Nothing ready._");
  lines.push("", `Regenerate with \`pnpm backlog:gen\`.`, "");

  writeFileSync(join(ROOT, "plan", "state.md"), lines.join("\n"));
  return r.length;
}

// ── new ──────────────────────────────────────────────────────────────────────

/** Rules a lane implies, so a new ticket cannot forget a binding constraint. */
const LANE_RULES = {
  move: ["move"], "sui-ts": ["sui"], "provider-api": ["provider-api"],
  agentkit: ["agentkit"], walrus: ["privacy"], seal: ["privacy", "seal"],
  frontend: ["frontend"], agent: ["agent"], e2e: ["e2e"], llm: ["frontend", "llm"],
};

function nextId(epic, tickets) {
  const used = new Set(tickets.map((t) => Number(t.id.slice(3))));
  for (const [a, b] of epic.spans) {
    for (let n = a; n <= b; n++) if (!used.has(n)) return `RD-${String(n).padStart(3, "0")}`;
  }
  return null;
}

function create(tickets, epics, letter, title, laneArg) {
  const epic = epics.get(letter);
  if (!epic) throw new Error(`unknown epic '${letter}' — create plan/epics/${letter}.md first`);
  const lanes = (laneArg ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!lanes.length) throw new Error(`--lane is required (one of: ${[...LANES].join(", ")})`);
  for (const l of lanes) if (!LANES.has(l)) throw new Error(`unknown lane '${l}'`);

  const id = nextId(epic, tickets);
  if (!id) throw new Error(`epic ${letter} has no free IDs in range ${epic.range} — widen it`);

  const rules = ["global", ...new Set(lanes.flatMap((l) => LANE_RULES[l] ?? []))];
  const text = `---
id: ${id}
title: ${JSON.stringify(title)}
epic: ${letter}
lane: [${lanes.join(", ")}]
priority: P2
status: todo
deps: []
rules: [${rules.join(", ")}]
owns:
  - TODO/path/this/ticket/owns
---

# ${id} ${title}

## Goal
One sentence. What is true after this ticket that is not true now.

## Context
- Facts the implementer needs, each with a \`file:line\` where possible.
- Keep to five bullets. Background belongs in \`plan/epics/${letter}.md\`.

## Steps
1. Imperative, ordered, one action each.
2. Name exact files and symbols rather than describing them.

## Constraints
- Anything that would make a working implementation still wrong.

## Done when
- [ ] Observable, checkable outcome.

## Verify
- **Tests.** What to add or run.
- **Evidence to capture.** What proves it, for \`plan/evidence/${id}.md\`.
`;
  writeFileSync(join(TICKETS, `${id}.md`), text);
  return id;
}

// ── cli ──────────────────────────────────────────────────────────────────────

const [cmd = "check", arg, ...rest] = process.argv.slice(2);
const tickets = load();
const epics = loadEpics();

if (cmd === "check") {
  const { errors, warnings } = check(tickets, epics);
  for (const w of warnings) console.warn(`warn  ${w}`);
  for (const e of errors) console.error(`ERROR ${e}`);
  console.log(`\n${tickets.length} tickets checked — ${errors.length} errors, ${warnings.length} warnings`);
  process.exit(errors.length ? 1 : 0);
} else if (cmd === "gen") {
  const n = gen(tickets, epics);
  console.log(`wrote plan/state.md — ${tickets.length} tickets, ${n} ready to start`);
} else if (cmd === "new") {
  const laneFlag = rest.indexOf("--lane");
  if (!arg || laneFlag === -1) {
    console.error(`usage: node scripts/backlog.mjs new <EPIC-LETTER> "<title>" --lane <lane>[,<lane>]`);
    console.error(`epics: ${[...epics.keys()].sort().join(", ")}`);
    process.exit(1);
  }
  const title = rest.slice(0, laneFlag).join(" ").trim();
  if (!title) {
    console.error("a title is required");
    process.exit(1);
  }
  const id = create(tickets, epics, arg.toUpperCase(), title, rest[laneFlag + 1]);
  console.log(`created plan/tickets/${id}.md — fill it in, then run 'pnpm backlog' and 'pnpm backlog:gen'`);
} else if (cmd === "next") {
  let r = ready(tickets);
  if (arg) r = r.filter((t) => (t.lane ?? []).includes(arg));
  if (!r.length) console.log(arg ? `nothing ready in lane '${arg}'` : "nothing ready");
  for (const t of r) console.log(`${t.id}  ${t.title}  [${(t.lane ?? []).join(", ")}]  plan/tickets/${t.file}`);
} else if (cmd === "show") {
  const t = tickets.find((x) => x.id === arg);
  if (!t) {
    console.error(`no such ticket: ${arg}`);
    process.exit(1);
  }
  const blocks = deriveBlocks(tickets).get(t.id) ?? [];
  const files = ["plan/START.md", ...(t.rules ?? []).map((r) => `plan/rules/${r}.md`), `plan/tickets/${t.file}`];
  const budget = files.reduce(
    (n, f) => n + (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8").length : 0),
    0,
  );
  console.log(`# Load these files — ~${Math.round(budget / 4)} tokens total:`);
  for (const f of files) console.log(f);
  if (blocks.length) console.log(`\n# Blocks (derived): ${blocks.join(", ")}`);
  console.log();
  console.log(t.text);
} else if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  console.log(`backlog — tickets live in plan/tickets/, one file each.

  check                       validate frontmatter, refs, cycles, and size budgets
  gen                         regenerate plan/state.md
  next [lane]                 tickets whose dependencies are all done
  show RD-xxx                 a ticket + exactly which files to load, and their token cost
  new <EPIC> "<title>" --lane <lane>[,<lane>]
                              scaffold a ticket with the next free ID in that epic's range

Epics:  ${[...epics].sort().map(([l, e]) => `${l} ${e.range}`).join("   ")}
Lanes:  ${[...LANES].join(", ")}

Conventions the checker enforces, so you do not have to remember them:
  - 'blocks' is derived from other tickets' 'deps'. Never store it.
  - A ticket's ID must fall inside its epic's declared range.
  - Ticket bodies stay under ${MAX_TICKET_CHARS} chars; no line over ${MAX_LINE_CHARS}.
  - A ticket marked done needs plan/evidence/<id>.md.

Full workflow: plan/START.md`);
} else {
  console.error(`unknown command '${cmd}' — try: node scripts/backlog.mjs help`);
  process.exit(1);
}
