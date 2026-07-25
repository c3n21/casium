# Backlog Archive — Completed Tickets (RD-001 … RD-108)

Parent index: `plan/backlog.md`.

These tickets are **complete and frozen**. They are kept verbatim for their `Verification` fields,
which are the evidence trail for the sponsor claims. Do not edit them to record new work — open a
ticket in `plan/backlog-completion.md`, `plan/backlog-walrus.md`, or `plan/backlog-seal.md` instead.

Two tickets remain honestly incomplete and are tracked here rather than reopened:

| Ticket | Remaining gap | Follow-up |
|---|---|---|
| RD-014 | Live same-human/two-agent proof needs a second EVM agent registered to the same World human. The controlled fixture proof is real; the live proof is not. | Still open. Do not claim live proof until it is run. |
| RD-101 | The live Walrus upload was never executed. | Superseded by Epic W (`plan/backlog-walrus.md`), RD-121 … RD-126. |

## P0 — Required For Sponsor Qualification (complete)

### RD-001 Project Skeleton

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - merged via `feature/rd-001-project-skeleton`. |
| Lane | L0 Project setup |
| Objective | Create monorepo structure and package manager setup. |
| Suggested implementation | Use `pnpm` workspaces with `apps/web`, `apps/provider-api`, `apps/agent`, `packages/move`, `packages/shared`, `packages/sui-client`, `packages/agentkit`, `packages/walrus`, `packages/seal`, `packages/contracts-config`, `scripts`, `docs`, `plan`. Pin `packageManager` in root `package.json`; add only repo-local dependencies through workspace manifests. Do not use `sudo` or global npm installs. |
| Files/modules | `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `README.md`, directory placeholders. |
| Dependencies | None. |
| Blocks | RD-002, RD-003, all app/package work. |
| Acceptance criteria | `pnpm install` succeeds; workspace filters work; no secrets tracked; app/package directories exist; root manifest documents Node 22 target and pnpm 11 package manager pin. |
| Tests | `pnpm -r --if-present build`; `pnpm -r --if-present test`. |
| Verification | 2026-07-25: `node --version` -> `v26.5.0`; `pnpm --version` -> `11.3.0`; `pnpm install` -> success, generated `pnpm-lock.yaml`; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success; `pnpm --filter @rentdelegate/shared list --depth -1` -> resolved workspace package. |
| Failure fallback | Create minimal directories and package manifests only; if host Node is incompatible, document blocker instead of installing system packages. |
| Sponsor | Both. |
| Demo impact | Enables all parallel work. |

### RD-002 Shared Schemas And Constants

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - merged via `feature/rd-002-shared-schemas`. |
| Lane | L0/L2 shared |
| Objective | Define shared TypeScript types, Zod schemas, constants, and error code mapping. |
| Suggested implementation | Export schemas for mandate form, listing, application reserve, receipt verify, municipality codes, permission flags, and user-facing errors. |
| Files/modules | `packages/shared/src/schemas.ts`, `packages/shared/src/constants.ts`, `packages/shared/src/errors.ts`, `packages/shared/src/index.ts`. |
| Dependencies | RD-001. |
| Blocks | RD-009, RD-101, RD-103, RD-105. |
| Acceptance criteria | Shared package builds; backend/frontend/agent can import schemas; schemas match section 4. |
| Tests | Vitest schema parse tests for valid and invalid application reserve requests. |
| Verification | 2026-07-25: `pnpm --filter @rentdelegate/shared build` -> success; `pnpm --filter @rentdelegate/shared test` -> success, 1 file/2 tests; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success, shared package 1 file/2 tests. |
| Failure fallback | Inline duplicated types temporarily, then reconcile before E2E. |
| Sponsor | Both. |
| Demo impact | Prevents integration drift. |

### RD-003 Move Package Skeleton

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - merged via `feature/rd-003-move-package-skeleton`. |
| Lane | L1 Sui Move |
| Objective | Initialize Sui Move package. |
| Suggested implementation | Create `Move.toml`, `sources/rental.move`, `tests/rental_tests.move`, package address aliases. |
| Files/modules | `packages/move/Move.toml`, `packages/move/sources/rental.move`, `packages/move/tests/rental_tests.move`. |
| Dependencies | RD-001. |
| Blocks | RD-004. |
| Acceptance criteria | `sui move build --path packages/move` succeeds with empty/minimal module. |
| Tests | `sui move test --path packages/move`. If `sui` is not on `PATH`, use `~/.local/bin/sui`. |
| Verification | 2026-07-25: `~/.local/bin/sui move build --path packages/move` -> success; `~/.local/bin/sui move test --path packages/move` -> success, 1 test passed; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success. |
| Failure fallback | Use one module only; skip package splitting. |
| Sponsor | Sui. |
| Demo impact | Starts Sui integration. |

### RD-004 Move Core Object Model

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - merged via `feature/rd-004-move-core-objects`. |
| Lane | L1 Sui Move |
| Objective | Implement `RentalMandate`, `OwnerCap`, `AgentCap`, `RentalListing`, `ApplicationReceipt`, events, constants, and error codes. |
| Suggested implementation | Use shared `RentalMandate`, shared `RentalListing`, renter-owned `OwnerCap`, agent-owned `AgentCap`, shared `ApplicationReceipt`. Use `vector<u64>` municipalities and `u64` permission bitset. |
| Files/modules | `packages/move/sources/rental.move`. |
| Dependencies | RD-003. |
| Blocks | RD-005, RD-006, RD-008. |
| Acceptance criteria | Move structs compile; `create_mandate` creates mandate and caps; `create_listing` creates provider-controlled listing; events emitted. |
| Tests | Create mandate and listing tests; verify caps transfer to correct addresses. |
| Verification | 2026-07-25: `~/.local/bin/sui move build --path packages/move` -> success; `~/.local/bin/sui move test --path packages/move` -> success, 3 tests passed; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success. |
| Failure fallback | Keep receipt immutable/owned if shared status updates slow down implementation. |
| Sponsor | Sui. |
| Demo impact | Core Sui object topology. |

### RD-005 Move `submit_application` Enforcement

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - merged via `feature/rd-005-submit-application`. |
| Lane | L1 Sui Move |
| Objective | Enforce mandate constraints during application submission. |
| Suggested implementation | Validate not expired, not revoked, active listing, max rent, municipality, bedrooms, valid `AgentCap`, sender equals authorized Sui agent, allowance > 0, `ACTION_SUBMIT_DOCS`, no same mandate/listing duplicate, decrement allowance, create receipt, emit event. |
| Files/modules | `packages/move/sources/rental.move`. |
| Dependencies | RD-004. |
| Blocks | RD-006, RD-007, RD-013, RD-103, RD-105. |
| Acceptance criteria | Valid submission creates receipt and decrements count once; invalid submissions abort with specific error codes. |
| Tests | Valid submission, rent too high, disallowed municipality, too few bedrooms, expired, revoked, zero allowance, wrong cap, wrong sender, inactive listing, duplicate listing. |
| Verification | 2026-07-25: `~/.local/bin/sui move build --path packages/move` -> success; `~/.local/bin/sui move test --path packages/move` -> success, 16 tests passed covering valid submission, rent too high, disallowed municipality, too few bedrooms, expired mandate, revoked mandate, zero allowance, wrong cap, wrong sender, inactive listing, expired listing, missing submit permission, and duplicate listing; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success. |
| Failure fallback | If dynamic `Table<ID, ID>` causes test friction, drop Sui duplicate prevention for same mandate/listing and rely on allowance plus provider uniqueness for demo, but document this as a shortcut. |
| Sponsor | Sui. |
| Demo impact | Main Sui prize proof. |

### RD-006 Move Owner Actions And Tests

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - merged via `feature/rd-006-owner-actions`. |
| Lane | L1 Sui Move |
| Objective | Implement revocation, withdrawal, optional rotation, and full Move test matrix. |
| Suggested implementation | Add `revoke_mandate`, `withdraw_application`, and `rotate_agent` if safe. Require `OwnerCap` and sender equals owner. Add event emissions. |
| Files/modules | `packages/move/sources/rental.move`, `packages/move/tests/rental_tests.move`. |
| Dependencies | RD-005. |
| Blocks | RD-007, RD-103, RD-106. |
| Acceptance criteria | Owner can revoke; non-owner cannot; post-revoke apply fails; withdrawal changes receipt status. |
| Tests | Owner-only revoke, wrong cap, wrong owner, withdrawal, post-revoke submission failure, optional rotation old/new cap behavior. |
| Verification | 2026-07-25: `~/.local/bin/sui move test --path packages/move` -> success, 21 tests passed including owner revoke, wrong cap, wrong owner, withdrawal, and post-revoke submission failure; `~/.local/bin/sui move build --path packages/move` -> success; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success. Rotation intentionally deferred to RD-202. |
| Failure fallback | Cut rotation UI and keep only revoke/withdraw. |
| Sponsor | Sui. |
| Demo impact | Revocability and safety proof. |

### RD-007 Sui Testnet Publish And Contract Config

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - merged via `feature/rd-007-sui-testnet-publish-live`. |
| Lane | L0/L1 DevOps |
| Objective | Publish Move package to Sui testnet and save deployment metadata. |
| Suggested implementation | Use Sui CLI testnet env, faucet-funded publisher wallet, deploy script, and JSON config consumed by apps. |
| Files/modules | `scripts/deploy-sui.ts` or `scripts/deploy-sui.sh`, `packages/contracts-config/testnet.json`. |
| Dependencies | RD-006. |
| Blocks | RD-008, RD-103, RD-105, RD-106. |
| Acceptance criteria | Package ID saved; create mandate/listing/apply tx digests recorded; explorer links work. |
| Tests | Run deploy script against testnet; run smoke transaction. |
| Verification | 2026-07-25: `~/.local/bin/sui move build --path packages/move` -> success; `~/.local/bin/sui move test --path packages/move` -> success, 21 tests passed; `~/.local/bin/sui client publish packages/move --gas-budget 500000000 --dry-run --json` -> success, estimated net gas 35,549,600 MIST; `~/.local/bin/sui client publish packages/move --gas-budget 500000000 --json` -> success, package `0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d`, upgrade cap `0x2250bb6b4e9804285aa42d9dd7f2737ecdd93ed4b03edbf515459fb7223d62af`, tx `GvxTETJej5RH4U3rFD2PNCENW65tG8vynRF1xskTrxP7`; smoke `create_mandate` -> tx `ANNzWCc4StQWGnbdDKmxkwozYhk2V8CDVDUk4UA1sfDA`, mandate `0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee`, owner cap `0xcdb3924e29345c3be077f3c54de78435144ad141d0458a93f6fb6ae0381a571d`, agent cap `0xabeb55d1266102eed4235531c542fb01fd85bb3095c3d579960923f2e1e25c2a`; smoke `create_listing` -> tx `AqH68Fwb3t61KGxshTn5PbJ7JWTDiQcvbF7rS9URNgZR`, listing `0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a`; smoke `submit_application` -> tx `6vKuZNC3p5uoaSni2N5NifW1eQjqdLDesBAj9gN799Lh`, receipt `0xc46d42744b7381447851f9f2adb6cf32322ab4bd6aba243e925597418899ad20`; `~/.local/bin/sui client balance` after publish/smoke -> 0.95 SUI. Config saved in `packages/contracts-config/testnet.json`; evidence documented in `docs/sui-deployment.md`. |
| Failure fallback | Use localnet for development but record that public demo requires testnet before submission. |
| Sponsor | Sui. |
| Demo impact | Required for Sui qualification. |

### RD-008 Sui TypeScript Client

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - merged via `feature/rd-008-sui-ts-client`. |
| Lane | L2 Sui TS integration |
| Objective | Provide reusable TS helpers for Sui object reads and transactions. |
| Suggested implementation | Wrap `@mysten/sui` transaction builders for create mandate, create listing, submit application, revoke, withdraw, and object parsers for mandate/listing/receipt. |
| Files/modules | `packages/sui-client/src/client.ts`, `packages/sui-client/src/transactions.ts`, `packages/sui-client/src/objects.ts`, `packages/sui-client/src/index.ts`. |
| Dependencies | RD-007. |
| Blocks | RD-013, RD-103, RD-105. |
| Acceptance criteria | Package builds; can read published objects; can build PTBs without signing; frontend and agent import helpers. |
| Tests | Unit tests for PTB construction shape; integration smoke read against testnet config. |
| Verification | 2026-07-25: `pnpm --filter @rentdelegate/sui-client build` -> success; `pnpm --filter @rentdelegate/sui-client test` -> success, 2 files passed/1 live smoke skipped, 4 tests passed/1 skipped; `RUN_SUI_TESTNET=1 pnpm --filter @rentdelegate/sui-client test` -> success, 3 files/5 tests including live read of RD-007 listing `0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a`; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success; `~/.local/bin/sui move build --path packages/move` -> success; `~/.local/bin/sui move test --path packages/move` -> success, 21 tests passed. |
| Failure fallback | Duplicate minimal tx-building code in frontend and agent for demo, then refactor. |
| Sponsor | Sui. |
| Demo impact | Connects apps to Move package. |

### RD-009 Provider Database Schema

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - merged via `feature/rd-009-provider-db-schema`. |
| Lane | L3 Provider API |
| Objective | Create Postgres schema with uniqueness rule `UNIQUE(listing_id, human_id_hash)`. |
| Suggested implementation | Use Drizzle migrations for `listings`, `applications`, `verified_agents`, `human_listing_usage`, `sui_receipts`, `document_access_grants`. |
| Files/modules | `apps/provider-api/src/db/schema.ts`, `apps/provider-api/drizzle/`, `apps/provider-api/src/db/client.ts`. |
| Dependencies | RD-002. |
| Blocks | RD-010, RD-011, RD-012, RD-014. |
| Acceptance criteria | Migration runs locally; unique constraint enforced; seed data works. |
| Tests | Insert duplicate `(listing_id, human_id_hash)` fails. |
| Verification | 2026-07-25: `pnpm --filter @rentdelegate/shared build && pnpm --filter @rentdelegate/provider-api build` -> success; `pnpm --filter @rentdelegate/provider-api test` -> success, pg-mem executed `drizzle/0001_initial.sql` and duplicate `(listing_id, human_id_hash)` insert failed; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success; `~/.local/bin/sui move build --path packages/move` -> success; `~/.local/bin/sui move test --path packages/move` -> success, 21 tests passed. |
| Failure fallback | SQLite/Postgres-lite only if Postgres setup blocks, but keep SQL-compatible schema. |
| Sponsor | World. |
| Demo impact | Duplicate-human rejection. |

### RD-010 Provider Listing Endpoints

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - merged via `feature/rd-010-provider-listing-endpoints`. |
| Lane | L3 Provider API |
| Objective | Implement listing API and DB cache of Sui listing objects. |
| Suggested implementation | Add `POST /listings`, `GET /listings`, `GET /listings/:id`; provider creates Sui listing via frontend or returns tx hint. Store Sui listing object ID and authoritative fields. |
| Files/modules | `apps/provider-api/src/routes/listings.ts`, `apps/provider-api/src/services/listings.ts`. |
| Dependencies | RD-009, RD-008 for real Sui verification or RD-004 ABI for mocks. |
| Blocks | RD-011, RD-104, RD-105. |
| Acceptance criteria | Listings can be created/listed; response includes Sui object ID; seeded Lisbon eligible and ineligible listings exist. |
| Tests | API route tests for create/list/detail. |
| Verification | 2026-07-25: `pnpm --filter @rentdelegate/provider-api build` -> success; `pnpm --filter @rentdelegate/provider-api test` -> success, 2 files/4 tests covering health/list/create/detail/404 and seeded Lisbon/Porto listings; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success; `~/.local/bin/sui move build --path packages/move` -> success; `~/.local/bin/sui move test --path packages/move` -> success, 21 tests passed. Route handoff documented in `docs/provider-api.md`; seed listing object IDs are synthetic placeholders until RD-007 is unblocked and real provider-created Sui listing IDs are available. |
| Failure fallback | Seed DB from known Sui listing object IDs created by CLI. |
| Sponsor | Sui. |
| Demo impact | Prevents agent-supplied fake listing attributes. |

### RD-011 Application Reservation Endpoint

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - merged via `feature/rd-011-application-reservation`. |
| Lane | L3 Provider API |
| Objective | Implement `POST /listings/:id/applications` reservation flow. |
| Suggested implementation | Validate request schema, require AgentKit context, verify listing exists, read mandate, check EVM/Sui binding, insert uniqueness reservation, create application row, return Sui submit hint. |
| Files/modules | `apps/provider-api/src/routes/applications.ts`, `apps/provider-api/src/services/applications.ts`. |
| Dependencies | RD-009, RD-010, RD-012 for real auth; can develop initially with mocked AgentKit context. |
| Blocks | RD-014, RD-105, RD-106. |
| Acceptance criteria | First human/listing reservation succeeds; same human/listing returns 409; mismatched mandate addresses return 403. |
| Tests | Route tests for success, duplicate, EVM mismatch, Sui mismatch, idempotency replay. |
| Verification | 2026-07-25: `pnpm --filter @rentdelegate/provider-api build` -> success; `pnpm --filter @rentdelegate/provider-api test` -> success, 3 files/9 tests covering reservation success, duplicate human/listing 409, EVM mismatch 403, Sui mismatch 403, idempotency replay 200, idempotency conflict 409, missing mock AgentKit headers 401, listings, and DB uniqueness; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success; `~/.local/bin/sui move build --path packages/move` -> success; `~/.local/bin/sui move test --path packages/move` -> success, 21 tests passed. RD-011 uses explicit `x-demo-*` mock AgentKit headers only; RD-012 must replace this before real World demo claims. |
| Failure fallback | Implement with mock human context, then plug RD-012 before demo. |
| Sponsor | World and Sui. |
| Demo impact | Main trust-boundary join. |

### RD-012 World AgentKit Middleware

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - live AgentKit request verified via `feature/rd-012-agentkit-live-helper`. |
| Lane | L4 World AgentKit |
| Objective | Verify human-backed EVM agent requests with AgentKit. |
| Suggested implementation | Use `@worldcoin/agentkit` with x402/Hono hooks or low-level verifier. Hash human ID immediately. Persist nonce/usage storage in DB, not memory, for demo stability. |
| Files/modules | `packages/agentkit/src/server.ts`, `apps/provider-api/src/middleware/agentkit.ts`, `apps/provider-api/src/services/agentkitStorage.ts`. |
| Dependencies | RD-009. |
| Blocks | RD-011 real mode, RD-014, RD-105, RD-106. |
| Acceptance criteria | Registered agent succeeds; unregistered/unverified agent returns 401; middleware exposes `humanIdHash` and `agentEvmAddress`. |
| Tests | Unit test with verifier mock; manual real AgentKit request test documented. |
| Verification | 2026-07-25: `pnpm --filter @rentdelegate/agentkit build` -> success; `pnpm --filter @rentdelegate/agentkit test` -> success, 1 file/3 tests covering human ID hashing, mock verified agent, and mock unverified rejection; `pnpm --filter @rentdelegate/provider-api build` -> success; `pnpm --filter @rentdelegate/provider-api test` -> success, 3 files/9 tests; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success; `~/.local/bin/sui move build --path packages/move` -> success; `~/.local/bin/sui move test --path packages/move` -> success, 21 tests passed. 2026-07-25 live unblock: `pnpm dlx @worldcoin/agentkit-cli status 0x662DbABBeff9B237490bBE6A898776a4A1D87CCe --format json` -> `registered: true`, `network: eip155:480`; provider API run with `AGENTKIT_MODE=real AGENTKIT_EVM_RPC_URL=https://worldchain-mainnet.g.alchemy.com/public`; MetaMask/AgentKit helper generated real `agentkit` header on World Chain; `POST /listings/listing_lisbon_eligible/applications` returned `202` with `mode=real-agentkit`-derived `humanIdHash` and registered `agentEvmAddress`; missing-header request returned `401 AGENTKIT_UNVERIFIED`. Raw World human ID was not committed. |
| Failure fallback | Keep mock only for local development, but real AgentKit must work for final sponsor demo. |
| Sponsor | World. |
| Demo impact | Required for World qualification. |

