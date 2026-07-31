# Start here

You are picking up one ticket. Load only what that ticket needs.

## Getting your ticket

```bash
node scripts/backlog.mjs next            # tickets whose dependencies are all done
node scripts/backlog.mjs next frontend   # ...in one lane
node scripts/backlog.mjs show RD-215     # the ticket + exactly which files to load
```

`show` prints the file list to read and the token cost of reading it. Read those files and
nothing else. Do **not** read `plan/state.md`, other tickets, or the epic background unless
your ticket points at them.

## What to load

| File | When |
|---|---|
| `plan/START.md` | Always (this file) |
| `plan/rules/*.md` | The ones in your ticket's `rules:` field. Always includes `global`. |
| `plan/tickets/RD-xxx.md` | Your ticket |
| `plan/epics/<letter>.md` | Only if you need the reasoning behind the epic. Not required to execute. |
| `plan/evidence/RD-xxx.md` | Only when auditing a completed ticket's claims |

Everything above totals roughly 3k tokens. The rest of your context is for source files.

## While working

- Stay inside your ticket's `owns:` paths. If you need a path another in-progress ticket
  owns, stop and coordinate.
- Your ticket's `rules:` are binding. A correct implementation that violates one is not done.
- `README.md` is authoritative for how to run things. Prefer it over any other file.

## When finished

1. Set `status:` in your ticket's frontmatter (`todo` → `done`, or `partial` / `blocked`).
2. Write what you actually verified to `plan/evidence/RD-xxx.md`. Claims without evidence
   are why six tickets in this repo are marked complete and unproven.
3. **If you introduced a library, a tool, or a constraint that outlives your ticket, write it
   down where the next agent will actually read it — without being asked.** Evidence files are
   only read when auditing a finished ticket, so a fact left there is a fact the next agent
   rediscovers the hard way.
   - A binding constraint on future work → the matching `plan/rules/*.md`. That is what gets
     loaded per ticket.
   - A new dependency, command, or repo-shape change → `AGENTS.md`, and `README.md` if it
     changes how the thing is set up or run.
   - Work your ticket revealed but did not do → a new ticket via `backlog.mjs new`, not a
     comment and not a line in your evidence file.
   RD-214 is the cautionary case: it added Tailwind with Preflight switched off, and because
   nothing recorded that, later units shipped invisible borders twice before anyone noticed.
4. Run `node scripts/backlog.mjs check` — it must exit clean.
5. Run `node scripts/backlog.mjs gen` to refresh `plan/state.md`.

## Adding work

### A new ticket

```bash
node scripts/backlog.mjs new O "Short imperative title" --lane frontend,llm
```

This allocates the next free ID **inside that epic's range**, writes valid frontmatter,
picks the `rules:` your lanes imply, and lays out the section skeleton. Then:

1. Fill `Goal` (one sentence), `Context` (≤5 bullets with `file:line`), `Steps` (numbered,
   imperative), `Constraints`, `Done when`, `Verify`.
2. Set `owns:` to the paths only this ticket may edit, and `deps:` to tickets that must
   land first. **Do not add a `blocks:` field** — it is derived from other tickets' `deps`.
3. `pnpm backlog` then `pnpm backlog:gen`.

Keep the body under ~1.5k tokens and every line under 1200 characters; `check` enforces
both. If a ticket will not fit, it is two tickets. Background reasoning goes in the epic
file, not here.

### A new epic

1. Pick an unused letter and an unused RD range (existing ranges are in each epic's
   frontmatter; `plan/backlog.md` lists them).
2. Create `plan/epics/<letter>.md` starting with:

   ```yaml
   ---
   letter: Q
   name: "What this epic is"
   range: 231-249
   status: planned
   ---
   ```

3. Below it, write the background: why the epic exists (with evidence), what it explicitly
   does **not** do, and any rules specific to it. This file is optional reading for
   implementers — it carries reasoning, never instructions.
4. Add tickets with `new`. `check` fails if a ticket's ID falls outside its epic's range.

If a rule applies to more than one ticket, put it in `plan/rules/` and reference it from
`rules:` rather than repeating it. That repetition is what made the old epic files large.

## Layout

```
plan/
  START.md         this file
  state.md         generated status board — do not edit
  rules/           binding constraints, loaded per ticket
  tickets/         one file per ticket, the source of truth
  epics/           background prose, optional reading
  evidence/        what was actually verified, per ticket
  backlog-archive.md   RD-001..RD-108, frozen, historical
```
