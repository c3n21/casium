# Epic C — Close The Loop (RD-109 … RD-118)

Parent index: `plan/backlog.md`. Contract: `spec/development-spec.md`.

## Why This Epic Exists

Every stage of RentDelegate works in isolation and is live-proven on testnet, but the stages are
joined to each other by hand-edited environment variables and hardcoded demo fixtures, not by code.
As of 2026-07-25 the whole workspace builds and all 57 tests pass, so this epic is not about fixing
breakage — it is about replacing the four human-in-the-middle seams with real wiring.

| Seam | Evidence |
|---|---|
| Provider state is in-memory; the Postgres layer is dead code | `apps/provider-api/src/services/listings.ts:41` and `services/applications.ts` use `Map`; `src/db/client.ts` `createDb` is imported by nothing outside itself; `drizzle/0001_initial.sql` is only exercised by `pg-mem` in `src/db/schema.test.ts`. |
| Renter's encrypted packet never reaches the agent | `apps/web/src/components/PacketBuilder.tsx:9` uploads to a `Map` built inside the component; the blob ID and AES key stay in React state. The agent independently calls `makeSyntheticPacket()` + `createMockWalrusAdapter()` (`apps/agent/src/index.ts:68`). |
| A mandate created in the UI is invisible to the agent | Agent reads `MANDATE_ID` / `AGENT_CAP_ID` from env constants (`apps/agent/src/index.ts:28`). `AgentCap` is per-mandate by design, so each new renter needs a manual `.env` edit and a re-run. |
| Dashboards read fixtures, not the system | `apps/web/app/provider/page.tsx:7` (`DEMO_APPLICATION_IDS = ["app_1"]`), `app/landlord/page.tsx:8` (`SMOKE_RECEIPT_ID`), `app/renter/page.tsx:20` (`smokeMandate`). There is no `GET /applications` endpoint, so the inbox could not discover applications even if asked to. |

None of this required new architecture. It is mechanical wiring against interfaces that already exist.

---

### RD-109 Postgres Persistence For Provider API

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L3 Provider API |
| Objective | Make provider state durable so the World duplicate-human guarantee survives a process restart. |
| Suggested implementation | Wire `createDb()` into `createApp()`. Convert `createListingService` and `createApplicationService` from `Map` to drizzle queries against the existing tables. Enforce duplicate-human by relying on the `human_listing_usage` primary key and the `applications_agent_idempotency_unique` constraint rather than in-process checks — catch the unique-violation error and map it to `DUPLICATE_HUMAN_LISTING` / `IDEMPOTENCY_CONFLICT`. Add a migration runner (`pnpm --filter @rentdelegate/provider-api db:migrate`) and a `docker-compose.yml` (or documented local `postgres` service) for the dev database. Keep an explicit `PROVIDER_STORE=memory` fallback for tests so the existing suite does not require a live database. |
| Files/modules | `apps/provider-api/src/app.ts`, `src/db/client.ts`, `src/services/listings.ts`, `src/services/applications.ts`, `drizzle/`, `apps/provider-api/package.json`, root `docker-compose.yml`. |
| Dependencies | None. This is the root of the epic. |
| Blocks | RD-110, RD-111, RD-112, RD-118, RD-126, RD-136. |
| Acceptance criteria | Restarting the API preserves listings, applications, receipts, and the human/listing uniqueness row. A second reservation for the same `humanIdHash` + listing returns `409 DUPLICATE_HUMAN_LISTING` after a restart, not `202`. `GET /health` reports the active store (`postgres` or `memory`) without leaking the connection string. |
| Tests | Existing suite continues to pass on the memory store. New integration tests run against a real Postgres (testcontainers or a documented local instance) covering: insert/read round-trip, duplicate-human unique violation, idempotency-key conflict, and restart persistence. |
| Verification | Record the exact commands and the restart proof (reserve → restart → duplicate rejected). |
| Failure fallback | If Postgres cannot be provisioned in the demo environment, ship SQLite/`pglite` behind the same drizzle schema — but the store must still be durable across restarts. Do not fall back to `Map` and call it done. |
| Sponsor | World (the uniqueness guarantee is the World proof). |
| Demo impact | Without this, the anti-Sybil claim lives in a hash map that dies with the process. |
| Parallel safety | Owns `apps/provider-api/src/services/*`. RD-110 must not start until this lands. |