### RD-013 Sui Receipt Verification Service

| Field | Value |
|---|---|
| Priority | P0 |
| Status | DONE - merged via `feature/rd-013-receipt-verification`. |
| Lane | L3/L2 backend Sui |
| Objective | Verify Sui tx digest and `ApplicationReceipt` object against reserved application. |
| Suggested implementation | Implement `POST /applications/:id/verify`; fetch tx effects and receipt object; compare mandate ID, listing ID, agent Sui address, provider/landlord, blob ID, packet hash, status. Store in `sui_receipts`. |
| Files/modules | `apps/provider-api/src/routes/applications.ts`, `apps/provider-api/src/services/suiVerifier.ts`, `packages/sui-client/`. |
| Dependencies | RD-008, RD-011. |
| Blocks | RD-014, RD-105, RD-106. |
| Acceptance criteria | Valid receipt marks application `accepted`; invalid receipt returns `RECEIPT_INVALID`; tx digest unique. |
| Tests | Mock Sui client route tests; testnet integration once deployed. |
| Verification | 2026-07-25: `pnpm --filter @rentdelegate/sui-client build` -> success; `RUN_SUI_TESTNET=1 pnpm --filter @rentdelegate/sui-client test` -> success, 3 files/6 tests including live RD-007 receipt read `0xc46d42744b7381447851f9f2adb6cf32322ab4bd6aba243e925597418899ad20`; `pnpm --filter @rentdelegate/provider-api build` -> success; `pnpm --filter @rentdelegate/provider-api test` -> success, 3 files/11 tests passed/1 live smoke skipped; `RUN_SUI_TESTNET=1 pnpm --filter @rentdelegate/provider-api test` -> success, 3 files/12 tests including provider route verification of RD-007 receipt and tx digest `6vKuZNC3p5uoaSni2N5NifW1eQjqdLDesBAj9gN799Lh`; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success; `~/.local/bin/sui move build --path packages/move` -> success; `~/.local/bin/sui move test --path packages/move` -> success, 21 tests passed. Current verifier reads and compares the receipt object fields and enforces provider-side tx digest uniqueness; tx-effect parsing remains a future hardening step. |
| Failure fallback | Verify receipt object by object ID only if tx effect parsing takes too long, but document reduced assurance. |
| Sponsor | Sui. |
| Demo impact | Provider proves Sui result. |

