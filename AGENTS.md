# AGENTS.md

## Current Repo State

- This repo is currently planning-first: no `README`, package manifests, workspace config, lockfile, CI, or app source exists yet.
- Treat `plan/backlog.md` as the source of truth for architecture, ticket IDs, dependencies, and demo definition of done until executable configs exist.
- `spec/` exists but is empty.

## Environment

- The user is working in Arch Linux inside distrobox; do not assume NixOS commands or Nix flakes for this repo unless a future repo file adds them.
- Sui and Walrus are installed in `~/.local/bin/`, but the user does not want that directory exported into `PATH`. Use `~/.local/bin/sui` and `~/.local/bin/walrus` directly if `sui` or `walrus` are not found.
- Do not edit shell startup files or export PATH globally for this repo.
- Prefer project-local tooling once `package.json`/workspace files exist; do not suggest global npm installs for repo dependencies.
- Browser inspection is configured project-locally via `opencode.json` using Playwright MCP and `pnpm dlx @playwright/mcp`.
- If Playwright MCP fails to launch after config changes, restart opencode; MCP config is loaded only at startup.
- The current MCP command points at the Playwright-managed Chromium executable under `~/.cache/ms-playwright/`.

## Repo-Local Skills

- Sui and Walrus reference skills are stored in `agent/skills/`. They may not be registered with the runtime `skill` tool, so discover them with file search and read their `SKILL.md` files directly when relevant.
- Use `agent/skills/sui-client/SKILL.md` before Sui client setup, address management, faucet, balance, or gas work.
- Use `agent/skills/sui-publish/SKILL.md` before RD-007 publish/deploy work, test-publish, dry-runs, upgrade caps, or package ID handoff.
- Use `agent/skills/sui-move-project/SKILL.md`, `agent/skills/sui-build/SKILL.md`, `agent/skills/sui-move/SKILL.md`, `agent/skills/modern-move-syntax/SKILL.md`, `agent/skills/sui-object-model/SKILL.md`, `agent/skills/composable-move-functions/SKILL.md`, and `agent/skills/move-unit-testing/SKILL.md` for Move package, syntax, object-model, and test work.
- Use `agent/skills/ptbs/SKILL.md` for Sui CLI PTB construction and transaction command patterns.
- Use `agent/skills/walrus-sites/`, `agent/skills/accessing-data/`, and related Walrus skills only for Walrus/storage work; keep Walrus mocks clearly labeled if used.
- Repo-specific constraints still override skill docs: do not export `~/.local/bin` to `PATH`, do not edit shell startup files, do not commit secrets, and do not claim Sui or World integrations are real unless they are live-verified.

## Planned Structure

- Planned monorepo package manager: `pnpm` workspaces.
- Planned apps: `apps/web`, `apps/provider-api`, `apps/agent`.
- Planned packages: `packages/move`, `packages/shared`, `packages/sui-client`, `packages/agentkit`, `packages/walrus`, `packages/seal`, `packages/contracts-config`.
- Planned support dirs: `scripts`, `docs`, `plan`.

## Dependency Order

- Start with RD-001 project skeleton before adding real app/package work.
- Freeze shared schemas/constants in RD-002 before backend, frontend, Walrus packet, or agent implementation.
- Sui order is RD-003 -> RD-004 -> RD-005 -> RD-006 -> RD-007 -> RD-008.
- Backend order is RD-009 -> RD-010 -> RD-011, with RD-012 AgentKit middleware required before real application reservation demo.
- RD-013 receipt verification depends on RD-008 and RD-011.
- RD-014 duplicate-human proof depends on RD-012 and RD-013.
- Treat Seal as P2 only; do not risk the core Sui + AgentKit demo for it.

## Commands Currently Documented

- After RD-001 exists, expected workspace checks are `pnpm -r --if-present build` and `pnpm -r --if-present test`.
- After RD-003 exists, expected Move checks are `sui move build --path packages/move` and `sui move test --path packages/move`.
- If `sui` is not on `PATH`, run `~/.local/bin/sui move build --path packages/move` and `~/.local/bin/sui move test --path packages/move` instead.
- If `walrus` is not on `PATH`, run `~/.local/bin/walrus ...` instead.
- Do not invent additional commands until manifests/scripts exist; read executable config first once added.

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
- Core message to preserve: “World limits who the agent represents. Sui limits what the agent can do.”
- World proof requires real AgentKit verification for at least one flow plus duplicate-human rejection by `UNIQUE(listing_id, human_id_hash)` or equivalent.
- Sui proof requires real testnet Move objects enforcing mandate scope: `RentalMandate`, `OwnerCap`, `AgentCap`, `RentalListing`, and `ApplicationReceipt`.
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
- If using mocks to unblock parallel work, keep the same interface as the planned real integration and mark the mode clearly.
- Move engineers must hand off package ID, function names, struct fields, error codes, and example tx commands before Sui TS/client work finalizes.
- Backend engineers must hand off route docs, error codes, demo seed IDs, health endpoint, and AgentKit request requirements before frontend/agent E2E work finalizes.
- Walrus/Seal engineers must hand off packet schema, encryption metadata, blob adapter interface, Seal policy inputs, and fallback labels before landlord/document UI finalizes.
