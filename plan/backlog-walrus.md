# Epic W — Live Walrus Storage (RD-121 … RD-126)

Parent index: `plan/backlog.md`. Contract: `spec/development-spec.md` §10. Supersedes the "live upload
skipped" half of RD-101.

## Why This Epic Exists

RD-101 delivered a correct adapter interface and a working mock, and the CLI adapter is implemented
and unit-tested. What has never happened is a byte reaching the Walrus network. Three consequences:

| Gap | Evidence |
|---|---|
| No live upload has ever run | RD-101 verification explicitly records the live smoke as skipped to avoid spending wallet resources. `packages/contracts-config/testnet.json` has no Walrus blob entry. |
| There is no browser-usable adapter | `packages/walrus/src/http.ts` is **misnamed** — it exports `createWalrusCliAdapter`, which spawns `~/.local/bin/walrus` via `node:child_process`. There is no HTTP publisher/aggregator client and no `@mysten/walrus` dependency anywhere in the workspace, so `PacketBuilder` cannot reach Walrus at all and falls back to an in-component `Map`. |
| Blob lifetime is unrelated to access lifetime | The adapter defaults to `WALRUS_EPOCHS=1` while `ApplicationReceipt.access_expires_at_ms` is set independently. A blob can expire while the on-chain grant still says the landlord may read it. |

**Cost warning.** Every ticket here that touches the live network spends real testnet WAL and SUI from
the configured wallet. Do not run RD-123 or RD-124 without the user's explicit go-ahead, per the
standing repo rule.

---

### RD-121 Walrus Wallet And Funding Preflight

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | DONE — 2026-07-25 |
| Lane | L5 Walrus/privacy |
| Objective | Know, before spending anything, whether the environment can actually store a blob. |
| Suggested implementation | Add `pnpm --filter @rentdelegate/walrus check:env`, mirroring the existing `@rentdelegate/agent check:env`. It should resolve the `walrus` binary (`~/.local/bin/walrus`, never by exporting `PATH`), print the client version and configured context, resolve the wallet address, report SUI and WAL balances, and estimate the cost of storing one packet for the configured epoch count. It must exit non-zero with a readable message when WAL is insufficient, and it must not perform any write. |
| Files/modules | `packages/walrus/src/checkEnv.ts` (new), `packages/walrus/package.json`, `docs/walrus-adapter.md`. |
| Dependencies | None. |
| Blocks | RD-123, RD-124. |
| Acceptance criteria | The command reports binary version, context, address, SUI balance, WAL balance, and estimated storage cost, and refuses clearly when the wallet cannot pay. Read-only — verified by running it twice with unchanged balances. |
| Tests | Unit tests over captured CLI JSON output for the parsing paths; no live call in CI. |
| Verification | Paste the command output with balances redacted to whole numbers. |
| Failure fallback | A documented manual checklist in `docs/walrus-adapter.md`. |
| Sponsor | Walrus. |
| Demo impact | Prevents a live demo failing on an unfunded wallet. |
| Parallel safety | Isolated to `packages/walrus`. |

---

### RD-122 Walrus HTTP Adapter And File Rename

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | DONE — 2026-07-25 |
| Lane | L5 Walrus/privacy |
| Objective | Give the browser a real path to Walrus, and stop the filename lying about its contents. |
| Suggested implementation | Rename `packages/walrus/src/http.ts` to `cli.ts` (it exports `createWalrusCliAdapter`) and keep `index.ts` exports stable. Add a genuine `createWalrusHttpAdapter({ publisherUrl, aggregatorUrl })` implementing the same `WalrusAdapter` interface over the documented Walrus testnet publisher/aggregator HTTP API — `PUT /v1/blobs` to store, `GET /v1/blobs/{blobId}` to read — sourcing current endpoint URLs from the Walrus docs rather than hardcoding a guess. Evaluate `@mysten/walrus` as the alternative and record the decision in `docs/walrus-adapter.md`: the SDK gives wallet-signed uploads but pulls in WASM and a signing story in the browser, while a publisher is a trusted third party for availability but not for confidentiality — acceptable here because only ciphertext is ever uploaded. The HTTP adapter must run unmodified in both Node and the browser (no `node:` imports in its module graph). |
| Files/modules | `packages/walrus/src/cli.ts` (renamed), `packages/walrus/src/httpAdapter.ts` (new), `packages/walrus/src/index.ts`, `packages/walrus/package.json` (browser-safe export condition), `docs/walrus-adapter.md`. |
| Dependencies | RD-121 for the funding story if using signed uploads; otherwise independent. |
| Blocks | RD-111, RD-123, RD-125, RD-135. |
| Acceptance criteria | `PacketBuilder` imports the shared package and uploads without any `node:` module reaching the browser bundle. Round-trip upload/download works against a public testnet publisher/aggregator. The rename does not change any public export. |
| Tests | Mocked-`fetch` unit tests for store/read/status including non-2xx and malformed-response handling; one env-gated live round-trip. |
| Verification | Show a blob ID produced from the browser and read back through the aggregator. |
| Browser verification | Required — the point of the ticket is that it runs in page context. Confirm in devtools that no `node:` module reached the bundle. See `docs/browser-testing.md`. |
| Failure fallback | Keep CLI-only for the agent path and label the browser path mock, but then the renter packet story stays incomplete. |
| Sponsor | Walrus. |
| Demo impact | The renter's own upload becoming real is the whole point of the epic. |
| Parallel safety | Owns `packages/walrus`. Coordinate the shape with RD-111. |