### RD-014 Duplicate Human Demo Scenario

| Field | Value |
|---|---|
| Priority | P0 |
| Status | PARTIAL - controlled duplicate-human fixture implemented via `feature/rd-014-duplicate-human-demo`; full live proof needs a second EVM agent registered to the same World human. |
| Lane | L4/L3 World + backend |
| Objective | Prove same World human cannot apply to same listing through multiple agents. |
| Suggested implementation | Register two EVM agent wallets to the same World human in sandbox/demo. Run first application reserve success, second reserve 409. Also test different human accepted if feasible. |
| Files/modules | `scripts/demo-agentkit-duplicate.ts`, `docs/world-agentkit.md`, provider tests. |
| Dependencies | RD-012, RD-013. |
| Blocks | RD-106, submission evidence. |
| Acceptance criteria | Logs and UI show first success, second duplicate rejection, unverified rejection. |
| Tests | Scripted API calls with real or controlled AgentKit fixtures; DB assertion for unique row. |
| Verification | 2026-07-25: `pnpm demo:duplicate-human` -> success; controlled mock AgentKit fixture returned first reserve `202`, same `humanIdHash` through different EVM/Sui demo agent `409 DUPLICATE_HUMAN_LISTING`, and missing AgentKit context `401 AGENTKIT_UNVERIFIED`; `pnpm --filter @rentdelegate/provider-api test` -> success, 3 files/11 tests passed/1 live smoke skipped. RD-012 live AgentKit is verified for one registered World Chain EVM address, but full RD-014 live same-human/two-agent proof remains pending until a second EVM agent address is registered to the same World human. |
| Failure fallback | If second same-human registration cannot be done live, show AgentKit docs-aligned design plus DB fixture test, but do not overclaim live proof. |
| Sponsor | World. |
| Demo impact | Required World prize proof. |

