---
name: backlog
description: "Query and manage a per-ticket backlog driven by scripts/backlog.mjs. Use when the user types /backlog, or asks what to work on next, what is ready to start, what a ticket (RD-xxx) requires, which files a ticket needs loaded, how to add a ticket or epic, or whether the backlog validates. Only applies in repos that have scripts/backlog.mjs."
---

# /backlog

Thin wrapper over `scripts/backlog.mjs`. **The CLI is the source of truth — run it and report
what it says. Never restate its conventions from memory, and never answer from a cached
reading of `plan/state.md`.**

## Precondition

If `scripts/backlog.mjs` does not exist in the current repo, say so in one line and stop.
Do not improvise a backlog from other files.

## Dispatch on the argument

| Argument | Run | Then |
|---|---|---|
| _(none)_ | `node scripts/backlog.mjs next` | Summarize what is ready. Lead with a recommendation. |
| a lane (`frontend`, `seal`, …) | `node scripts/backlog.mjs next <lane>` | Same, scoped to that lane. |
| `RD-xxx` | `node scripts/backlog.mjs show RD-xxx` | Report the goal, the files to load, and the token cost. |
| `check` | `node scripts/backlog.mjs check` | Report errors and warnings verbatim. Do not fix without asking. |
| `gen` | `node scripts/backlog.mjs gen` | Confirm the regenerated counts. |
| `new …` | `node scripts/backlog.mjs new <args>` | Then open the scaffold and offer to fill it in. |
| anything unrecognized | `node scripts/backlog.mjs help` | Show the usage. |

Run `node scripts/backlog.mjs help` yourself if an argument is ambiguous — the epic letters,
lane names, and ID ranges live there, not in this file.

## Reporting

Be brief. The user typed a slash command; they want the answer, not a tour.

- **Recommend one ticket**, not a list of ten. Prefer unblocking work — a ticket other
  tickets depend on beats an isolated one. `show` prints derived `Blocks:` for this.
- Give each candidate one line: ID, title, lane.
- If nothing is ready, say what is blocking the nearest candidate.
- After `check`, if there are errors, quote them and ask before changing anything. A
  validation failure may mean a ticket is mid-edit, not broken.

## When the user wants to start work

Do **not** dump the ticket into the conversation. Run `show`, then read the files it lists —
that list is exactly the working set, and reading more defeats its purpose. `show` also
prints the total token cost; mention it if it is unusually large.

## When adding a ticket

`new` allocates the ID and writes valid frontmatter; do not hand-write either. After
scaffolding, fill `Goal`, `Context`, `Steps`, `Constraints`, `Done when`, `Verify`, and set
`owns:` and `deps:`. Then run `check` and `gen`.

If the body will not fit the size budget the checker enforces, it is two tickets — split it
rather than trimming detail that the implementer needs.
