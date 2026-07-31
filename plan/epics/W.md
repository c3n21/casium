---
letter: W
name: "Live Walrus Storage"
range: 121-129
status: active
---

# Epic W — Live Walrus Storage

> Background only. You do **not** need this file to execute a ticket —
> `node scripts/backlog.mjs show RD-xxx` tells you what to load.
> Tickets live in `plan/tickets/`; status is in `plan/state.md`.

Parent index: `plan/backlog.md`. Contract: `spec/development-spec.md` §10. Supersedes the "live upload
skipped" half of RD-101.

## Why This Epic Exists

RD-101 delivered a correct adapter interface and a working mock, and the CLI adapter is implemented
and unit-tested. What has never happened is a byte reaching the Walrus network. Three consequences:

| Gap | Evidence |
|---|---|
| No live upload has ever run | RD-101 verification explicitly records the live smoke as skipped to avoid spending wallet resources. `packages/contracts-config/testnet.json` has no Walrus blob entry. |
| There is no browser-usable adapter | `packages/walrus/src/http.ts` is **misnamed** — it exports `createWalrusCliAdapter`, which spawns `~/.local/bin/walrus` via `node:child_process`. There is no HTTP publisher/aggregator client and no `@mysten/walrus` dependency anywhere in the workspace, so `PacketBuilder` cannot reach Walrus at all and falls back to an in-component `Map`. |
| Blob lifetime is unrelated to access lifetime | The adapter defaults to `WALRUS_EPOCHS=1` while `ApplicationReceipt.access_expires_at_ms` is set independently. A blob can expire while the on-chain grant still says the landlord may read it. |

**Cost warning.** Every ticket here that touches the live network spends real testnet WAL and SUI from
the configured wallet. Do not run RD-123 or RD-124 without the user's explicit go-ahead, per the
standing repo rule.

