# AGENTS.md

## Current Repo State

- This repo is no longer planning-only: it is a working pnpm monorepo
  (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`) with a Sui Move
  package published to **testnet** (package ID
  `0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d`,
  see `packages/contracts-config/testnet.json` and `docs/sui-deployment.md`).
- `plan/backlog.md` is the ticket-status source of truth (RD-001..RD-014 P0
  are DONE; P1 RD-101..RD-108 are DONE or PARTIAL; P2 RD-201..RD-203 are not
  started). `spec/development-spec.md` is the implementation contract for
  object shapes, endpoints, and schemas — if it conflicts with executable
  config, trust the code.
- `README.md` is current and authoritative for setup, env vars, build/test
  commands, and the demo quick-start; prefer it over this file for "how do I
  run this" questions.
- `docs/` contains `demo-script.md`, `sui-deployment.md`, `provider-api.md`,
  `world-agentkit.md`, `walrus-adapter.md`, `duplicate-human-demo.md` — read
  the relevant one before touching that subsystem.

## Environment

- The user is working in Arch Linux inside distrobox; do not assume NixOS commands or Nix flakes for this repo unless a future repo file adds them.
- Sui and Walrus are installed in `~/.local/bin/`, but the user does not want that directory exported into `PATH`. Use `~/.local/bin/sui` and `~/.local/bin/walrus` directly if `sui` or `walrus` are not found.
- Do not edit shell startup files or export PATH globally for this repo.
- Browser inspection is configured project-locally via `opencode.json` using Playwright MCP and `pnpm dlx @playwright/mcp`, pointed at a persistent profile in `.playwright-wallet-profile/`.
- If Playwright MCP fails to launch after config changes, restart opencode; MCP config is loaded only at startup.

## Repo-Local Skills

- Sui and Walrus reference skills exist in three parallel copies: `agent/skills/`, `.agents/skills/`, and `.claude/skills/` (same content). They may not be registered with the runtime `skill` tool, so discover them with file search and read their `SKILL.md` files directly when relevant.
- Use `agent/skills/sui-client/SKILL.md` before Sui client setup, address management, faucet, balance, or gas work.
- Use `agent/skills/sui-publish/SKILL.md` before publish/deploy work, test-publish, dry-runs, upgrade caps, or package ID handoff.
- Use `agent/skills/sui-move-project/SKILL.md`, `agent/skills/sui-build/SKILL.md`, `agent/skills/sui-move/SKILL.md`, `agent/skills/modern-move-syntax/SKILL.md`, `agent/skills/sui-object-model/SKILL.md`, `agent/skills/composable-move-functions/SKILL.md`, and `agent/skills/move-unit-testing/SKILL.md` for Move package, syntax, object-model, and test work on `packages/move/`.
- Use `agent/skills/ptbs/SKILL.md` for Sui CLI/PTB construction patterns.
- Use `agent/skills/walrus-sites/`, `agent/skills/accessing-data/`, and related Walrus skills only for Walrus/storage work; keep Walrus mocks clearly labeled if used.
- Repo-specific constraints still override skill docs: do not export `~/.local/bin` to `PATH`, do not edit shell startup files, do not commit secrets, and do not claim Sui or World integrations are real unless they are live-verified.

## Repository Structure

```
apps/
  web/            Next.js 16 + Sui dApp Kit frontend (renter, provider, landlord)
  provider-api/   Hono API — listings, application reservation, receipt verification
  agent/          Deterministic Node.js agent — mandate-scoped, AgentKit-authenticated
packages/
  move/             Sui Move contracts (published to testnet)
  shared/           Zod schemas, constants, errors, PacketDocument
  sui-client/       Sui gRPC client + PTB builders
  agentkit/         World AgentKit mock + real verifier
  walrus/           Walrus mock + CLI adapter
  contracts-config/ Deployed testnet package/object IDs
  seal/             Stub only — P2 stretch, not implemented
scripts/            demo-agentkit-duplicate.mjs, agentkit-live-request.html
docs/               demo-script, sui-deployment, provider-api, world-agentkit,
                    walrus-adapter, duplicate-human-demo
plan/backlog.md     Ticket-level status and dependency graph
spec/development-spec.md   Implementation contract (schemas, endpoints, Move spec)
```

## Status / Remaining Work

- All P0 tickets (RD-001–RD-014) are DONE except RD-014, which is PARTIAL: the duplicate-human rejection is proven via a controlled fixture, but full live proof needs a second EVM agent registered to the *same* World human — do not claim that live proof exists until it's actually run.
- P1 is DONE. RD-108 real agent Sui execution was proven live on 2026-07-25 (tx
  `BatrGYNdmzXA8wdEJT4XC4LXa55fZ6ezMAFcsbvAd1dm`, receipt
  `0xc6f490b959f23db9936090be9bdd52ede80cb685561cc528593f958978235865`, provider verification
  `accepted`), with World AgentKit in mock mode for that run and Walrus on the labeled mock adapter —
  see `packages/contracts-config/testnet.json` -> `liveAgentRun` and `docs/demo-script.md`.
  One live-smoke gap remains: RD-101 Walrus real upload (mock + CLI adapter code is done and tested;
  only the live network upload was skipped). Do not run it without the user's explicit go-ahead,
  since it spends live wallet resources.
- P2 (RD-201 Seal, RD-202 agent rotation, RD-203 zkLogin) is not started and is explicitly non-critical-path; do not risk core Sui/World demo stability for it.
- Before starting new work, check `plan/backlog.md` for the ticket's current `Status` field rather than assuming from this file — statuses change.

## Commands

```bash
# Install (repo root)
pnpm install

# Build / test everything
pnpm -r --if-present build
pnpm -r --if-present test

# Per-package (examples)
pnpm --filter @rentdelegate/web build
pnpm --filter @rentdelegate/web typecheck   # run after wallet/tx-result parsing changes
pnpm --filter @rentdelegate/provider-api build
pnpm --filter @rentdelegate/agent build

# Move build/test
~/.local/bin/sui move build --path packages/move
~/.local/bin/sui move test --path packages/move

# Duplicate-human demo
pnpm demo:duplicate-human

# Agent env/signer check
pnpm --filter @rentdelegate/agent check:env
```

If `sui`/`walrus` are not on `PATH`, use `~/.local/bin/sui ...` / `~/.local/bin/walrus ...` instead. See `README.md` for the full run-the-demo sequence (provider API, frontend, agent) and required env vars.

## Local Web Server During Browser Testing

- For short browser smoke tests, it is acceptable to keep the web app running in the background with `nohup`, for example `nohup pnpm --filter @rentdelegate/web start > /tmp/rentdelegate-web.log 2>&1 &`.
- Use `pnpm --filter @rentdelegate/web start` only after a successful production build; it serves the built app and does not hot-reload.
- For active UI development, prefer `pnpm --filter @rentdelegate/web dev`; if it must run in the background, use `nohup pnpm --filter @rentdelegate/web dev > /tmp/rentdelegate-web.log 2>&1 &`.
- Before starting a background web server, check whether port `3000` is already in use and avoid leaving stale processes running.
- Treat `nohup` as a pragmatic local testing helper, not as project infrastructure. For repeated demo workflows, prefer a documented script, `tmux`, or another explicit process manager that makes logs and cleanup clear.

## Sui Wallet Browser Testing

- For Slush browser flows, prefer wallet `signTransaction` plus app-side Sui `executeTransaction` when wallet `signAndExecuteTransaction` is unreliable or popup handoff fails.
- Always set explicit gas before wallet signing. Select a live SUI gas coin, call `tx.setGasBudget(...)`, and call `tx.setGasPayment(...)`; do not rely on unresolved wallet gas data for Slush requests.
- When parsing executed Sui gRPC results for created object types, request `include: { effects: true, objectTypes: true }`.
- In the `@mysten/sui` gRPC client, parsed `effects.changedObjects` may not include `objectType`; join created `objectId` values with `result.objectTypes[objectId]`.
- Do not use transaction digests, placeholder strings, or labels like `(see tx)` as Sui object IDs. For `create_mandate`, extract and store `RentalMandate`, `OwnerCap`, and `AgentCap` object IDs.
- Persistent Playwright/Slush browser state is useful, but old wallet tabs can hold stale transaction bytes, gas versions, or request payloads.
- It is acceptable to refresh, close, or reopen browser tabs during Playwright testing if it helps clear stale dapp or wallet state.
- After changing signing or execution code, reload the app tab and start a fresh wallet request instead of approving an already-open Slush request.
- Browser tests should verify both wallet approval and post-approval app state; a successful signature alone is not enough if the app still fails result parsing or object reads.
- For Sui CLI object debugging, this installed CLI accepts `sui client objects <address> --json`; do not assume `--address` is supported.
- Do not assume legacy JSON-RPC endpoints for browser-path debugging. The frontend uses Sui gRPC through `@mysten/sui`.

## Frontend Verification Notes

- Run `pnpm --filter @rentdelegate/web typecheck` after frontend wallet or transaction-result parsing changes; `next build` can succeed while skipping type validation.
- BigInt gas budgets require the web TypeScript target to be `ES2020` or newer.
- `next build` may mutate `apps/web/tsconfig.json` and re-add `.next/dev/types/**/*.ts` to `include`.
- If stale `.next/dev` validator files break typecheck while source routes are valid, explicitly exclude `.next/dev` rather than treating generated dev artifacts as application source.
- `tsc --noEmit` may update `apps/web/tsconfig.tsbuildinfo`; inspect this as generated incremental state before treating it as a meaningful source change.

## Sponsor-Critical Constraints

- Do not fake Sui or World integrations. Mock only Walrus/Seal fallbacks, and label mocks clearly in UI and README.
- Core message to preserve: "World limits who the agent represents. Sui limits what the agent can do."
- Sui: real testnet Move package enforces mandate scope via `RentalMandate`, `OwnerCap`, `AgentCap`, `RentalListing`, and `ApplicationReceipt` — this is fully live (`docs/sui-deployment.md`).
- World: real AgentKit verification is live for one registered EVM agent address on World Chain (`eip155:480`) — see `docs/world-agentkit.md`. Full duplicate-human rejection across *two* agents backed by the same human is still only fixture-proven (RD-014 PARTIAL); don't claim it's live-proven without checking `plan/backlog.md` first.
- The agent must not use renter wallet custody; it must use its own Sui address plus `AgentCap`.
- Listing eligibility must be checked against provider-created Sui `RentalListing` data, not attributes supplied by the agent.

## Privacy And Safety

- Use synthetic rental documents only; never add real identity, financial, or tenant-screening data.
- Never commit wallet seeds, private keys, mnemonics, `.env` files, or raw World human IDs.
- Store only `humanIdHash` offchain; raw AgentKit human identifiers should be hashed immediately.
- Walrus blobs are public; only encrypted ciphertext may be uploaded or referenced.
- Lease signing and fund transfer are out of scope and should not be represented as permissions.

## Cross-Agent Coordination

- One agent should own one ticket at a time and respect `Blocks`/`Dependencies` in `plan/backlog.md`.
- Most of the backlog is already merged; before starting new work, check whether it's covered by an existing ticket's `Status` field rather than re-implementing something that's DONE.
- If using mocks to unblock parallel work, keep the same interface as the planned real integration and mark the mode clearly.
- Move engineers must hand off package ID, function names, struct fields, error codes, and example tx commands before Sui TS/client work finalizes.
- Backend engineers must hand off route docs, error codes, demo seed IDs, health endpoint, and AgentKit request requirements before frontend/agent E2E work finalizes.
- Walrus/Seal engineers must hand off packet schema, encryption metadata, blob adapter interface, Seal policy inputs, and fallback labels before landlord/document UI finalizes.
