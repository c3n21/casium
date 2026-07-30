---
letter: C
name: "Close The Loop"
range: 109-119
status: active
---

# Epic C — Close The Loop

> Background only. You do **not** need this file to execute a ticket —
> `node scripts/backlog.mjs show RD-xxx` tells you what to load.
> Tickets live in `plan/tickets/`; status is in `plan/state.md`.

Parent index: `plan/backlog.md`. Contract: `spec/development-spec.md`.

## Why This Epic Exists

Every stage of Casium works in isolation and is live-proven on testnet, but the stages are
joined to each other by hand-edited environment variables and hardcoded demo fixtures, not by code.
As of 2026-07-25 the whole workspace builds and all 57 tests pass, so this epic is not about fixing
breakage — it is about replacing the four human-in-the-middle seams with real wiring.

| Seam | Evidence |
|---|---|
| Provider state is in-memory; the Postgres layer is dead code | `apps/provider-api/src/services/listings.ts:41` and `services/applications.ts` use `Map`; `src/db/client.ts` `createDb` is imported by nothing outside itself; `drizzle/0001_initial.sql` is only exercised by `pg-mem` in `src/db/schema.test.ts`. |
| Renter's encrypted packet never reaches the agent | `apps/web/src/components/PacketBuilder.tsx:9` uploads to a `Map` built inside the component; the blob ID and AES key stay in React state. The agent independently calls `makeSyntheticPacket()` + `createMockWalrusAdapter()` (`apps/agent/src/index.ts:68`). |
| A mandate created in the UI is invisible to the agent | Agent reads `MANDATE_ID` / `AGENT_CAP_ID` from env constants (`apps/agent/src/index.ts:28`). `AgentCap` is per-mandate by design, so each new renter needs a manual `.env` edit and a re-run. |
| Dashboards read fixtures, not the system | `apps/web/app/provider/page.tsx:7` (`DEMO_APPLICATION_IDS = ["app_1"]`), `app/landlord/page.tsx:8` (`SMOKE_RECEIPT_ID`), `app/renter/page.tsx:20` (`smokeMandate`). There is no `GET /applications` endpoint, so the inbox could not discover applications even if asked to. |

None of this required new architecture. It is mechanical wiring against interfaces that already exist.

