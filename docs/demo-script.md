# RentDelegate Demo Script

This script covers the full end-to-end demo in 3–4 minutes. Every step has a fallback
using pre-verified testnet objects and tx digests if the live path fails.

## Before You Start

Open four terminal tabs:

| Tab | Purpose |
|---|---|
| A | Provider API |
| B | Agent / scripts |
| C | Frontend dev server |
| D | Browser + MetaMask |

Confirm Node.js ≥ 22 and pnpm 11 are available:

```bash
node --version   # v22+ or v26+
pnpm --version   # 11.x
```

---

## Step 1 — Install and Build

```bash
pnpm install
pnpm -r --if-present build
pnpm -r --if-present test
```

Expected: all builds succeed, all tests pass.

---

## Step 2 — Start Provider API (Tab A)

```bash
pnpm --filter @rentdelegate/provider-api build
pnpm --filter @rentdelegate/provider-api start
```

Verify health:

```bash
curl http://localhost:4021/health
# {"ok":true,"service":"provider-api","mode":"local"}
```

For live World AgentKit mode (optional — needs registered MetaMask address):

```bash
AGENTKIT_MODE=real \
AGENTKIT_EVM_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public \
pnpm --filter @rentdelegate/provider-api start
```

---

## Step 3 — Start Frontend (Tab C)

```bash
pnpm --filter @rentdelegate/web start
```

Open `http://localhost:3000` (or port Next.js reports). You will see three links:
- **Renter** — create mandate, encrypt packet, track applications
- **Provider** — manage listings, review applications, verify receipts
- **Landlord** — view on-chain receipt

---

## Step 4 — Renter: Connect Wallet and Review Mandate (Tab D)

1. Open `http://localhost:3000/renter`.
2. Connect a Sui testnet wallet (e.g. Sui Wallet, Martian).
3. The pre-loaded smoke mandate `0x8354…` loads from testnet automatically.
4. Observe:
   - Status: Active
   - Remaining applications: 1
   - Max rent: €1800
   - Allowed municipalities: Lisbon, Oeiras, Cascais
5. Click **Encrypt and upload packet** in the PacketBuilder section.
   The form generates a synthetic document, encrypts it with AES-GCM, and shows the Walrus blob ID and packet hash.
   The plaintext never leaves the browser.

**Fallback (no wallet):** All values are pre-seeded on the page from testnet smoke objects.

---

## Step 5 — Duplicate-Human Demo (Tab B)

```bash
pnpm demo:duplicate-human
```

Expected output:

```json
{
  "mode": "mock-agentkit-controlled-fixture",
  "sameHumanHash": "sha256:demo-human-same-world-user",
  "first":     { "status": 202, "body": { "id": "app_1", "status": "reserved" } },
  "duplicateSameHumanDifferentAgent": { "status": 409, "body": { "error": "DUPLICATE_HUMAN_LISTING" } },
  "unverified": { "status": 401, "body": { "error": "AGENTKIT_UNVERIFIED" } }
}
```

This proves:
- First human-backed agent reserves successfully.
- Second agent with same human hash is rejected with `409 DUPLICATE_HUMAN_LISTING`.
- Request without AgentKit context is rejected with `401 AGENTKIT_UNVERIFIED`.

---

## Step 6 — Live AgentKit Verification (Tab B, optional)

Requires a registered MetaMask address on World Chain (see `docs/world-agentkit.md`).

1. Start provider in real mode (Step 2 alternative).
2. Serve the helper page:
   ```bash
   python -m http.server 4173
   ```
3. Open `http://localhost:4173/scripts/agentkit-live-request.html`.
4. MetaMask must be on World Chain (chain ID 480).
5. Click **Connect MetaMask, sign AgentKit header, and send**.
6. Observe `202` response with `humanIdHash` derived from the real World human ID.

**Evidence already recorded:** `docs/world-agentkit.md` — AgentBook address `0x662D…` verified on `eip155:480`, `202` received on 2026-07-25.

---

## Step 7 — Agent Run (Tab B)

