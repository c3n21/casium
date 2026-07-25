# Provider API

Current local mode exposes a Hono app from `apps/provider-api/src/app.ts`.

## Store Mode

Set `PROVIDER_STORE=postgres` and `DATABASE_URL=postgres://...` to use Postgres via drizzle-orm.
Omit `PROVIDER_STORE` or set it to `memory` to use the default in-memory Maps (required for tests).

```bash
pnpm db:up        # start Postgres (port 5432, credentials rentdelegate/rentdelegate)
pnpm db:migrate   # apply every drizzle/*.sql exactly once
```

**Migrations are not automatic.** `pnpm db:migrate` runs each file in `apps/provider-api/drizzle/`
in filename order inside its own transaction, recording what it applied in `schema_migrations`, so
re-running it is a no-op and a partially migrated database can be brought forward. Starting the API
against an un-migrated database fails on the first write, not at boot.

Everything the API stores is durable in `postgres` mode: listings, applications, human/listing
uniqueness, receipts, access grants, **and registered packets**. In `memory` mode all of it is lost
on restart — most confusingly the packet, whose absence only surfaces when the agent runs.

## Health

`GET /health`

Returns service status and store mode:

```json
{ "ok": true, "service": "provider-api", "store": "memory" }
```

## Correlation IDs

Every response includes an `x-correlation-id` header. Pass `x-correlation-id` in requests to propagate
a correlation ID through logs.

## Listings

`GET /listings`

Returns seeded provider-authored listing records:

- `listing_lisbon_eligible`
- `listing_porto_ineligible`

The Lisbon seed uses a live Sui testnet `RentalListing` object from RD-007. The Porto ineligible seed remains a deterministic placeholder until a second provider-created testnet listing is added.

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

`GET /applications`

Lists applications with optional query filters:

- `?listingId=<id>` — filter by listing
- `?mandateId=<id>` — filter by Sui mandate object ID
- `?status=reserved|accepted|withdrawn` — filter by status

Returns `{ applications: [...] }` ordered by creation time (newest last in DB mode).

`GET /applications/:id`

Returns the reserved application state or `404 { "error": "APPLICATION_NOT_FOUND" }`.

`POST /applications/:id/verify`

Verifies a Sui `ApplicationReceipt` on-chain and marks the application as `accepted`.

Body: `{ applicationId: string, txDigest: string, receiptId: string }`

`POST /applications/:id/withdraw`

Marks an application as withdrawn.

Body: `{ txDigest: string, receiptId: string }`

Returns the updated application with `status: "withdrawn"`.

`POST /applications/:id/access-grants`

Creates a document access grant for a landlord or verifier.

Body: `{ requesterSuiAddress: string, expiresAt: string }` (ISO datetime)

Returns:
```json
{
  "id": "grant_...",
  "applicationId": "...",
  "receiptId": "...",
  "requesterSuiAddress": "0x...",
  "status": "active",
  "expiresAt": "2026-09-01T00:00:00.000Z",
  "createdAt": "2026-07-25T12:00:00.000Z"
}
```

`GET /applications/:id/access-grants`

Returns `{ grants: [...] }` for the specified application.

## Mandate Registration

`POST /mandates`

Registers a created `RentalMandate` for later use by the agent or frontend.

Body:
```json
{
  "mandateId": "0x...",
  "ownerCapId": "0x...",
  "agentCapId": "0x...",
  "agentSuiAddress": "0x...",
  "txDigest": "..."
}
```

Returns `201` with the registration record on success.

`GET /mandates/:id`

Returns a registered mandate by mandateId or `404`.

## Packets

The renter's browser encrypts a document packet, uploads the ciphertext to Walrus, and registers the
resulting blob reference here. The agent reads it before every run — it never creates a packet.

`POST /packets`

```json
{
  "mandateId": "0x...",
  "walrusBlobId": "blob... or mock:...",
  "packetHash": "0x...",
  "sizeBytes": 2048,
  "encryptionMode": "seal | aes-gcm | mock"
}
```

Returns `201` with the record plus `registeredAtMs`, or `422 { "error": "INVALID_PACKET_RECORD" }`.

**No plaintext is ever sent** — only the blob ID, the ciphertext hash, and the size. That is the
privacy claim the renter flow makes on screen, and the request body is what backs it.

**One packet per mandate.** Re-uploading replaces the previous record, which is what a renter expects
after rebuilding a packet.

`GET /packets/:mandateId`

Returns the record or `404 { "error": "PACKET_NOT_FOUND" }`. The `/agent` page calls this as a
preflight before starting a run, so a missing packet is reported at the button rather than four
stages into the pipeline.

Packets are durable under `PROVIDER_STORE=postgres` (`packets` table, migration `0002_packets.sql`).
Under `memory` they live in a process-level `Map` and do not survive a restart.
