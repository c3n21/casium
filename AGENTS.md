# AGENTS.md

## Current Repo State

- This repo is no longer planning-only: it is a working pnpm monorepo
  (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`) with a Sui Move
  package published to **testnet** (package ID
  `0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d`,
  see `packages/contracts-config/testnet.json` and `docs/sui-deployment.md`).
- The backlog is split by epic. `plan/backlog.md` is the **index** — lanes,
  dependency graph, parallel execution plan, and file-ownership rules. Ticket
  detail and `Status` fields live in the epic files:
  `plan/backlog-archive.md` (RD-001..RD-108, complete and frozen),
  `plan/backlog-completion.md` (Epic C, RD-109..RD-118, close the loop),
  `plan/backlog-walrus.md` (Epic W, RD-121..RD-126, live Walrus),
  `plan/backlog-seal.md` (Epic S, RD-131..RD-138, Seal access control),
  `plan/backlog-e2e.md` (Epic E, RD-141..RD-152, Playwright E2E tests),
  `plan/backlog-identity.md` (Epic I, RD-161..RD-166, agent identity binding),
  `plan/backlog-deploy.md` (Epic D, RD-171..RD-179, hosting the demo on the VPS),
  `plan/backlog-stretch.md` (RD-202, RD-203; RD-201 superseded by Epic S).
  `spec/development-spec.md` is the implementation contract for
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
- **You can drive the real app in a browser — read `docs/browser-testing.md` before any UI, wallet, or Seal work.** Browser access comes from your agent harness, not from this repo: opencode uses the Playwright MCP configured in `opencode.json`; Claude Code uses the `claude-in-chrome` skill. The two do **not** share wallet state.
- If Playwright MCP fails to launch after config changes, restart opencode; MCP config is loaded only at startup.
- `.playwright-wallet-profile/` persists a Slush **web**-wallet session (`my.slush.app` via Google sign-in). No browser extension is installed and none is needed — do not install one, and do not delete the profile to "clean up". Re-authenticating the session is the user's action, not an agent's.
- `.playwright-mcp/` console logs contain OAuth URLs and the user's email. Both directories are gitignored; never commit or paste their contents.

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
  walrus/           Walrus mock + browser HTTP + CLI adapters
  contracts-config/ Deployed testnet package/object IDs
  seal/             Seal client wrapper and browser decrypt flow
scripts/            demo-agentkit-duplicate.mjs, agentkit-live-request.html
docs/               demo-script, sui-deployment, provider-api, world-agentkit,
                    walrus-adapter, duplicate-human-demo
plan/backlog.md     Index: lanes, dep graph, parallel plan, file ownership
plan/backlog-*.md   Epic ticket files (archive, completion, walrus, seal, stretch)
spec/development-spec.md   Implementation contract (schemas, endpoints, Move spec)
```

## Status / Remaining Work

- All P0 tickets (RD-001–RD-014) are DONE except RD-014, which is PARTIAL: the duplicate-human rejection is proven via a controlled fixture, but full live proof needs a second EVM agent registered to the *same* World human — do not claim that live proof exists until it's actually run.
- P1 is DONE. RD-108 real agent Sui execution was proven live on 2026-07-25 (tx
  `BatrGYNdmzXA8wdEJT4XC4LXa55fZ6ezMAFcsbvAd1dm`, receipt
  `0xc6f490b959f23db9936090be9bdd52ede80cb685561cc528593f958978235865`, provider verification
  `accepted`), with World AgentKit in mock mode for that run and Walrus on the labeled mock adapter —
  see `packages/contracts-config/testnet.json` -> `liveAgentRun` and `docs/demo-script.md`.
  The completion epics are now DONE: provider persistence/live endpoints, packet handoff, AgentCap
  discovery, agent service mode, browser live-data views, Walrus HTTP live smoke, provider blob
  verification, Seal client/encryption/decrypt UI, and `seal_approve_packet` are implemented.
- Walrus live evidence: HTTP adapter upload/download verified byte-identical on testnet, blob
  `84g0OLjpe_P0nZYUqz2Vwy82C4EtTec0dNCXliXZCDc`. CLI adapter is implemented and tested but not
  live-run because no Walrus CLI config file was present.
- Seal live evidence: package upgraded to
  `0xbab0d70134d065a2f48ad8d18f2d8681de0464b7417485cbda8446eff31e8937` in tx
  `BLqv4XRxg5MEGAt4jDr1v2eeNzuauQ7MhixH5971HgyS`; Move denial matrix is unit-test proven.
- The workspace builds and all tests pass (143 JS/TS tests with 3 skips, plus 28 Move tests). Do not
  treat optional stretch work as bug-fixing.
- **One known runtime bug: RD-180, the AgentKit mode mismatch** — see the *Open Thread* section at the
  top of `plan/backlog.md`. Copying `.env.example` to `.env` verbatim puts the provider in
  `AGENTKIT_MODE=real` while the agent has no EVM key and falls back to mock headers, so *Start run*
  fails with `401 AGENTKIT_UNVERIFIED`. Tests pass because no test exercises that pairing. The user has
  deferred the fix until after the active epics; do not "helpfully" fix it mid-ticket, and do not claim
  live World verification on the demo path until it is resolved.
- RD-202 agent rotation and RD-203 zkLogin remain genuinely optional (`plan/backlog-stretch.md`).
- Before starting new work, check the ticket's `Status` field in its epic file rather than assuming
  from this file — statuses change. Respect the file-ownership matrix in `plan/backlog.md` before
  running agents in parallel; useful concurrency is about three, not one per lane.

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

> `docs/browser-testing.md` is the fuller version of this section — harness setup, ports, the wallet
> session prerequisite, and what a browser verification must capture. The notes below are the
> hard-won specifics; keep the two in sync if either changes.

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
- World: real AgentKit verification is live for one registered EVM agent address on World Chain (`eip155:480`) — see `docs/world-agentkit.md`. Full duplicate-human rejection across *two* agents backed by the same human is still only fixture-proven (RD-014 PARTIAL); don't claim it's live-proven without checking RD-014 in `plan/backlog-archive.md` first.
- The agent must not use renter wallet custody; it must use its own Sui address plus `AgentCap`.
- Listing eligibility must be checked against provider-created Sui `RentalListing` data, not attributes supplied by the agent.

## Privacy And Safety

- Use synthetic rental documents only; never add real identity, financial, or tenant-screening data.
- Never commit wallet seeds, private keys, mnemonics, `.env` files, or raw World human IDs.
- Store only `humanIdHash` offchain; raw AgentKit human identifiers should be hashed immediately.
- Walrus blobs are public; only encrypted ciphertext may be uploaded or referenced.
- Lease signing and fund transfer are out of scope and should not be represented as permissions.

## Cross-Agent Coordination

- One agent should own one ticket at a time and respect the `Blocks`/`Dependencies` fields in that ticket's epic file.
- Most of the backlog is already merged; before starting new work, check whether it's covered by an existing ticket's `Status` field rather than re-implementing something that's DONE.
- If using mocks to unblock parallel work, keep the same interface as the planned real integration and mark the mode clearly.
- Move engineers must hand off package ID, function names, struct fields, error codes, and example tx commands before Sui TS/client work finalizes.
- Backend engineers must hand off route docs, error codes, demo seed IDs, health endpoint, and AgentKit request requirements before frontend/agent E2E work finalizes.
- Walrus/Seal engineers must hand off packet schema, encryption metadata, blob adapter interface, Seal policy inputs, and fallback labels before landlord/document UI finalizes.
