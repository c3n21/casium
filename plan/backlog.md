# Casium Backlog

Core product message: **World limits who the agent represents. Sui limits what the agent can do.**

**Picking up work? Read `plan/START.md`, not this file.**

```bash
node scripts/backlog.mjs next          # what is ready to start
node scripts/backlog.mjs show RD-xxx   # a ticket + exactly which files to load
```

## Where things live

| Path | What |
|---|---|
| `plan/START.md` | How to pick up a ticket. Start here. |
| `plan/tickets/RD-xxx.md` | One file per ticket. **The source of truth.** |
| `plan/state.md` | Generated status board and ready list. Do not edit. |
| `plan/rules/*.md` | Binding constraints, loaded per ticket via its `rules:` field. |
| `plan/epics/<letter>.md` | Why an epic exists. Background; not needed to execute. |
| `plan/evidence/RD-xxx.md` | What was actually verified for a completed ticket. |
| `plan/backlog-archive.md` | RD-001 … RD-108. Frozen. Read for history, do not edit. |
| `spec/development-spec.md` | Implementation contract for schemas, endpoints, and Move. |

Epics: **C** close the loop · **W** live Walrus · **S** Seal access control ·
**E** E2E tests · **I** agent identity binding · **D** deployment ·
**L** the landlord is a real party · **O** conversational renter experience ·
**X** unscheduled (includes RD-180).

## Ownership by path

Two agents must not hold the same path. A ticket's `owns:` field is authoritative; this is
the map for planning who can run concurrently. Useful concurrency is about three.

| Lane | Primary paths |
|---|---|
| `project` | root, `scripts/`, `deploy/`, `packages/contracts-config/` |
| `move` | `packages/move/` |
| `sui-ts` | `packages/sui-client/` |
| `provider-api` | `apps/provider-api/` |
| `agentkit` | `packages/agentkit/`, provider middleware |
| `walrus` | `packages/walrus/`, packet flow |
| `seal` | `packages/seal/`, Move policy |
| `frontend` | `apps/web/` |
| `agent` | `apps/agent/` |
| `llm` | `packages/llm/`, `apps/web/app/api/` |
| `e2e` | `apps/e2e/` |
| `docs` | `README.md`, `docs/`, `plan/` |

## Where the system actually stands

Not a repair list — each stage works in isolation and is joined to the next by hand-edited
environment variables and fixtures rather than by code.

| Area | Real today | Missing |
|---|---|---|
| Sui Move | Published testnet package, live agent submission, live Move-enforced rejection, `seal_approve_packet` deployed | — |
| World AgentKit | Real signature and message verification for one registered agent | Live same-human/two-agent proof (RD-014, still PARTIAL); RD-180 makes the default `.env` fail |
| Provider API | Durable storage, AgentKit middleware, real Sui receipt verification | Server-side scoping and access grants (Epic L) |
| Agent | Deterministic rules, real signing, receipt parsing, service mode | — |
| Web | Wallet connect, mandate/listing PTBs, packet encryption, landlord decrypt | Forms instead of a conversation; packet still carries identity (Epic O) |
| Walrus | HTTP adapter verified byte-identical on testnet | CLI adapter implemented but never live-run |
| Seal | Policy live; landlord decrypts real applications in-browser, wrong wallet denied | Renter and landlord are still one browser wallet (RD-182) |

**Six tickets in Epic I are marked done with no evidence recorded.** See
`plan/evidence/RD-16*.md`. Treat those claims as unproven until someone re-runs them.