---

### RD-110 Application Listing, Withdraw, And Access-Grant Endpoints

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L3 Provider API |
| Objective | Expose the endpoints the UI and the spec already assume but that do not exist. |
| Suggested implementation | Add `GET /applications` with `listingId`, `mandateId`, and `status` filters and stable ordering. Add `POST /applications/:id/withdraw` (spec §7.2 lists it; it is unimplemented) which verifies the Sui `withdraw_application` transaction before marking the row withdrawn. Add `POST /applications/:id/access-grants` and `GET /applications/:id/access-grants` backed by the already-defined `document_access_grants` table. Keep all responses aligned with `packages/shared` Zod schemas. |
| Files/modules | `apps/provider-api/src/routes/applications.ts`, `src/services/applications.ts`, `packages/shared/src/schemas.ts`, `docs/provider-api.md`. |
| Dependencies | RD-109. |
| Blocks | RD-113, RD-114, RD-117, RD-126, RD-136. |
| Acceptance criteria | `GET /applications?listingId=…` returns every application for a listing with receipt state. Withdraw is rejected unless a matching on-chain withdrawal is verifiable. Access-grant rows can be created and listed. All new endpoints appear in `docs/provider-api.md`. |
| Tests | Route tests for each endpoint including filter combinations, withdraw-without-onchain-proof rejection, and access-grant lifecycle. |
| Verification | Record request/response pairs for each new endpoint. |
| Failure fallback | Ship `GET /applications` alone if time is short — it is the one the UI cannot work without. |
| Sponsor | Sui, World. |
| Demo impact | Turns the provider inbox from a fixture into a live view. |
| Parallel safety | Shares `services/applications.ts` with RD-109. Serialize behind it. |

---

### RD-111 Renter Packet Handoff To Agent

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L5 Walrus/privacy + L8 Agent |
| Objective | Make the packet the agent submits be the packet the renter actually built. |
| Suggested implementation | Delete `createBrowserMockWalrus()` from `PacketBuilder.tsx` and use the shared adapter selected by RD-125. On successful upload, POST `{mandateId, walrusBlobId, packetHash, sizeBytes, encryptionMode}` to a new provider endpoint (`POST /packets`) so the record is durable. The agent then reads the packet record for its mandate instead of calling `makeSyntheticPacket()` + `createMockWalrusAdapter()`, and refuses to submit if no packet is registered for the mandate. The provider must store blob ID and hash only — never ciphertext bytes, never a key. |
| Files/modules | `apps/web/src/components/PacketBuilder.tsx`, `apps/web/app/renter/page.tsx`, `apps/provider-api/src/routes/`, `apps/agent/src/index.ts`, `packages/shared/src/packet.ts`. |
| Dependencies | RD-109. Coordinate with RD-122 (browser-capable adapter) and RD-135 (Seal encryption) so the handoff shape is written once. |
| Blocks | RD-113, RD-135. |
| Acceptance criteria | A packet built in the renter UI produces a blob ID that appears verbatim in the agent's `submit_application` transaction and in the on-chain `ApplicationReceipt.walrus_blob_id`. The agent errors clearly when no packet exists for the mandate. No plaintext and no encryption key ever reaches the provider API. |
| Tests | Unit test for the packet-record endpoint; agent test asserting it consumes the registered blob ID and refuses when absent; assertion that the request body contains no plaintext fields. |
| Verification | Show one blob ID flowing browser → provider → agent → on-chain receipt. |
| Browser verification | Required — the upload originates in page context. See `docs/browser-testing.md`. |
| Failure fallback | None acceptable. Without this the document story is theater. |
| Sponsor | Sui/Walrus. |
| Demo impact | This is the difference between "the renter's documents were submitted" being true and being a slide. |
| Parallel safety | Touches web + agent + provider. Land after RD-109; coordinate with RD-122. |

---