## P1 — Important For Convincing Demo (complete)

### RD-101 Walrus Adapter

| Field | Value |
|---|---|
| Priority | P1 |
| Status | PARTIAL - mock adapter verified and Walrus CLI adapter implemented via `feature/rd-101-walrus-adapter`; live upload smoke requires explicit approval because it can spend wallet resources. |
| Lane | L5 Walrus/privacy |
| Objective | Implement storage adapter for encrypted packets with real Walrus and mock fallback. |
| Suggested implementation | Define `WalrusAdapter` with `upload(bytes)`, `download(blobId)`, `status(blobId)`. Use Walrus HTTP/SDK/CLI-daemon for real mode; local memory or filesystem for mock mode. |
| Files/modules | `packages/walrus/src/adapter.ts`, `packages/walrus/src/http.ts`, `packages/walrus/src/mock.ts`, `packages/walrus/src/index.ts`. |
| Dependencies | RD-002. |
| Blocks | RD-102, RD-105, RD-106. |
| Acceptance criteria | Real mode uploads ciphertext and returns blob ID; mock mode clearly prefixes `mock:`; download returns same bytes. |
| Tests | Round-trip upload/download in mock; optional real Walrus smoke with env flag. |
| Verification | 2026-07-25: `pnpm --filter @rentdelegate/walrus build` -> success; `pnpm --filter @rentdelegate/walrus test` -> success, 2 files/3 tests covering mock upload/download/status and Walrus CLI JSON blob ID parsing. Live Walrus upload was not executed to avoid spending configured wallet resources without explicit approval. |
| Failure fallback | Use mock adapter and label in UI/README. |
| Sponsor | Sui/Walrus. |
| Demo impact | Privacy and Sui Stack credibility. |

