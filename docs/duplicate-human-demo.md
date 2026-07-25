# Duplicate Human Demo

RD-014 proves the provider rejects a second application to the same listing from the same World human, even when the request comes from a different EVM agent.

## Controlled Fixture

Run:

```bash
pnpm demo:duplicate-human
```

Expected output:

- First request: `202`, application reserved.
- Second request: `409`, `DUPLICATE_HUMAN_LISTING`.
- Missing AgentKit context: `401`, `AGENTKIT_UNVERIFIED`.

This script uses mock AgentKit headers with the same `humanIdHash` and two different demo EVM agent addresses. It proves the provider-side uniqueness boundary deterministically.

## Live AgentKit Boundary

RD-012 has live AgentKit verification for one registered MetaMask address on World Chain. A full RD-014 live proof still needs a second EVM agent address registered to the same World human.

Once a second same-human address exists:

1. Use `scripts/agentkit-live-request.html` with the first registered address and confirm `202`.
2. Use the same helper with the second registered address against the same listing and confirm `409 DUPLICATE_HUMAN_LISTING`.
3. Keep only hashed human IDs in logs/docs; never commit raw World human IDs.