### RD-112 Mandate Registration And AgentCap Discovery

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L8 Agent + L3 Provider API |
| Objective | Let a mandate created in the browser become actionable without editing `.env`. |
| Suggested implementation | Two halves. (1) After `create_mandate` succeeds, the renter UI registers `{mandateId, ownerCapId, agentCapId, agentSuiAddress, txDigest}` with the provider API, which persists it. (2) The agent stops reading `AGENT_CAP_ID` from env: given a `mandateId`, it queries objects owned by `AGENT_SUI_ADDRESS` of type `<package>::rental::AgentCap` and selects the one whose `agent_cap_mandate_id` matches, aborting if zero or more than one match. Spec §14 already names this "a future hardening step" — this ticket makes it current. |
| Files/modules | `apps/agent/src/index.ts`, `apps/agent/src/suiSubmit.ts`, `packages/sui-client/src/client.ts` (add `findAgentCapForMandate`), `apps/web/src/components/MandateForm.tsx`, `apps/provider-api/src/routes/`. |
| Dependencies | RD-109. |
| Blocks | RD-113, RD-114. |
| Acceptance criteria | Creating a mandate in the UI and then triggering the agent for that mandate submits an application with no environment change and no restart. `AGENT_CAP_ID` becomes an optional override, not a requirement. Ambiguous or missing caps produce a clear typed error. |
| Tests | Unit tests for cap selection (exactly one match, no match, multiple matches); provider tests for mandate registration; live testnet smoke against a freshly created mandate. |
| Verification | Create a brand-new mandate in the browser and run the agent against it untouched. |
| Failure fallback | Keep `AGENT_CAP_ID` as an override path, but the discovery path must be the default. |
| Sponsor | Sui. |
| Demo impact | Removes the single most visible "there is a human in this loop" moment. |
| Parallel safety | `packages/sui-client` addition is additive and safe alongside other lanes. |

---

### RD-113 Agent Run Service

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L8 Agent |
| Objective | Turn the one-shot script into a service the UI can trigger. |
| Suggested implementation | Wrap the existing deterministic pipeline in a small Hono server. `POST /runs {mandateId, listingObjectId?}` starts a run and returns a `runId`; `GET /runs/:id` returns staged progress (`loaded-mandate`, `evaluated`, `reserved`, `submitted`, `verified`, or a typed failure) with tx digest and receipt ID; `GET /health` reports signer address and AgentKit mode. Keep `node dist/index.js` working as a CLI entrypoint over the same pipeline — do not fork the logic. The signing key stays process-env only and must never appear in a response. |
| Files/modules | `apps/agent/src/server.ts` (new), `apps/agent/src/run.ts` (extracted pipeline), `apps/agent/src/index.ts`, `apps/agent/package.json`. |
| Dependencies | RD-110, RD-112. |
| Blocks | RD-114, RD-116. |
| Acceptance criteria | The UI can start a run and watch it reach `verified` without touching a terminal. Ineligible listings still fail at the deterministic rule stage and never produce a transaction. Run state survives concurrent runs for different mandates. |
| Tests | Route tests for run lifecycle and failure stages; assertion that no response body or log line contains the private key; the existing 25 agent tests must keep passing against the extracted pipeline. |
| Verification | Trigger a run from `/agent` and capture the staged output plus the resulting testnet digest. |
| Browser verification | Required for the UI-triggered path; the service itself is testable with `curl`. See `docs/browser-testing.md`. |
| Failure fallback | A single blocking `POST /run` that returns the final result is acceptable; staged progress is polish. |
| Sponsor | World, Sui. |
| Demo impact | The agent stops being something the presenter runs and becomes something the system runs. |
| Parallel safety | Owns `apps/agent/` exclusively. Blocked by RD-112's cap discovery. |

---