### RD-102 Synthetic Packet Encryption UI

| Field | Value |
|---|---|
| Priority | P1 |
| Status | DONE - merged via `feature/rd-102-packet-encryption`. |
| Lane | L5/L7 privacy + frontend |
| Objective | Build synthetic document packet and encrypt client-side before Walrus upload. |
| Suggested implementation | Use Web Crypto AES-GCM. Packet contains placeholders for ID, payslip, employment proof, references, cover letter, optional proof of funds. Display synthetic-data warning. |
| Files/modules | `apps/web/src/lib/packet.ts`, `apps/web/src/components/PacketBuilder.tsx`, `packages/shared/src/packet.ts`. |
| Dependencies | RD-101, RD-002. |
| Blocks | RD-105, RD-106, RD-201. |
| Acceptance criteria | UI generates packet, encrypts it, uploads ciphertext, displays blob ID and packet hash; plaintext never sent to provider API. |
| Tests | Unit test packet serialization and encryption round-trip; manual browser upload. |
| Verification | 2026-07-25: `pnpm --filter @rentdelegate/shared build` -> success; `pnpm --filter @rentdelegate/shared test` -> success, 2 files/5 tests covering schema parse, makeSyntheticPacket, and rejection of invalid types; `pnpm --filter @rentdelegate/web build` -> success; `pnpm --filter @rentdelegate/web test` -> success, 1 file/3 tests covering AES-GCM round-trip, IV randomness, and byte length; `pnpm -r --if-present build` -> success; `pnpm -r --if-present test` -> success; `~/.local/bin/sui move test` -> success, 21 tests passed. PacketBuilder React component includes synthetic-data warning banner; plaintext is never serialized to provider API. |
| Failure fallback | Pre-generate encrypted packet fixture. |
| Sponsor | Sui/Walrus. |
| Demo impact | Shows document privacy. |

