# Casium

> **World limits who the agent represents. Sui limits what the agent can do.**

Casium is a scoped rental application agent built on Sui and World.
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

## Integration Status

| Component | Integration | Evidence |
|---|---|---|
| Sui | Live testnet Move package, on-chain mandate/listing/receipt objects | `packages/contracts-config/testnet.json`, `docs/sui-deployment.md` |
| World | Live AgentKit verification on World Chain (`eip155:480`) | `docs/world-agentkit.md` |
| Walrus | Live testnet storage on the demo path: browser uploads ciphertext, the provider re-downloads it and matches the packet hash before accepting; mock and CLI modes remain labeled | `docs/walrus-adapter.md`, demo blob `ZjKENP5vQbR9iqg0WB5bRhmzpxb8OLMSobAKbN6buag` (861 B, hash-verified), first smoke blob `84g0OLjpe_P0nZYUqz2Vwy82C4EtTec0dNCXliXZCDc` |
| Seal | Policy-controlled access exercised end to end: landlord decrypted a live application in-browser, wrong wallet denied with `ESEAL_WRONG_SENDER` | `docs/seal.md` → *Live Browser Evidence*, receipt `0x80122d30…`, upgrade tx `BLqv4XRxg5MEGAt4jDr1v2eeNzuauQ7MhixH5971HgyS` |

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

Copy `.env.example` to `.env` at the repo root:

```bash
cp .env.example .env
```

The provider API and agent load it automatically — their `start` scripts pass
`node --env-file-if-exists=../../.env`, so no `dotenv` or manual `export` is needed. `pnpm demo:up`
sources the same file.

**The browser does not read it.** Web app settings live in `apps/web/.env.local` and are inlined at
build time (see below).

Reference of every variable:

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

# Browser-facing public origins for the exposed demo
NEXT_PUBLIC_PROVIDER_API_URL=https://api.zhifan.me
NEXT_PUBLIC_AGENT_API_URL=https://agent.zhifan.me

# Storage / encryption — these are the live-demo values, matching the shipped
# .env.example and apps/web/.env.example. Set all three to `mock` for an
# offline run; see "Web app: mock vs live packet upload" below.
# Server side accepts `real` and `http` as the same thing (both select the HTTP
# adapter). The browser does NOT: apps/web/src/components/PacketBuilder.tsx
# treats anything other than `http` or `cli` as mock, so writing `real` into
# NEXT_PUBLIC_WALRUS_MODE silently downgrades uploads to an in-memory Map while
# the server still reports live. Use `http` for the browser variable.
WALRUS_MODE=real
NEXT_PUBLIC_WALRUS_MODE=http
NEXT_PUBLIC_ENCRYPTION_MODE=seal

# Agent
AGENT_SERVER_PORT=4022
MANDATE_ID=0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee
AGENT_SUI_ADDRESS=0x371321932fb4c4b79b9b0762ac0878ebfb670cc6f6327ecf9d1d06cd9489243e
AGENT_EVM_ADDRESS=0x662DbABBeff9B237490bBE6A898776a4A1D87CCe
# Optional override; by default the agent discovers the AgentCap for MANDATE_ID.
AGENT_CAP_ID=0xabeb55d1266102eed4235531c542fb01fd85bb3095c3d579960923f2e1e25c2a
AGENT_SUI_PRIVATE_KEY=suiprivkey...
# or AGENT_SUI_PRIVATE_KEY_BASE64=<32-byte-ed25519-secret-key-base64>
# Landlord document-access window written onto the receipt. Defaults to 3 days and
# must stay inside the packet blob's Walrus lifetime, or the run aborts before gas.
# See "Access window vs blob lifetime" below.
AGENT_ACCESS_WINDOW_DAYS=3

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

For the exposed demo, the public proxy serves `casium.zhifan.me`, `api.zhifan.me`, and
`agent.zhifan.me`, then forwards over the tailnet to this machine at `100.64.0.5`. The local `Caddyfile`
maps tailnet ports `3030`, `5050`, and `4040` to the web app, provider API, and agent service. Restart
`next dev`, or rebuild the web app, after changing any `NEXT_PUBLIC_*` URL because Next.js inlines these
values into the browser bundle.

### Web app: mock vs live packet upload

The browser bundle reads only `NEXT_PUBLIC_*` variables, and Next.js **inlines them at build time** —
after editing, restart `next dev`; a hot reload will not pick them up. Put them in `apps/web/.env.local`
(see `apps/web/.env.example`).

| Variable | `mock` (default when unset) | Live |
|---|---|---|
| `NEXT_PUBLIC_ENCRYPTION_MODE` | AES-GCM in-browser, key held in page state | `seal` — policy-gated, keys in Seal key servers |
| `NEXT_PUBLIC_WALRUS_MODE` | in-memory `Map`, blob IDs prefixed `mock:` | `http` — real Walrus testnet publisher/aggregator. **`real` is not accepted here** — only `http` or `cli`; anything else falls through to mock (`PacketBuilder.tsx:18`). The server-side `WALRUS_MODE` does accept `real` as an alias for `http`, so the two variables are not interchangeable. |

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

### Access window vs blob lifetime

Three independent timers govern landlord document access. They are easy to confuse, and two of them
must agree or an agent run aborts.

