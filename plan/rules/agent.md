# Agent rules (`apps/agent`)

- The agent **must not** use renter wallet custody. It signs with its own Sui address plus
  the `AgentCap` it was granted.
- Mandate scope is enforced on chain. The agent's local rule checks are a fast path, not the
  guarantee — never treat a passing local check as authorization to skip the on-chain call.
- The agent's identity endpoint (`GET /identity`) asserts its own addresses and is **not**
  verified. Real enforcement happens at the provider's reserve endpoint.
- `POST /runs` has no authentication and spends gas. Do not expose it publicly without a
  shared-secret header.
- Check the mandate's access window against the Walrus blob lifetime before starting a run;
  aborting before gas is spent is the correct behavior.

## Commands

    pnpm --filter @casium/agent build
    pnpm --filter @casium/agent check:env
