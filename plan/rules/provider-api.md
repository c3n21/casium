# Provider API rules (`apps/provider-api`)

- The provider has **no authentication and no session concept.** Do not imply otherwise in
  UI or docs. Scoping is a server-side filter, not authorization.
- Listing eligibility is checked against provider-created Sui `RentalListing` data, never
  against attributes supplied by the agent.
- Error codes are part of the contract. Document any new one in `docs/provider-api.md`
  with its HTTP status and the condition that produces it.
- Both the memory and Postgres paths must return byte-identical JSON for the same record.
  A field populated only in memory mode is a bug — that class has already bitten twice.
- Migrations are additive and idempotent. A destructive migration needs a dump first, and
  a rollback of the deploy does **not** roll back the schema.
- CORS is currently wide open on this service. Tightening it is welcome, but only after the
  happy path is proven working.

## Commands

    pnpm --filter @casium/provider-api build
    pnpm db:up && pnpm db:migrate
