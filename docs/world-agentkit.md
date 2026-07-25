# World AgentKit

RD-012 adds the server-side AgentKit verification boundary.

## Modes

`AGENTKIT_MODE=mock` is the default local mode. It accepts explicit test headers and is only for deterministic route tests and local Sui-focused agent runs:

- `x-demo-human-id-hash`
- `x-demo-agent-evm-address`
- `x-demo-mandate-agent-sui-address`

`apps/agent` can send these headers, but only when `AGENTKIT_DEMO_HUMAN_ID_HASH` and
`AGENTKIT_DEMO_AGENT_EVM_ADDRESS` are both set. Without them, and without a real `AGENTKIT_HEADER`,
the agent refuses to reserve rather than falling back silently. A real header always wins over the
demo pair, and the agent prints an explicit `[MOCK]` line on the demo path. Runs on this path prove
the Sui and provider layers only — never cite them as World verification.

`AGENTKIT_MODE=real` uses low-level helpers from `@worldcoin/agentkit`:

- `parseAgentkitHeader`
- `validateAgentkitMessage`
- `verifyAgentkitSignature`
- `createAgentBookVerifier().lookupHuman(...)`

Raw AgentKit human IDs are hashed immediately with SHA-256 before entering provider application services.

## Agent-Side Credentials

The agent has three ways to authenticate. Precedence is top to bottom, and it never
silently degrades — a missing credential is an error, not a fallback to mock.

| Mode | Config | Works against | Notes |
|---|---|---|---|
| **Live signing** | `AGENT_EVM_PRIVATE_KEY` | `AGENTKIT_MODE=real` | Mints a header per request URL. The only mode that survives changing listing or host. |
| Static header | `AGENTKIT_HEADER` | `AGENTKIT_MODE=real` | One URL, until it expires. Fine for a manual curl. |
| Mock pair | `AGENTKIT_DEMO_*` | `AGENTKIT_MODE=mock` **only** | Proves the Sui path. Never cite as World verification. |

**Mixing modes is the most common failure.** An agent holding only the demo pair against
a provider in `real` mode gets `401 AGENTKIT_UNVERIFIED`, because the real verifier reads
the `agentkit` header and ignores `x-demo-*` entirely. The agent prints its mode at
startup and `GET /health` reports `agentkitMode` — check both sides match.

### Why the header must be minted per request

The provider calls `validateAgentkitMessage(payload, c.req.url)`, so the signature is
bound to the **exact** request URL, and the payload carries a nonce and issue time. One
header covers one endpoint on one host.

`apps/agent/src/agentkitSigner.ts` therefore calls `client.createHeader(extension)` per
request, mirroring `scripts/agentkit-live-request.html`. It deliberately does **not** use
the AgentKit client's auto-negotiating `fetch`: that waits for the server to advertise an
AgentKit challenge via the resource-server extension, and this provider verifies with the
low-level helpers instead, so it never advertises one and no header is ever attached.

Behind a reverse proxy, `c.req.url` is built from the forwarded Host and the path *after*
any rewrite — not the URL in the browser's address bar. Prefer a subdomain over path
rewriting, and use `AGENTKIT_DEBUG=1` to read the URI the provider actually validated.

### Registering the agent's address

```bash
pnpm dlx @worldcoin/agentkit-cli register 0xYOUR_AGENT_EVM_ADDRESS
```

Use a dedicated key for the agent rather than exporting a personal MetaMask key. An
unregistered address fails at the AgentBook lookup with `agentbook lookup failed:
0x…` in the provider log — signature verification having already succeeded.

The address the agent signs with is also sent in the reservation body, because the
provider rejects a mismatch between the two with `MANDATE_EVM_MISMATCH`.

## Agent Identity Binding (RD-161–164)

Each rental mandate records a **pair** of agent addresses — one per chain — because the agent has one identity per chain:

| Value | On-chain field | Enforced by |
|---|---|---|
| `agentSuiAddress` | `RentalMandate.agent_sui` | Move (`submit_application` requires `sender == mandate.agent_sui`); `AgentCap` transferred only to this address at mandate creation |
| `agentEvmAddress` | `RentalMandate.agent_evm` | Provider's `reserve()` endpoint: reads the on-chain value and compares against the **AgentKit-verified signer** (RD-164) |

**On-chain EVM enforcement is deliberately out of scope.** The Move module would need secp256k1 recovery and AgentKit message format parsing; the agent submits from its Sui key, so there is no EVM signature in that transaction to check. The enforcement point is the provider — it is the only place that simultaneously holds an AgentKit-verified EVM signer, a Sui client, and the mandate ID.

### Where each identity value comes from

| Value | Source | How the form sees it |
|---|---|---|
| `agentSuiAddress` | `AGENT_SUI_ADDRESS` env or derived from `AGENT_SUI_PRIVATE_KEY` | `GET /identity` on mount — never typed |
| `agentEvmAddress` | Live: derived from `AGENT_EVM_PRIVATE_KEY`; mock: `AGENTKIT_DEMO_AGENT_EVM_ADDRESS` | Same `GET /identity` call |

The renter's mandate form (since RD-163) fetches `GET /identity` and renders both addresses as a read-only card. The addresses are visible before signing — a renter who cannot see who they are authorizing is worse off than one who types it. The form is **not** a security claim: the agent's `/identity` endpoint asserts its own addresses, and verification happens at the provider.

### Error codes for identity mismatches

| Code | HTTP | Meaning |
|---|---|---|
| `MANDATE_EVM_MISMATCH` | 403 | The AgentKit-verified EVM signer does not match the mandate's on-chain `agent_evm`. Also raised when `agent_evm` is empty (legacy mandate). |
| `MANDATE_SUI_MISMATCH` | 403 | The request body's `agentSuiAddress` does not match the mandate's on-chain `agent_sui`. |
| `SUI_MANDATE_REJECTED` | 422 | The mandate object was not found on chain, or the mandate has been revoked. |



Real verification requires a registered AgentBook EVM agent wallet and an `agentkit` request header created by `createAgentkitClient`/`agentkit.fetch`.

Registration is external to this repo and requires the World App verification flow:

```bash
pnpm dlx @worldcoin/agentkit-cli register 0xYOUR_AGENT_EVM_ADDRESS
```

Until a registered agent request is available, do not claim live World AgentKit verification. Local route tests only prove the provider trust boundary and duplicate-human logic with mock AgentKit context.

## MetaMask Live Request Helper

After registering and verifying a MetaMask EVM address, use `scripts/agentkit-live-request.html` to create a real `agentkit` header without exposing private keys.

1. Start provider API in real mode:

```bash
pnpm --filter @rentdelegate/provider-api build
AGENTKIT_MODE=real AGENTKIT_EVM_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public pnpm --filter @rentdelegate/provider-api start
```

2. Serve this repo locally so the browser can open the helper:

```bash
python -m http.server 4173
```

3. Open `http://localhost:4173/scripts/agentkit-live-request.html`.

4. Switch MetaMask to World Chain (`eip155:480`), replace `agentEvmAddress` with the registered MetaMask address if needed, connect MetaMask, sign, and send.

Expected results:

- Registered/verified agent: `202` with a reserved application payload.
- Unregistered or invalid agent: `401` with `AGENTKIT_UNVERIFIED`.

Do not paste seed phrases, private keys, or raw World human IDs into this repo or the helper.

## Live Verification Evidence

2026-07-25:

- AgentBook status for `0x662DbABBeff9B237490bBE6A898776a4A1D87CCe`: registered on `eip155:480`.
- Provider API ran with `AGENTKIT_MODE=real` and `AGENTKIT_EVM_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public`.
- MetaMask on World Chain signed an AgentKit header via `scripts/agentkit-live-request.html`.
- `POST /listings/listing_lisbon_eligible/applications` returned `202` with `agentEvmAddress=0x662DbABBeff9B237490bBE6A898776a4A1D87CCe` and a hashed human ID only.
- Missing-header request returned `401 AGENTKIT_UNVERIFIED`.