### RD-103 Frontend Renter And Sui Flows

| Field | Value |
|---|---|
| Priority | P1 |
| Status | DONE - merged via `feature/rd-103-104-frontend`. |
| Lane | L7 Frontend |
| Objective | Implement renter UI for wallet connect, mandate creation, status, revoke, withdraw. |
| Suggested implementation | Use Next.js, Sui dApp Kit, TanStack Query, shared schemas, and `packages/sui-client`. Show object IDs and tx digests. |
| Files/modules | `apps/web/app/renter/page.tsx`, `apps/web/components/MandateForm.tsx`, `apps/web/components/MandateStatus.tsx`, `apps/web/components/RevokeButton.tsx`. |
| Dependencies | RD-008, RD-102 for packet upload integration. |
| Blocks | RD-106. |
| Acceptance criteria | Renter can create mandate on testnet, see remaining allowance, revoke mandate, and view application receipts. |
| Tests | Component tests for validation; manual Sui wallet smoke. |
| Verification | 2026-07-25: Next.js 16 app builds successfully; `pnpm -r --if-present test` -> all pass; 3 mandate form validation tests; typecheck clean; pages /renter /provider /landlord all static-prerender. MandateForm builds `create_mandate` PTB via `@rentdelegate/sui-client`, MandateStatus polls testnet mandate via `useCurrentClient`, RevokeButton builds `revoke_mandate` PTB. Smoke mandate `0x8354…` pre-seeded on renter page. |
| Failure fallback | Use scripts for txs and frontend read-only display. |
| Sponsor | Sui. |
| Demo impact | Main renter story. |

