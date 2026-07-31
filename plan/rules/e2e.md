# E2E rules (`apps/e2e`)

- **Never fake Sui.** The app writes to testnet over gRPC; faking binary protobuf responses
  in `page.route` is not an acceptable approach. Stub at the provider and agent HTTP
  boundaries instead.
- Three tiers, and they must not be mixed: stubbed (no wallet, runs in CI), live
  (real services, no wallet), and wallet (real gas, headed only, never in CI).
- A stub that drifts from the real response shape is worse than no test. The drift guard
  exists for this — keep it passing.
- Assert post-condition app state, not just that an action was dispatched.
- If a ticket changes a `data-testid`, updating the specs is part of that ticket, not a
  follow-up.

## Commands

    pnpm test:e2e          # stubbed
    pnpm test:e2e:live     # live services
    pnpm test:e2e:ui       # headed