| Timer | Lives in | Default | Governs |
|---|---|---|---|
| Access window | `ApplicationReceipt.access_expires_at_ms`, on chain | 3 days (`AGENT_ACCESS_WINDOW_DAYS`) | Whether the landlord may decrypt at all — enforced by `seal_approve_packet` |
| Blob lifetime | Walrus epochs (1 epoch ≈ 1 day) | 5 epochs | Whether the ciphertext still exists to download |
| SessionKey TTL | Landlord's browser | 10 minutes | How long one personal-message signature keeps working |

The access window is written on chain and cannot be changed afterwards, so the agent refuses to submit
when the blob would expire first (`Blob lifecycle mismatch`) rather than putting an unbacked promise on
chain. This check is **skipped for `mock:` blobs**, so it only appears once `NEXT_PUBLIC_WALRUS_MODE=http`
is in play.

The browser uploader cannot read `WALRUS_EPOCHS` — it is not a `NEXT_PUBLIC_*` variable — so packets are
always stored for the adapter default of 5 epochs. That is what bounds the window to 3 days. Raising
`AGENT_ACCESS_WINDOW_DAYS` above ~4 requires teaching `PacketBuilder` to upload with more epochs first.

## Single-Agent Model

For the demo and current implementation, Casium assumes one stable agent identity:

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

## Contributing

Work is tracked as one file per ticket in `plan/tickets/`, with binding constraints in
`plan/rules/` and background in `plan/epics/`. **Read `plan/START.md` before picking
something up** — it is short, and it tells you exactly which files a given ticket needs so
you are not reading the whole backlog to change one file.

```bash
node scripts/backlog.mjs help          # all commands
pnpm backlog:next                      # what is ready to start
pnpm backlog:show RD-215               # a ticket + the files to load
pnpm backlog:new O "Title" --lane frontend
pnpm backlog                           # validate before you hand off
```

`plan/state.md` is generated — edit tickets, then run `pnpm backlog:gen`.

## Run The Demo

See `docs/demo-script.md` for the full step-by-step walkthrough.

### One command

```bash
cp .env.example .env     # once
pnpm demo:up
```

Builds the workspace and starts all three services — provider API (`:4021`), agent (`:4022`), web
(`:3000`) — waiting for each to report healthy before starting the next. Logs stream into
`.demo-logs/`. Ctrl-C stops everything.

Set `PROVIDER_STORE=postgres` in `.env` and it also starts Postgres and applies migrations first. It
refuses to start if any of the three ports is occupied, rather than half-starting a stack.

### Durable state

```bash
pnpm db:up        # start Postgres (docker compose)
pnpm db:migrate   # apply every drizzle/*.sql exactly once; safe to re-run
pnpm db:reset     # wipe the volume and rebuild from scratch
pnpm db:down      # stop Postgres
```

`PROVIDER_STORE=memory` (the default) keeps listings, applications, **and uploaded packets** in
process memory. Restarting the provider throws them away, and the loss surfaces later as
`No packet registered for mandate …` when the agent runs. Use `postgres` for anything you intend to
demo — but run `pnpm db:migrate` first, or writes fail against missing tables.

### Individual services

```bash
# Provider API
pnpm --filter @casium/provider-api build && pnpm --filter @casium/provider-api start

# Web app
pnpm --filter @casium/web build && pnpm --filter @casium/web start

# Agent server, so /agent can trigger runs from the browser
pnpm --filter @casium/agent build && pnpm --filter @casium/agent start:server

# Agent once from the CLI (executes only if an agent Sui private key is configured)
pnpm --filter @casium/agent check:env
node apps/agent/dist/index.js

# Duplicate-human proof
pnpm demo:duplicate-human
```

### Triggering the agent

The agent is pull-based — it never watches Sui for new mandates. Three ways to start a run, all
over the same `runAgent` pipeline:

| Trigger | How |
|---|---|
| Browser | After uploading a packet on `/renter`, click **Start the agent run on this packet →**. It links to `/agent?mandateId=…` with the mandate pre-filled, so the ID is never retyped. |
| HTTP | `curl -X POST http://localhost:4022/runs -H 'content-type: application/json' -d '{"mandateId":"0x..."}'` then poll `GET /runs/:id`. |
| CLI | `MANDATE_ID=0x... node apps/agent/dist/index.js`. |

Two renter actions must happen **before** a run, in this order:

1. **Create the mandate** on `/renter` — mints the `RentalMandate`, the renter's `OwnerCap`, and the
   `AgentCap` transferred to `AGENT_SUI_ADDRESS`. Without a matching cap the run fails with
   `No AgentCap found for mandate …`.
2. **Build and upload the packet** on `/renter` — the agent only *reads* the packet, it never creates
   one.

**The packet and the run must name the same mandate.** `/renter` registers the packet under the
mandate it is currently showing; `/agent` runs against whatever is in its Mandate ID box. The `/agent`
page checks for a registered packet before starting and refuses immediately with a link back to
`/renter` if there is none — rather than failing four stages into the pipeline as it used to.

Revoking the mandate is the renter's stop control: every later run returns
`status: "ineligible", reason: "Mandate is revoked"` without spending gas. Triggering is off-chain;
authorization and revocation are on-chain.

## Safety

- Use synthetic rental documents only. Never enter real identity, financial, or screening data.
- Never commit `.env`, wallet seeds, private keys, mnemonics, or raw World human IDs.
- Walrus blobs are public — only encrypted ciphertext may be uploaded or referenced.
- Lease signing and fund transfer are out of scope and intentionally impossible in the Move module.