---

### RD-123 Live Walrus Upload Smoke

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | DONE — 2026-07-25; HTTP adapter live smoke verified, CLI live smoke skipped because no Walrus CLI config file was present |
| Lane | L5 Walrus/privacy |
| Objective | Put a real encrypted packet on Walrus testnet and prove it comes back byte-identical. |
| Suggested implementation | With RD-121 reporting sufficient balance, upload one encrypted synthetic packet through the CLI adapter and one through the HTTP adapter. Record blob IDs, blob object IDs, the storing transaction digests, epoch count, and expiry epoch into a new `walrus` block in `packages/contracts-config/testnet.json`. Download both and assert byte equality and matching `packetHash`. Confirm via `walrus blob-status` that the blob reaches certified/available. Keep the uploaded content synthetic. |
| Files/modules | `scripts/walrus-live-smoke.mjs` (new), `packages/contracts-config/testnet.json`, `docs/walrus-adapter.md`. |
| Dependencies | RD-121, RD-122. |
| Blocks | RD-124, RD-126, RD-138. |
| Acceptance criteria | HTTP adapter live blob recorded, downloadable, and byte-identical to what was uploaded. CLI adapter is implemented and unit-tested; its live smoke requires a local Walrus CLI config file and was not claimed here. The README Walrus row changes from "Mock adapter (labeled)" to a live HTTP claim with evidence. |
| Tests | The smoke script itself, guarded by an explicit env flag so it can never run in CI by accident. |
| Verification | Blob IDs, digests, and status output in the ticket and in `testnet.json`. |
| Failure fallback | If WAL cannot be obtained, this epic stops at RD-122 and the README must keep saying mock. Do not claim a live upload that did not happen. |
| Sponsor | Walrus. |
| Demo impact | Converts the one remaining "mock" label in the sponsor table into a real integration. |
| Parallel safety | Serialized after RD-121/RD-122; no code conflicts. |

---

### RD-124 Blob Lifecycle And Access-Expiry Alignment

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | DONE — 2026-07-25 |
| Lane | L5 Walrus/privacy |
| Objective | Stop the blob from outliving or predeceasing the on-chain access grant. |
| Suggested implementation | Today `WALRUS_EPOCHS` defaults to `1` and `access_expires_at_ms` is chosen independently, so a receipt can grant access to a blob that has already expired. Derive the epoch count from the intended access window: compute required epochs from `access_expires_at_ms - now` against the current epoch duration, and refuse to submit an application whose access window exceeds the blob's stored lifetime. Add `extend`/renewal support to the adapter (`walrus extend`) and surface remaining blob lifetime in the landlord view. Treat blob deletion/expiry as a first-class state in `WalrusBlobStatus`. |
| Files/modules | `packages/walrus/src/adapter.ts`, `packages/walrus/src/cli.ts`, `apps/agent/src/index.ts`, `apps/web/app/landlord/page.tsx`, `packages/shared/src/constants.ts`. |
| Dependencies | RD-123. |
| Blocks | RD-136 (a landlord decrypting an expired blob is a confusing failure). |
| Acceptance criteria | An application whose access window exceeds the stored blob lifetime is rejected before submission with a readable reason. Landlord UI shows remaining blob lifetime alongside remaining access time. Extension works and is reflected in status. |
| Tests | Unit tests for the epoch calculation at boundaries; a status test for the expired case. |
| Verification | Show a rejected over-long access window and a successful extension. |
| Failure fallback | Store blobs for a generously long fixed epoch count and document the mismatch honestly. |
| Sponsor | Walrus. |
| Demo impact | Moderate on stage; it is what makes the storage claim defensible under questioning. |
| Parallel safety | Owns `packages/walrus`; coordinate the agent-side check with RD-113. |

