# RentDelegate

> **World limits who the agent represents. Sui limits what the agent can do.**

RentDelegate is a scoped rental application agent built for ETHGlobal Lisbon 2026.
A human renter creates a Sui `RentalMandate` that defines what the agent is allowed to do.
World AgentKit proves the agent is backed by a verified human. The agent can only act within
both constraints simultaneously — it cannot exceed mandate scope, and it cannot act on behalf
of an unverified or duplicate human.

## Architecture

```
Renter wallet           → Sui: RentalMandate (scope), OwnerCap, AgentCap
Agent (apps/agent)      → World AgentKit: proves human identity
                        → Provider API: reserves application slot (duplicate-human guard)
                        → Sui: submits ApplicationReceipt on-chain
Provider (apps/provider-api) → Verifies Sui receipt, stores accepted application
Frontend (apps/web)     → Renter, provider, and landlord dashboards
Walrus                  → Encrypted document packet (mock in demo, CLI adapter included)
```

## Sponsor Integration Status

| Sponsor | Integration | Evidence |
|---|---|---|
| Sui | Live testnet Move package, on-chain mandate/listing/receipt objects | `packages/contracts-config/testnet.json`, `docs/sui-deployment.md` |
| World | Live AgentKit verification on World Chain (`eip155:480`) | `docs/world-agentkit.md` |
| Walrus | Mock adapter (labeled), CLI adapter implemented | `docs/walrus-adapter.md` |

## Packages

```
apps/
  web/            Next.js 16 + Sui dApp Kit frontend (renter, provider, landlord)
  provider-api/   Hono API — listings, application reservation, receipt verification
  agent/          Deterministic Node.js agent — mandate-scoped, AgentKit-authenticated
packages/
  move/           Sui Move smart contracts (published to testnet)
  shared/         Zod schemas, constants, errors, PacketDocument
  sui-client/     TypeScript Sui gRPC client + PTB builders
  agentkit/       World AgentKit mock + real verifier
  walrus/         Walrus mock + CLI adapter
  contracts-config/ Deployed testnet package ID and object IDs
scripts/
  demo-agentkit-duplicate.mjs   Duplicate-human demo
  agentkit-live-request.html    MetaMask AgentKit header helper
docs/
  demo-script.md     ← This run guide
  sui-deployment.md
  provider-api.md
  world-agentkit.md
  walrus-adapter.md
  duplicate-human-demo.md
```

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 22 | `node --version` |
| pnpm | 11 | `pnpm --version` |
| Sui CLI | testnet-compatible | `~/.local/bin/sui --version` |

Do **not** export `~/.local/bin` to `PATH` for this repo. Use full paths.

## Install

```bash
pnpm install
```

## Environment Variables

Create a local `.env` file (not committed) for live modes:

```env
# Sui
SUI_PACKAGE_ID=0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d
SUI_RPC_URL=https://fullnode.testnet.sui.io:443

# AgentKit (real mode)
AGENTKIT_MODE=real
AGENTKIT_EVM_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public
AGENTKIT_HEADER=<base64-encoded-agentkit-header>

# Provider API
PROVIDER_API_URL=http://localhost:3000

# Agent
MANDATE_ID=0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee
AGENT_SUI_ADDRESS=0x371321932fb4c4b79b9b0762ac0878ebfb670cc6f6327ecf9d1d06cd9489243e
AGENT_EVM_ADDRESS=0x662DbABBeff9B237490bBE6A898776a4A1D87CCe
AGENT_CAP_ID=0xabeb55d1266102eed4235531c542fb01fd85bb3095c3d579960923f2e1e25c2a
```

All of the above are pre-filled with testnet smoke values where applicable. Only `AGENTKIT_HEADER`
requires a real signed header from MetaMask (see `docs/world-agentkit.md`).

## Build + Test

```bash
# Build all packages
pnpm -r --if-present build

# Test all packages
pnpm -r --if-present test

# Move tests
~/.local/bin/sui move build --path packages/move
~/.local/bin/sui move test --path packages/move
```

## Run The Demo

See `docs/demo-script.md` for the full step-by-step walkthrough.

Quick start:

```bash
# 1. Start provider API (mock AgentKit mode)
pnpm --filter @rentdelegate/provider-api build
pnpm --filter @rentdelegate/provider-api start

# 2. Start frontend
pnpm --filter @rentdelegate/web build
pnpm --filter @rentdelegate/web start

# 3. Run duplicate-human demo script
pnpm demo:duplicate-human

# 4. Run agent (reads from testnet, reports PTB)
node apps/agent/dist/index.js
```

## Safety

- Use synthetic rental documents only. Never enter real identity, financial, or screening data.
- Never commit `.env`, wallet seeds, private keys, mnemonics, or raw World human IDs.
- Walrus blobs are public — only encrypted ciphertext may be uploaded or referenced.
- Lease signing and fund transfer are out of scope and intentionally impossible in the Move module.
