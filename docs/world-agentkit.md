# World AgentKit

RD-012 adds the server-side AgentKit verification boundary.

## Modes

`AGENTKIT_MODE=mock` is the default local mode. It accepts explicit test headers and is only for deterministic route tests:

- `x-demo-human-id-hash`
- `x-demo-agent-evm-address`
- `x-demo-mandate-agent-sui-address`

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