First verify that the agent signer address is known and has SUI gas on testnet:

```bash
pnpm --filter @rentdelegate/agent build
pnpm --filter @rentdelegate/agent check:env
```

If the check reports no gas, fund the printed agent address with the Sui testnet faucet before
running the agent.

```bash
node apps/agent/dist/index.js
```

To execute on Sui instead of stopping at the PTB fallback, set one uncommitted env var for the
agent-owned Sui key:

```bash
AGENT_SUI_PRIVATE_KEY=suiprivkey... node apps/agent/dist/index.js
# or
AGENT_SUI_PRIVATE_KEY_BASE64=<32-byte-ed25519-secret-key-base64> node apps/agent/dist/index.js
```

The demo uses a single-agent deployment model. `AGENT_SUI_ADDRESS` is the stable Sui identity of the
agent service. `AGENT_CAP_ID` is not stable globally; it is the capability object for the specific
`MANDATE_ID` being processed. A different mandate for the same agent address will have a different
`AgentCap`.

Expected output:

```
=== RentDelegate Agent ===
[1] Loading mandate from testnet...
    Remaining: 1
    Revoked: false
[2] Evaluating listings...
    Lisbon listing: eligible: true → meets all criteria
    Porto listing: not readable (expected for mock object)
[3] Encrypting and uploading packet...
    Blob ID: mock:...
[4] Reserving application with provider API...
    (requires AGENTKIT_HEADER or provider in mock mode)
[5] Executing Sui submit_application PTB...
    PTB ready. Set AGENT_SUI_PRIVATE_KEY=suiprivkey... or AGENT_SUI_PRIVATE_KEY_BASE64 to execute.
```

With a matching key, Step 5 signs with the agent-owned Sui address, submits `submit_application`,
extracts the `ApplicationReceipt` from events/effects, then Step 6 calls provider receipt verification.
If the provider API is not running or no AgentKit header is set, the agent prints a clear message and exits without claiming success.

### Local runs against a mock-mode provider

For Sui-focused runs without a MetaMask-signed header, start the provider with `AGENTKIT_MODE=mock`
and give the agent the matching opt-in demo headers:

```bash
AGENTKIT_DEMO_HUMAN_ID_HASH=sha256:local-demo \
AGENTKIT_DEMO_AGENT_EVM_ADDRESS=0x662DbABBeff9B237490bBE6A898776a4A1D87CCe \
AGENT_SUI_PRIVATE_KEY=suiprivkey... node apps/agent/dist/index.js
```

Both variables must be set or the agent refuses to reserve, and a real `AGENTKIT_HEADER` always wins.
The agent prints `AgentKit: [MOCK] demo headers` on this path — it proves **no** World identity and must
never be used as evidence of World verification. Use it only to exercise the Sui path.

### Live evidence (2026-07-25)

A full agent-signed run on testnet, with the World layer in mock mode and Walrus on the labeled mock adapter:

| What | Value |
|---|---|
| Mandate | `0x16de4b28830417bea4becaa591671ca69024fea9d99d355c9c8784e468dcc454` |
| AgentCap | `0xcdc9d7aa5345a4b5c4e8b6fc093a3b5c2b4caf469a3b9f99144449ac462bebd9` |
| `submit_application` tx | `BatrGYNdmzXA8wdEJT4XC4LXa55fZ6ezMAFcsbvAd1dm` |
| `ApplicationReceipt` | `0xc6f490b959f23db9936090be9bdd52ede80cb685561cc528593f958978235865` |
| Provider verification | `accepted` (real Sui verifier against testnet) |
| Ineligible listing (Porto, municipality 6) | `0xd0f9b4ae975b27d56af6c23844cbfa76dfda81f2913585788c51289ad1f0b3d1` |
| Forced ineligible submit | tx `6YRsTLLYKCEcWjnXBrfKwxwFc1tiTomLryxmvG7r71sA`, aborted with code 7 `EMUNICIPALITY_NOT_ALLOWED` |

