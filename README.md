# RentDelegate

RentDelegate demonstrates a scoped rental application agent: World limits who the agent represents, and Sui limits what the agent can do.

## Status

This repository is in active hackathon development. The current skeleton establishes the planned pnpm workspace layout so implementation tickets can land independently.

## Tooling

- Target runtime: Node.js 22 LTS or newer.
- Package manager: pnpm 11, pinned by `packageManager` in `package.json`.
- Use project-local dependencies only; do not install repo dependencies globally.

## Workspace

```text
apps/
  web/
  provider-api/
  agent/
packages/
  move/
  shared/
  sui-client/
  agentkit/
  walrus/
  seal/
  contracts-config/
scripts/
docs/
plan/
spec/
```

## Safety

- Use synthetic rental documents only.
- Never commit `.env` files, wallet seeds, private keys, mnemonics, generated Sui keystores, or raw World human IDs.
- Walrus blobs are public; only encrypted ciphertext may be uploaded or referenced.
- Lease signing and fund transfer are out of scope.

## Initial Checks

After installing dependencies with `pnpm install`, run:

```bash
pnpm -r --if-present build
pnpm -r --if-present test
```