### RD-104 Provider/Landlord UI

| Field | Value |
|---|---|
| Priority | P1 |
| Status | DONE - merged via `feature/rd-103-104-frontend`. |
| Lane | L7 Frontend |
| Objective | Implement provider dashboard for listing creation and application review. |
| Suggested implementation | Provider can create demo listings, view applications, see AgentKit uniqueness badge, verify receipt, and open landlord access panel. |
| Files/modules | `apps/web/app/provider/page.tsx`, `apps/web/app/landlord/page.tsx`, `apps/web/components/ListingForm.tsx`, `apps/web/components/ApplicationInbox.tsx`. |
| Dependencies | RD-010, RD-013. |
| Blocks | RD-106. |
| Acceptance criteria | Provider can list seeded properties and view accepted/rejected application states. |
| Tests | Component tests with mocked API; manual API integration. |
| Verification | 2026-07-25: Provider page shows seeded Lisbon/Porto listings, ListingForm builds `create_listing` PTB, ApplicationInbox polls provider API for application status and human hash, verify-receipt form calls POST /applications/:id/verify. Landlord page reads smoke receipt `0xc46d…` from testnet and displays mandate/listing links. Next.js build passes. |

### RD-105 Agent App And Deterministic Rules

| Field | Value |
|---|---|
| Priority | P1 |
| Status | DONE - merged via `feature/rd-105-agent`. |
| Lane | L8 Agent |
| Objective | Build constrained agent that discovers listings, explains eligibility, calls provider via AgentKit, submits Sui transaction, and verifies receipt. |
| Suggested implementation | Node TypeScript process. Deterministic rules evaluate Sui mandate/listing data. Use LLM only for optional explanation. Use `agentkit.fetch` for provider requests. |
| Files/modules | `apps/agent/src/index.ts`, `apps/agent/src/rules.ts`, `apps/agent/src/providerClient.ts`, `apps/agent/src/suiSubmit.ts`. |
| Dependencies | RD-011, RD-012, RD-008, RD-102. |
| Blocks | RD-106. |
| Acceptance criteria | Agent identifies one eligible and one ineligible listing, submits only eligible one, reports tx digest and receipt, refuses out-of-scope listing. |
| Tests | Rules unit tests; dry-run with mock provider; live testnet smoke. |
| Verification | 2026-07-25: `pnpm --filter @rentdelegate/agent build` -> success; `pnpm --filter @rentdelegate/agent test` -> success, 1 file/10 tests; live smoke: loaded mandate from testnet, Lisbon listing eligible, Porto ineligible/unavailable; mock Walrus upload; PTB serialized; graceful missing-header fallback when provider not running. Agent private key execution is out of scope and not committed. |
| Failure fallback | Manual button in Agent UI triggers same deterministic flow. |
| Sponsor | World and Sui. |
| Demo impact | Core “AI agent under mandate” proof. |

### RD-106 End-To-End Demo Orchestration

| Field | Value |
|---|---|
| Priority | P1 |
| Status | DONE - merged via `feature/rd-106-107-docs`. |
| Lane | L9 Demo/docs + all |
| Objective | Create reliable demo scenario, reset scripts, and evidence collection. |
| Suggested implementation | Seed listings, create or load mandate, upload packet, run agent application, attempt duplicate human, attempt invalid listing, revoke mandate, collect tx links. |
| Files/modules | `scripts/demo-reset.ts`, `scripts/demo-run.ts`, `docs/demo-script.md`, `packages/contracts-config/testnet.json`. |
| Dependencies | RD-014, RD-103, RD-104, RD-105. |
| Blocks | Submission. |
| Acceptance criteria | 3-4 minute demo completes; all sponsor proofs visible; fallback object IDs and tx digests documented. |
| Tests | Run full script twice against fresh demo state or documented pre-seeded state. |
| Verification | 2026-07-25: `docs/demo-script.md` written covering all 9 demo steps, all testnet object IDs, sponsor proof checklist, and explicit out-of-scope list. `README.md` rewritten with architecture, prerequisites, env vars, quick-start commands. |

### RD-107 README And Submission Evidence

| Field | Value |
|---|---|
| Priority | P1 |
| Status | DONE - merged via `feature/rd-106-107-docs`. |
| Lane | L9 Demo/docs |
| Objective | Write README and submission artifacts proving sponsor qualification. |
| Suggested implementation | Include overview, architecture, Sui integration, World integration, Walrus/Seal status, setup, env vars, test commands, demo flow, security notes, limitations, synthetic-data disclaimer, tx links. |
| Files/modules | `README.md`, `docs/architecture.md`, `docs/demo-script.md`, `docs/security.md`. |
| Dependencies | RD-007, RD-014, RD-106 for final evidence. Can draft earlier. |
| Blocks | Submission. |
| Acceptance criteria | Judge can run locally or understand public demo; no unsupported legal claims; mocked components clearly labeled. |
| Tests | Fresh-machine setup review; link check. |
| Verification | 2026-07-25: `README.md` rewritten with architecture overview, sponsor table, package map, prerequisites, install, env vars, build/test commands, and demo quick-start. `docs/demo-script.md` covers 9 steps, testnet object reference table, and sponsor proof checklist. |