The last row is the "Sui limits what the agent can do" proof: the agent refuses the out-of-scope listing
before building a transaction, and Move rejects it even when a submission is forced by hand.

---

## Step 8 — Provider: Review Application (Tab D)

1. Open `http://localhost:3000/provider`.
2. The pre-seeded `app_1` application appears in the inbox.
3. Observe:
   - Human hash (uniqueness proof, no raw World human ID).
   - Status badge.
4. Click **Verify Sui receipt** and enter:
   - Tx digest: `6vKuZNC3p5uoaSni2N5NifW1eQjqdLDesBAj9gN799Lh`
   - Receipt ID: `0xc46d42744b7381447851f9f2adb6cf32322ab4bd6aba243e925597418899ad20`
5. Application moves to `accepted`.

---

## Step 9 — Landlord: Verify Receipt (Tab D)

1. Open `http://localhost:3000/landlord`.
2. The smoke receipt loads from testnet.
3. Observe mandate ID, listing ID, agent address, submission timestamp, access expiry.
4. Click the object ID and tx links to verify on SuiVision.

**Explorer links:**
- Package: https://suivision.xyz/package/0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d?network=testnet
- Submit tx: https://suivision.xyz/txblock/6vKuZNC3p5uoaSni2N5NifW1eQjqdLDesBAj9gN799Lh?network=testnet

---

## Testnet Object Reference

| Object | ID |
|---|---|
| Package | `0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d` |
| RentalMandate | `0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee` |
| OwnerCap | `0xcdb3924e29345c3be077f3c54de78435144ad141d0458a93f6fb6ae0381a571d` |
| AgentCap | `0xabeb55d1266102eed4235531c542fb01fd85bb3095c3d579960923f2e1e25c2a` |
| RentalListing | `0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a` |
| ApplicationReceipt | `0xc46d42744b7381447851f9f2adb6cf32322ab4bd6aba243e925597418899ad20` |
| Publish tx | `GvxTETJej5RH4U3rFD2PNCENW65tG8vynRF1xskTrxP7` |
| submit_application tx | `6vKuZNC3p5uoaSni2N5NifW1eQjqdLDesBAj9gN799Lh` |

The smoke `AgentCap` above is valid only for the listed smoke `RentalMandate` and stable smoke agent
address. If you create a new mandate, keep the agent address the same and use the newly created
`AgentCap` for that mandate.

---

## Sponsor Proof Checklist

| Claim | Evidence |
|---|---|
| Sui: Move objects enforce mandate scope | `RentalMandate`, `AgentCap`, `RentalListing`, `ApplicationReceipt` on testnet |
| Sui: Agent uses own address + AgentCap (no renter custody) | `submit_application` requires `AgentCap`; `apps/agent` signs only with env-only agent Sui key |
| Sui: 21 unit tests cover all enforcement rules | `~/.local/bin/sui move test --path packages/move` |
| World: Live AgentKit verification | `POST /listings/.../applications` returned `202` with real header from `eip155:480` |
| World: Duplicate-human rejection | `pnpm demo:duplicate-human` — `409 DUPLICATE_HUMAN_LISTING` |
| World: Unverified rejection | Same script — `401 AGENTKIT_UNVERIFIED` |
| Walrus: Mock-labeled adapter | `createMockWalrusAdapter()` — blob IDs prefixed `mock:` |
| Walrus: CLI adapter implemented | `createWalrusCliAdapter()` in `packages/walrus` |
| Plaintext never sent to provider | `PacketBuilder` encrypts AES-GCM before upload |

---

## What Is Out Of Scope

- **Lease signing**: impossible in the Move module by design.
- **Fund transfer**: not represented as a permission flag.
- **Agent private key handling**: live execution requires an uncommitted testnet-only agent key in env; no renter key is used or stored.
- **RD-014 two-live-agent proof**: requires a second EVM address registered to the same World human. Logic is implemented; controlled fixture proves the rule.
- **Seal (RD-201)**: P2 scope — not implemented to avoid risking the core demo.
