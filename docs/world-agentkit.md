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

## Manual Real Verification

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
