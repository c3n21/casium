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