---

### RD-125 Storage Mode Selection And Honest Labeling

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | DONE — 2026-07-25 |
| Lane | L5 Walrus/privacy + L7 Frontend |
| Objective | One switch chooses the storage backend everywhere, and the UI never misrepresents which is active. |
| Suggested implementation | Single `WALRUS_MODE` / `NEXT_PUBLIC_WALRUS_MODE` of `mock | http | cli`, resolved in one factory in `packages/walrus` and consumed by web, agent, and provider. Mock blob IDs keep the `mock:` prefix. Every surface that displays a blob ID — `PacketBuilder`, the provider inbox, the landlord panel, the README sponsor table — must render the active mode from the value, not from a prop default. `PacketBuilder`'s current `walrusMode = "mock"` prop default is exactly the failure mode to remove: it can display `mock` while something else is configured, or vice versa. |
| Files/modules | `packages/walrus/src/index.ts` (factory), `apps/web/src/components/PacketBuilder.tsx`, `apps/agent/src/index.ts`, `apps/provider-api/src/app.ts` (`/health`), `README.md`. |
| Dependencies | RD-122. |
| Blocks | RD-138. |
| Acceptance criteria | Changing one env var moves every surface between mock and live with no code edit. A blob ID starting with `mock:` can never render as live, and a real blob ID can never render as mock. `/health` reports the active storage mode. |
| Tests | Factory unit tests for each mode; a component test asserting the label follows the blob ID prefix. |
| Verification | Screenshots of the same page in both modes. |
| Browser verification | Required — record the env var value alongside each screenshot, since the whole ticket is about the label matching reality. See `docs/browser-testing.md`. |
| Failure fallback | None; this is small and it is the sponsor-integrity guardrail. |
| Sponsor | Walrus. |
| Demo impact | Protects against the worst possible outcome — accidentally overclaiming a live integration. |
| Parallel safety | Touches several apps shallowly; land it in the same wave as RD-122. |

---

### RD-126 Provider-Side Blob Availability Verification

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | DONE — 2026-07-25 |
| Lane | L3 Provider API + L5 Walrus |
| Objective | Make receipt verification check that the referenced document actually exists. |
| Suggested implementation | The provider's Sui verifier currently checks the receipt object but never asks whether `walrus_blob_id` resolves. Extend `POST /applications/:id/verify` to call `walrus.status(blobId)` and, in live mode, to download the ciphertext and confirm its hash equals the receipt's `packet_hash`. Add error codes `BLOB_UNAVAILABLE` (422) and `PACKET_HASH_MISMATCH` (422). In mock mode, skip the check and record `blobVerification: "skipped-mock"` on the stored row so the difference is auditable rather than invisible. |
| Files/modules | `apps/provider-api/src/services/suiVerifier.ts`, `src/services/applications.ts`, `packages/shared/src/errors.ts`, `docs/provider-api.md`. |
| Dependencies | RD-110, RD-123. |
| Blocks | RD-138. |
| Acceptance criteria | A receipt pointing at a nonexistent blob is rejected with `BLOB_UNAVAILABLE`. A receipt whose blob hashes differently is rejected with `PACKET_HASH_MISMATCH`. Mock mode records the skip explicitly. The provider never stores or logs plaintext or ciphertext. |
| Tests | Verifier tests with a stubbed adapter for available, missing, and hash-mismatch cases. |
| Verification | Show all three outcomes against the live blob from RD-123. |
| Failure fallback | Status check only, without hash confirmation. |
| Sponsor | Walrus, Sui. |
| Demo impact | Closes the "the receipt could point at nothing" hole a technical judge will probe. |
| Parallel safety | Shares `services/applications.ts` with RD-109/RD-110; serialize. |