### RD-114 Frontend Live-Data Wiring

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L7 Frontend |
| Objective | Delete every hardcoded demo fixture and read the real system. |
| Suggested implementation | Renter page: drop the `smokeMandate` fallback and resolve the connected wallet's mandates from chain plus the registry from RD-112; show an empty state when there are none. Provider page: drop `DEMO_APPLICATION_IDS` and drive `ApplicationInbox` from `GET /applications`. Landlord page: drop `SMOKE_RECEIPT_ID` and list receipts for the connected landlord address, keeping per-receipt detail. Keep the known-good testnet IDs available as an explicitly labeled "demo evidence" panel rather than as silent defaults. |
| Files/modules | `apps/web/app/renter/page.tsx`, `app/provider/page.tsx`, `app/landlord/page.tsx`, `src/components/ApplicationInbox.tsx`, `src/components/MandateStatus.tsx`. |
| Dependencies | RD-110, RD-112, RD-113. |
| Blocks | RD-116. |
| Acceptance criteria | `grep -rn "0x8354\|0xc46d\|app_1" apps/web/app apps/web/src` returns nothing outside a clearly labeled evidence panel. Every page renders a correct empty state with no data and correct live state with data. |
| Tests | Component tests with mocked API responses covering empty, loading, populated, and error states. |
| Verification | Screenshot each page against a fresh database and against a populated one. |
| Browser verification | Required — empty, loading, populated, and error states are only observable in page context. See `docs/browser-testing.md`. |
| Failure fallback | Keep the evidence panel, but the primary view must be live. |
| Sponsor | Sui, World. |
| Demo impact | A judge clicking around currently sees fixtures; this makes what they see real. |
| Parallel safety | Owns `apps/web/app/**`. Conflicts with RD-116 and RD-136 — sequence them. |

---

### RD-115 Canonical ID Source And Ineligible-Listing Fix

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L0 Project setup |
| Objective | Stop three packages from disagreeing about which objects the demo uses. |
| Suggested implementation | `apps/agent/src/index.ts:33` and `apps/provider-api/src/services/listings.ts:28` default the ineligible Porto listing to `0x1000…0006`, which is not a real object. The real one is `0xd0f9b4ae975b27d56af6c23844cbfa76dfda81f2913585788c51289ad1f0b3d1` (`packages/contracts-config/testnet.json` → `liveAgentRun.ineligibleListingObjectId`). Today the agent's ineligibility check silently falls into its `.catch(() => null)` "not readable" branch instead of proving mandate enforcement. Export a typed config from `@rentdelegate/contracts-config` and have web, agent, and provider import it instead of restating literals. Add a CI check that fails when a `0x`-prefixed 64-hex literal appears outside that package. |
| Files/modules | `packages/contracts-config/` (add `index.ts`, `package.json` exports), `apps/agent/src/index.ts`, `apps/provider-api/src/services/listings.ts`, `apps/provider-api/src/db/seeds.ts` (still contains `0xTODO_PORTO_INELIGIBLE_LISTING`), `apps/web/src/lib/constants.ts`. |
| Dependencies | None. Fully independent — good first parallel ticket. |
| Blocks | Nothing hard, but RD-114 and RD-126 are cleaner after it. |
| Acceptance criteria | The agent reads the real Porto listing and prints an eligibility *rejection* with the municipality reason, rather than "not readable (expected for mock object)". No object ID literal exists outside `packages/contracts-config`. |
| Tests | Unit test that the exported config parses and that every ID is 32 bytes; agent test asserting the ineligible path produces a rule rejection, not a read failure. |
| Verification | Run the agent and capture the ineligibility reason. |
| Failure fallback | None needed; this is a small mechanical change. |
| Sponsor | Sui. |
| Demo impact | The "Sui limits what the agent can do" half of the pitch currently demonstrates a missing object, not a refused action. |
| Parallel safety | Touches many files shallowly. Land it **first**, before the lanes diverge. |

---

