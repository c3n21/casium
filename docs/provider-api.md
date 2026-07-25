# Provider API

Current local mode exposes a Hono app from `apps/provider-api/src/app.ts`.

## Health

`GET /health`

Returns service status and non-secret mode metadata.

## Listings

`GET /listings`

Returns seeded provider-authored listing records:

- `listing_lisbon_eligible`
- `listing_porto_ineligible`

The current seed object IDs are synthetic local placeholders while RD-007 testnet publish is blocked on Sui faucet gas. Replace them with real provider-created `RentalListing` object IDs before claiming the live Sui demo.

`GET /listings/:id`

Returns one listing or `404 { "error": "LISTING_NOT_FOUND" }`.

`POST /listings`

Creates an in-process local listing record for route tests and early frontend/agent integration. Request fields match `@rentdelegate/shared` `ListingSchema` without `id` and `createdAt`; `id` is optional and defaults to `listing_${externalListingId}`.

This endpoint is demo scaffolding only and is not production provider authentication.

## Application Reservations

`POST /listings/:id/applications`

Local development mode uses `AGENTKIT_MODE=mock` by default and requires explicit mock AgentKit headers:

- `x-demo-human-id-hash`
- `x-demo-agent-evm-address`
- `x-demo-mandate-agent-sui-address`

These headers are a local scaffold only. Set `AGENTKIT_MODE=real` to use the low-level `@worldcoin/agentkit` verifier path. A registered AgentBook EVM address and a real `agentkit` header are required before any World integration is claimed.

The endpoint validates `ReserveApplicationSchema`, rejects request `listingObjectId` values that do not match the provider listing record, enforces duplicate-human rejection per listing, and returns a Sui `submit_application` hint.

`GET /applications/:id`

Returns the reserved application state or `404 { "error": "APPLICATION_NOT_FOUND" }`.
