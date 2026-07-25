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
Frontend (apps/web)     → Renter, provider, landlord, and agent operator dashboards
Walrus                  → Encrypted document packet (mock/http/cli modes; live HTTP smoke verified)
```

## Sponsor Integration Status

| Sponsor | Integration | Evidence |
|---|---|---|
| Sui | Live testnet Move package, on-chain mandate/listing/receipt objects | `packages/contracts-config/testnet.json`, `docs/sui-deployment.md` |
| World | Live AgentKit verification on World Chain (`eip155:480`) | `docs/world-agentkit.md` |
| Walrus | Live testnet HTTP upload verified; mock and CLI modes remain labeled | `docs/walrus-adapter.md`, blob `84g0OLjpe_P0nZYUqz2Vwy82C4EtTec0dNCXliXZCDc` |
| Seal | Policy-controlled access path implemented; `seal_approve_packet` deployed in upgraded testnet package | `docs/seal.md`, upgrade tx `BLqv4XRxg5MEGAt4jDr1v2eeNzuauQ7MhixH5971HgyS` |

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
  walrus/         Walrus mock + browser HTTP + CLI adapters
  seal/           Seal client wrapper and browser decrypt flow
  contracts-config/ Deployed testnet package ID and object IDs
scripts/
  demo-agentkit-duplicate.mjs   Duplicate-human demo
  agentkit-live-request.html    MetaMask AgentKit header helper
docs/
  demo-script.md     ← This run guide
  browser-testing.md ← Driving the app in a browser (wallet flows, Seal)
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
SUI_PACKAGE_ID=0xbab0d70134d065a2f48ad8d18f2d8681de0464b7417485cbda8446eff31e8937
SUI_RPC_URL=https://fullnode.testnet.sui.io:443

# AgentKit (real mode)
AGENTKIT_MODE=real
AGENTKIT_EVM_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public
AGENTKIT_HEADER=<base64-encoded-agentkit-header>

# Provider API
PROVIDER_API_URL=http://localhost:4021
PROVIDER_STORE=memory

# Storage / encryption
WALRUS_MODE=mock
NEXT_PUBLIC_WALRUS_MODE=mock
NEXT_PUBLIC_ENCRYPTION_MODE=mock

# Agent
AGENT_SERVER_PORT=4022
MANDATE_ID=0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee
AGENT_SUI_ADDRESS=0x371321932fb4c4b79b9b0762ac0878ebfb670cc6f6327ecf9d1d06cd9489243e
AGENT_EVM_ADDRESS=0x662DbABBeff9B237490bBE6A898776a4A1D87CCe
# Optional override; by default the agent discovers the AgentCap for MANDATE_ID.
AGENT_CAP_ID=0xabeb55d1266102eed4235531c542fb01fd85bb3095c3d579960923f2e1e25c2a
AGENT_SUI_PRIVATE_KEY=suiprivkey...
# or AGENT_SUI_PRIVATE_KEY_BASE64=<32-byte-ed25519-secret-key-base64>

# Agent -> provider running AGENTKIT_MODE=mock (local Sui-focused runs only)
AGENTKIT_DEMO_HUMAN_ID_HASH=sha256:local-demo
AGENTKIT_DEMO_AGENT_EVM_ADDRESS=0x662DbABBeff9B237490bBE6A898776a4A1D87CCe
```

All object/address values are pre-filled with testnet smoke values where applicable. `AGENTKIT_HEADER`
requires a real signed header from MetaMask (see `docs/world-agentkit.md`). `AGENT_SUI_PRIVATE_KEY`
or `AGENT_SUI_PRIVATE_KEY_BASE64` is optional; without it the agent prints a PTB-only fallback. Never commit it.

The `AGENTKIT_DEMO_*` pair is the opt-in mock path for exercising the Sui flow without a signed header.
It only works against a provider started with `AGENTKIT_MODE=mock`, both variables must be set, a real
`AGENTKIT_HEADER` always takes precedence, and the agent labels the run `[MOCK]`. It proves nothing
about World identity.

### Web app: mock vs live packet upload

The browser bundle reads only `NEXT_PUBLIC_*` variables, and Next.js **inlines them at build time** —
after editing, restart `next dev`; a hot reload will not pick them up. Put them in `apps/web/.env.local`
(see `apps/web/.env.example`).

| Variable | `mock` (default when unset) | Live |
|---|---|---|
| `NEXT_PUBLIC_ENCRYPTION_MODE` | AES-GCM in-browser, key held in page state | `seal` — policy-gated, keys in Seal key servers |
| `NEXT_PUBLIC_WALRUS_MODE` | in-memory `Map`, blob IDs prefixed `mock:` | `http` — real Walrus testnet publisher/aggregator |

With no `.env.local` present, **both default to `mock`** and the Upload Application Packet panel shows
`[MOCK encryption — AES-GCM, key in browser only]`. The upload still succeeds and still registers with
the provider API, so a `201` is not evidence that Seal or Walrus ran — check the badge and the blob ID
prefix.

Two mock-mode limitations, both expected:

- `NEXT_PUBLIC_ENCRYPTION_MODE=seal` silently falls back to the AES-GCM branch unless `PacketBuilder`
  also receives a `listingObjectId` — the Seal identity cannot be derived without it.
- A `mock:` blob lives in a `Map` created inside `handleBuild` and discarded when it returns. The blob
  ID is registered with the provider but is unresolvable afterwards, so `PacketViewer` cannot decrypt
  it. Use `NEXT_PUBLIC_WALRUS_MODE=http` for anything involving the landlord decrypt flow.

Live mode needs no credentials: the Walrus HTTP adapter defaults to the public testnet
publisher/aggregator, and Seal defaults to the two Mysten open-mode testnet key servers.

## Single-Agent Model

For the demo and current implementation, RentDelegate assumes one stable agent identity:

- `AGENT_SUI_ADDRESS` is the deployed agent service's stable Sui address.
- `AGENT_SUI_PRIVATE_KEY` or `AGENT_SUI_PRIVATE_KEY_BASE64` must derive exactly that address.
- Every renter mandate should authorize that same stable `AGENT_SUI_ADDRESS`.
- Each mandate still creates its own `AgentCap`, transferred to the stable agent address.
- `AGENT_CAP_ID` is per mandate, not a global agent identity.

The agent signs all Sui submissions with the same stable agent key, but each transaction must use the
`AgentCap` matching the target `MANDATE_ID`. Multi-agent wallet management is intentionally out of scope.

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

# 4. Check the agent signer/address before Sui execution
pnpm --filter @rentdelegate/agent check:env

# 5. Run agent (executes only if an env-only agent Sui private key is configured)
node apps/agent/dist/index.js
```

## Safety

- Use synthetic rental documents only. Never enter real identity, financial, or screening data.
- Never commit `.env`, wallet seeds, private keys, mnemonics, or raw World human IDs.
- Walrus blobs are public — only encrypted ciphertext may be uploaded or referenced.
- Lease signing and fund transfer are out of scope and intentionally impossible in the Move module.