### RD-116 `/agent` Operator Route

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L7 Frontend |
| Objective | Build the operator view the spec requires (§12) and the app does not have. |
| Suggested implementation | New `apps/web/app/agent/page.tsx`: mandate summary and remaining allowance, the eligible/ineligible listing evaluation with per-rule reasons, AgentKit mode and verification status, a "Run agent" button hitting RD-113's `POST /runs`, staged progress, and the resulting tx digest, receipt ID, and provider verification result with explorer links. Ineligible listings must show *why* in mandate terms. |
| Files/modules | `apps/web/app/agent/page.tsx`, `apps/web/src/components/AgentRunPanel.tsx`, `apps/web/src/lib/agentClient.ts`. |
| Dependencies | RD-113, RD-114. |
| Blocks | Demo narrative completeness. |
| Acceptance criteria | The full agent story — scope, evaluation, refusal, submission, receipt — is visible in the browser with no terminal. Next build keeps prerendering all routes. |
| Tests | Component tests for each run stage and for the refusal rendering. |
| Verification | Screenshot a successful run and a refused ineligible listing. |
| Browser verification | Required — capture both the success path and the refusal with its mandate-terms reason. See `docs/browser-testing.md`. |
| Failure fallback | Read-only panel plus CLI trigger. |
| Sponsor | World, Sui. |
| Demo impact | Currently the most compelling part of the system is only observable as terminal output. |
| Parallel safety | New file, but shares `apps/web/app` layout with RD-114. |

---

### RD-117 Withdraw Application End-To-End

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L1 Move + L3 Provider + L7 Frontend |
| Objective | Expose the revocability story that already exists in Move but has no path above it. |
| Suggested implementation | `withdraw_application` is implemented and tested in `packages/move/sources/rental.move:277` but has no PTB builder consumer, no API route, and no UI. Add a renter-side withdraw button (requires `OwnerCap`) using the existing `buildWithdrawApplicationTx`, call RD-110's withdraw endpoint with the digest, and show the receipt flipping to withdrawn on the landlord and provider views. |
| Files/modules | `apps/web/src/components/WithdrawButton.tsx`, `apps/web/app/renter/page.tsx`, `apps/provider-api/src/services/applications.ts`, `packages/sui-client/src/transactions.ts`. |
| Dependencies | RD-110, RD-114. |
| Blocks | RD-137 (a withdrawn receipt is one of the Seal denial cases). |
| Acceptance criteria | Renter withdraws; receipt `status` becomes `2` on chain; provider marks the row withdrawn only after verifying the transaction; landlord view reflects it. |
| Tests | Move tests already cover the abort paths; add API verification tests and a component test. |
| Verification | Live testnet withdrawal with digest and before/after receipt state. |
| Browser verification | Required — the renter signs with a wallet. Read the wallet signing pitfalls in `docs/browser-testing.md` before starting; explicit gas is not optional. |
| Failure fallback | CLI-only withdrawal, documented. |
| Sponsor | Sui. |
| Demo impact | Completes "inspectable *and* revocable" — currently only revoke-mandate is reachable. |
| Parallel safety | Depends on RD-110 and RD-114 both landing. |

---

### RD-118 Correlation IDs And Structured Logging

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L3 Provider API + L8 Agent |
| Objective | Implement spec §16, which is currently specified and entirely absent from the code. |
| Suggested implementation | `grep -rn "correlationId" apps packages` returns nothing today. Add middleware that accepts or mints an `x-correlation-id`, propagate it from the agent through every provider request, and emit structured JSON logs carrying the field set in spec §16 (`applicationId`, `mandateId`, `receiptId`, `txDigest`, `agentEvmAddress`, `agentSuiAddress`, `humanIdHash`, `walrusBlobId`). `humanIdHash` may be logged; the raw World human ID must never be. Never log key material or ciphertext. |
| Files/modules | `apps/provider-api/src/middleware/correlation.ts` (new), `apps/provider-api/src/app.ts`, `apps/agent/src/providerClient.ts`, `packages/shared/src/logging.ts` (new). |
| Dependencies | RD-109. |
| Blocks | Nothing, but makes every other ticket debuggable. |
| Acceptance criteria | One agent run produces a single correlation ID traceable across agent logs, provider logs, and the stored application row. A log-scrubbing test proves no secret or raw human ID is emitted. |
| Tests | Middleware unit tests; a redaction test asserting forbidden fields never appear. |
| Verification | Paste one correlated trace across both processes. |
| Failure fallback | Correlation ID propagation alone, without full structured logging. |
| Sponsor | None directly. |
| Demo impact | Low on stage, high during the build. |
| Parallel safety | Additive middleware; safe alongside most tickets once RD-109 lands. |