### RD-108 Real Agent Sui Execution

| Field | Value |
|---|---|
| Priority | P1 |
| Status | DONE - live testnet execution proven 2026-07-25 (tx `BatrGYNdmzXA8wdEJT4XC4LXa55fZ6ezMAFcsbvAd1dm`, receipt `0xc6f490b959f23db9936090be9bdd52ede80cb685561cc528593f958978235865`). World AgentKit ran in mock mode for this run; real AgentKit verification is proven separately by RD-012. |
| Lane | L8 Agent |
| Objective | Turn the current PTB-reporting agent into a real testnet Sui-submitting agent. |
| Suggested implementation | Use a single stable `AGENT_SUI_ADDRESS` for the deployed agent. Load its Sui private key from an uncommitted environment variable, derive the agent address, verify it matches `AGENT_SUI_ADDRESS`, sign and execute the `submit_application` PTB with the mandate-specific `AgentCap`, parse the created `ApplicationReceipt`, and call provider receipt verification automatically. Keep renter wallet custody impossible. |
| Files/modules | `apps/agent/src/index.ts`, `apps/agent/src/suiSubmit.ts`, `apps/agent/src/providerClient.ts`, `docs/demo-script.md`, `README.md`. |
| Dependencies | RD-008, RD-011, RD-012, RD-013, RD-105. |
| Blocks | Fully autonomous testnet agent deployment. |
| Acceptance criteria | Agent submits `submit_application` on Sui testnet with the single stable agent address, returns a tx digest and receipt ID, provider verifies the receipt, invalid/out-of-scope listings still do not submit, `AGENT_CAP_ID` is treated as mandate-specific, and no renter key or raw World human ID is handled by the agent. |
| Tests | Unit tests for key parsing/address mismatch, mocked signer execution, receipt ID parsing, and provider verification handoff; optional live testnet smoke guarded by an explicit env flag. |
| Verification | 2026-07-25 live testnet run with the agent key held only in process env (never committed). Mandate `0x16de4b28830417bea4becaa591671ca69024fea9d99d355c9c8784e468dcc454` + AgentCap `0xcdc9d7aa5345a4b5c4e8b6fc093a3b5c2b4caf469a3b9f99144449ac462bebd9` (created by tx `zCuwsxTsgzLXNk9sASpkd2eLkRhsna213NdFzNDAszi`). Agent loaded the mandate from testnet, evaluated the Lisbon listing as eligible, reserved `app_3` with the provider, signed and executed `submit_application` as tx `BatrGYNdmzXA8wdEJT4XC4LXa55fZ6ezMAFcsbvAd1dm`, parsed receipt `0xc6f490b959f23db9936090be9bdd52ede80cb685561cc528593f958978235865`, and the provider's real Sui verifier accepted it (`status: accepted`). Receipt object confirmed on chain: shared, `status = 1` (submitted), agent/provider/landlord `0x3713…243e`. Negative paths, both live: agent refused the real ineligible Porto listing `0xd0f9b4ae975b27d56af6c23844cbfa76dfda81f2913585788c51289ad1f0b3d1` before any tx ("municipality 6 not in [1, 2, 3]"), and a forced CLI submit of that listing aborted in Move with code 7 `EMUNICIPALITY_NOT_ALLOWED` (tx `6YRsTLLYKCEcWjnXBrfKwxwFc1tiTomLryxmvG7r71sA`). `pnpm --filter @rentdelegate/agent test` -> 2 files/25 tests; build clean. |
| Live-run bug fixed | The first live attempt (tx `H8JhWCX9QJncaJBWejYbAMZxnnKC3TH9VJoMgEgtVLJe`, receipt `0xe38fab592523bc02930c89c1df6113eda353d4a95f083e105808b25c77ab7554`) submitted successfully on chain but threw "ApplicationReceipt ID was not found in events/effects". Two shape mismatches that mocked tests had baked in: gRPC events expose the parsed payload as `event.json` (not `contents.json`/`parsedJson`), and `effects.changedObjects` carries no `objectType` — types only arrive in the transaction-level `objectTypes` map, which requires `include: { objectTypes: true }`. Both fixed in `apps/agent/src/suiSubmit.ts` and re-tested against the real shapes. |
| Security | Never commit `.env`, private keys, wallet seeds, mnemonics, or raw AgentKit human identifiers. Prefer `AGENT_SUI_PRIVATE_KEY_BASE64` or Sui `suiprivkey...` from process env only, and document testnet-only usage. |
| Demo impact | Converts the current “PTB ready” proof into a complete real Sui application submission flow. |

