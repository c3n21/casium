# Epic S — Seal Policy-Controlled Access (RD-131 … RD-138)

Parent index: `plan/backlog.md`. Contract: `spec/development-spec.md` §11.
**Supersedes RD-201**, which was a single P2 stretch ticket. Seal is now required scope.

## Why This Epic Exists

`packages/seal` currently contains a `package.json` and nothing else. The landlord has no way to read
a document: the AES-GCM key generated in `apps/web/src/lib/packet.ts` lives only in the renter's React
state and is never transmitted to anyone. So the on-chain `access_expires_at_ms` grant presently
authorizes access to something no one can decrypt.

Seal replaces that dead end: the packet is encrypted to an identity, and the decryption key is
released by threshold key servers only after they dry-run a Move function that says this specific
landlord is allowed to read this specific application right now.

## What Already Fits, And What Does Not

Verified against `packages/move/sources/rental.move` before writing these tickets:

| Fact | Consequence |
|---|---|
| `RentalMandate`, `RentalListing`, and `ApplicationReceipt` are all **shared** objects (`transfer::share_object`) | A dry-run PTB sent by the landlord can take all three as inputs. **No object-model change is needed** — this is the single biggest risk that turned out not to exist. |
| `ApplicationReceipt` already carries `mandate_id`, `listing_id`, `landlord`, `status`, `access_expires_at_ms`, `walrus_blob_id`, `packet_hash` | The policy has every field it needs with no new struct fields. |
| The receipt does not exist when the renter encrypts | The Seal identity **cannot** be the receipt ID. See RD-131. |
| `seal_approve*` must be a non-`public` `entry fun` whose first parameter is `id: vector<u8>` | The existing module exposes only `public fun`s, so this is a new function shape for this codebase. |
| Seal prepends the package ID to the identity | Adding `seal_approve` requires a package upgrade (`UpgradeCap` `0x2250bb6b4e9804285aa42d9dd7f2737ecdd93ed4b03edbf515459fb7223d62af`), which makes "which package ID is the namespace" a decision, not a detail. See RD-131 and RD-133. |

Sources for the Seal contract used below: [Encryption with Seal — Sui docs](https://docs.sui.io/sui-stack/seal/sui-stack-seal),
[SealClient and SessionKey — DeepWiki](https://deepwiki.com/MystenLabs/seal/4.1-sealclient-and-sessionkey),
[Seal SDK](https://sdk.mystenlabs.com/seal), [Using Seal](https://seal-docs.wal.app/UsingSeal).

---

### RD-131 Seal Identity Scheme And Namespace Decision

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L6 Seal |
| Objective | Decide, before any code, what the encrypted identity is and which package ID namespaces it. |
| Suggested implementation | Two decisions, both written down in `docs/seal.md` with reasoning. **(1) Inner identity.** The renter encrypts before an `ApplicationReceipt` exists, so the identity cannot be the receipt ID. Recommended: `id = bcs(mandate_id) ‖ bcs(listing_id)` — both are known at packet-build time and together scope the ciphertext to exactly one intended application. Alternative (mandate-only) makes one packet reusable across listings but widens who can eventually decrypt; if chosen, say so explicitly. **(2) Namespace.** Seal prepends the package ID to the inner identity, and `seal_approve` must exist in the package being dry-run. Adding it requires an upgrade, so pin whether encryption uses the original published package ID (`0x7e0130cd…`, stable forever, and what existing receipts already reference) or the upgraded one — and confirm the choice against current Seal upgrade guidance rather than assuming. Getting this wrong makes every previously encrypted packet permanently unreadable. |
| Files/modules | `docs/seal.md` (new), `packages/shared/src/seal.ts` (new — the identity derivation function, shared by encrypt and decrypt so the two can never drift). |
| Dependencies | None. |
| Blocks | RD-132, RD-134. |
| Acceptance criteria | `docs/seal.md` states the identity layout, the namespace package ID, and the reasoning. A single exported `deriveSealIdentity({mandateId, listingObjectId})` is the only place bytes are laid out. |
| Tests | Unit tests for identity derivation: determinism, byte length, and that different mandate/listing pairs never collide. |
| Verification | Link the Seal documentation passage that settles the namespace question. |
| Failure fallback | None — every other ticket in this epic depends on this being fixed first. |
| Sponsor | Sui/Seal. |
| Demo impact | Invisible on stage, unrecoverable if wrong. |
| Parallel safety | Pure decision + one small module. Do it first, alone. |

---

### RD-132 Move `seal_approve` Policy Functions

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L1 Move + L6 Seal |
| Objective | Encode the landlord access policy in Move, where it can be enforced rather than asserted. |
| Suggested implementation | Add to `rentdelegate::rental`, following the required shape — non-`public`, `entry`, first parameter `id: vector<u8>`, aborting with a specific error code on any failure: `entry fun seal_approve_packet(id: vector<u8>, receipt: &ApplicationReceipt, mandate: &RentalMandate, clock: &Clock, ctx: &TxContext)`. Checks, each with its own abort code: the caller is the receipt's landlord (`ctx.sender() == receipt.landlord`); `id` equals the identity derived from `receipt.mandate_id ‖ receipt.listing_id`, binding the ciphertext to this receipt; `receipt.status == STATUS_SUBMITTED` (so withdrawal revokes access); `clock.timestamp_ms() <= receipt.access_expires_at_ms`; `object::id(mandate) == receipt.mandate_id`; and `!mandate.revoked` (so mandate revocation revokes access). Add error constants in the existing `ESCREAMING_CASE` style. All three objects are already shared, so the landlord can supply them as dry-run inputs. Do not call `seal_approve` from any other Move function. |
| Files/modules | `packages/move/sources/rental.move`, `packages/move/tests/`. |
| Dependencies | RD-131. |
| Blocks | RD-133. |
| Acceptance criteria | `sui move build` and `sui move test` pass. The function is `entry`, not `public`. Every denial path has a distinct abort code. Approval succeeds only when all six conditions hold. |
| Tests | Move tests for: happy path; wrong sender; mismatched `id`; withdrawn receipt; expired access via `Clock`; revoked mandate; mandate not matching the receipt. Each asserts the specific abort code, extending the existing 21-test suite. |
| Verification | `~/.local/bin/sui move test --path packages/move` output with the new test count. |
| Failure fallback | None. |
| Sponsor | Sui/Seal. |
| Demo impact | This function *is* the privacy claim. |
| Parallel safety | Owns `packages/move`. Nothing else in this epic may start until it compiles. |

---

### RD-133 Package Upgrade To Testnet

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED — **spends live testnet gas** |
| Lane | L1 Move + L0 Project setup |
| Objective | Get `seal_approve_packet` on chain without orphaning the objects already in use. |
| Suggested implementation | Upgrade with `UpgradeCap` `0x2250bb6b4e9804285aa42d9dd7f2737ecdd93ed4b03edbf515459fb7223d62af`. Dry-run first. Existing shared objects — the live mandate, listings, and receipts referenced in `testnet.json` — must remain readable and usable by the existing functions; verify this rather than assuming it. Record in `packages/contracts-config/testnet.json` **both** IDs under an explicit `upgrade` block: `originalPackageId` (`0x7e0130cd…`) and `latestPackageId`, plus the upgrade digest and version. Consumers must then be explicit about which they use: transaction targets use latest, and the Seal identity namespace uses whichever RD-131 pinned. Follow `agent/skills/sui-publish/SKILL.md`. |
| Files/modules | `packages/move/Move.toml`, `Published.toml`, `packages/contracts-config/testnet.json`, `docs/sui-deployment.md`. |
| Dependencies | RD-132. |
| Blocks | RD-135, RD-136, RD-137. |
| Acceptance criteria | Upgrade transaction succeeds; new package version on chain exposes `seal_approve_packet`; a `submit_application` against a pre-upgrade listing still succeeds; both package IDs recorded with the upgrade digest. |
| Tests | Post-upgrade live smoke: one successful `submit_application` and one successful `seal_approve_packet` dry-run. |
| Verification | Upgrade digest, both package IDs, and explorer links in `testnet.json`. |
| Failure fallback | Publish as a fresh package and re-seed demo objects — but then every ID in `testnet.json` and every doc reference changes, which is far more expensive. Prefer the upgrade. |
| Sponsor | Sui. |
| Demo impact | Gate for everything downstream in this epic. |
| Parallel safety | Serialized after RD-132. Announce before running — it changes IDs other lanes read. |

---

### RD-134 `packages/seal` Client Wrapper

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L6 Seal |
| Objective | Fill the empty package with a typed wrapper the web app and tests can share. |
| Suggested implementation | Add `@mysten/seal` as a dependency (the workspace has none today) and build `packages/seal/src/client.ts` exposing `encryptPacket(bytes, {mandateId, listingObjectId})` and `decryptPacket(encryptedObject, sessionKey, txBytes)` over `SealClient`. Configure `serverConfigs` from allowlisted testnet key server object IDs with explicit `weight`s and `verifyKeyServers: true`, and read the object IDs from config rather than hardcoding, since a key server object holds the authoritative URL. Start at `threshold: 1` for local development but **ship the demo at `threshold >= 2`** — a single key server is a single point of trust and undercuts the claim being made. Encryption calls `encrypt({threshold, packageId, id, data})` with `id` from RD-131's shared derivation. Handle and type the backup symmetric key returned by `encrypt` explicitly: it is a full bypass of the policy, so it must be discarded, never persisted, never logged, never sent anywhere. |
| Files/modules | `packages/seal/package.json`, `packages/seal/src/client.ts`, `src/config.ts`, `src/index.ts`, `packages/seal/vitest.config.ts`. |
| Dependencies | RD-131. |
| Blocks | RD-135, RD-136. |
| Acceptance criteria | Package builds and is importable from both `apps/web` and tests. Threshold and key servers come from config. A test asserts the backup key is not returned from the wrapper's public API. |
| Tests | Unit tests with mocked key servers for encrypt/decrypt round-trip, threshold configuration, and key-server verification failure. |
| Verification | Build output plus the key server set and threshold used. |
| Failure fallback | None. |
| Sponsor | Sui/Seal. |
| Demo impact | The shared surface every Seal UI path uses. |
| Parallel safety | Owns `packages/seal`. Can run concurrently with RD-132/RD-133 once RD-131 lands. |

---

### RD-135 Seal Encryption In The Renter Packet Flow

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L5 Privacy + L7 Frontend |
| Objective | Replace the unshareable AES-GCM key with Seal-encrypted ciphertext. |
| Suggested implementation | `apps/web/src/lib/packet.ts` currently encrypts with a Web Crypto AES-GCM key that exists only in React state — correct as a demonstration, useless as a delivery mechanism. Switch `PacketBuilder` to Seal for the shipped path: the renter selects the target listing (needed for the RD-131 identity), the packet is Seal-encrypted, and the resulting `encryptedObject` bytes are uploaded to Walrus through the RD-122 adapter. `packetHash` is computed over the ciphertext actually uploaded so RD-126's provider-side check matches. Keep the AES-GCM path behind an explicit `mock` encryption mode for offline development, labeled in the UI exactly as the Walrus mock is. The renter must be able to see which mode produced their packet. |
| Files/modules | `apps/web/src/lib/packet.ts`, `apps/web/src/components/PacketBuilder.tsx`, `apps/web/app/renter/page.tsx`, `packages/shared/src/packet.ts`. |
| Dependencies | RD-133, RD-134, RD-122, RD-111. |
| Blocks | RD-136, RD-137. |
| Acceptance criteria | A packet built in the browser is Seal-encrypted, uploaded to Walrus, and its blob ID reaches the on-chain receipt. No decryption key is retained by the renter session, transmitted to the provider, or needed by the agent. The UI names the active encryption mode from the ciphertext, not from a prop default. |
| Tests | Round-trip test through mocked key servers; a test asserting no key material appears in the provider request body; existing packet tests updated. |
| Verification | One packet traced from the renter form to the on-chain `walrus_blob_id`. |
| Browser verification | Required — Seal encryption runs in page context. See `docs/browser-testing.md`. |
| Failure fallback | AES-GCM plus a manual key handoff, labeled "Seal fallback mode" — a fallback, not a claim of Seal access control. |
| Sponsor | Sui/Seal/Walrus. |
| Demo impact | The renter side of the privacy story. |
| Parallel safety | Shares `PacketBuilder.tsx` with RD-111 and RD-125. Sequence these three deliberately. |

---

### RD-136 Landlord SessionKey And Decryption UI

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L7 Frontend + L6 Seal |
| Objective | Let an authorized landlord actually read a document, and no one else. |
| Suggested implementation | On `/landlord`: create a `SessionKey` via `SessionKey.create({address, packageId, ttlMin, suiClient})`, have the landlord approve it once by signing a personal message through dApp Kit, then per receipt build a PTB whose only command is `seal_approve_packet(id, receipt, mandate, clock)` — all three objects are shared, so the landlord can reference them — serialize it with `onlyTransactionKind: true`, call `fetchKeys`/`decrypt`, download the ciphertext from Walrus, and render the decrypted synthetic packet. Show session TTL remaining, blob lifetime remaining (RD-124), and on-chain access expiry as three distinct facts, because they expire independently. Record each successful decrypt as a `document_access_grants` row via RD-110. Plaintext must stay in memory: never persisted, never logged, never sent to the provider. |
| Files/modules | `apps/web/app/landlord/page.tsx`, `apps/web/src/components/PacketViewer.tsx` (new), `src/lib/sealSession.ts` (new). |
| Dependencies | RD-133, RD-134, RD-135, RD-110, RD-114. |
| Blocks | RD-137, RD-138. |
| Acceptance criteria | The authorized landlord decrypts and reads a synthetic packet in the browser after one signature. A wallet that is not the receipt's landlord is refused by the key servers with a message naming the Move abort. No plaintext leaves the browser. |
| Tests | Component tests for session creation, approved decrypt, and each denial; an assertion that no network request carries plaintext. |
| Verification | Screenshots of an authorized decrypt and a refused one. |
| Browser verification | **Required and unavoidable** — this ticket has no CLI path. A personal-message signature plus a key-server round trip only happen in page context. Read `docs/browser-testing.md` in full before starting, including the wallet-session prerequisite. |
| Failure fallback | Fallback mode from RD-135, clearly labeled. |
| Sponsor | Sui/Seal. |
| Demo impact | The payoff shot: policy-controlled access enforced by Move, not by a backend's promise. |
| Parallel safety | Owns `apps/web/app/landlord`. Conflicts with RD-114 — land RD-114 first. |

---

### RD-137 Seal Denial Proof Matrix

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L6 Seal |
| Objective | Prove the policy denies, live, not only that it permits. |
| Suggested implementation | Run every denial path against the deployed package with real key servers and capture the output. Cases: a wallet that is not the landlord; a receipt whose `id` does not match the ciphertext identity; a withdrawn receipt (via RD-117); a mandate revoked after submission; access past `access_expires_at_ms`; an expired `SessionKey`; and a mandate/receipt mismatch. Each must fail with its distinct Move abort code surfaced to the user. Record them in `docs/seal.md` alongside the duplicate-human evidence, and follow the same honesty rule as RD-014 — a fixture-based proof must be labeled as one. |
| Files/modules | `docs/seal.md`, `scripts/seal-denial-demo.mjs` (new), `packages/move/tests/`. |
| Dependencies | RD-136, RD-117. |
| Blocks | RD-138. |
| Acceptance criteria | All seven denials reproduce on demand with distinct, readable errors. Anything only provable by fixture is labeled as such. |
| Tests | The script itself, plus Move-level tests already added in RD-132. |
| Verification | Captured output for each case. |
| Browser verification | Required for the landlord-facing denials and the expired-`SessionKey` case; the Move-level aborts are provable from tests. See `docs/browser-testing.md`. |
| Failure fallback | Move-level denial tests plus the subset of live cases that are reachable, honestly scoped. |
| Sponsor | Sui/Seal. |
| Demo impact | Denial is more convincing than approval; approval alone proves nothing about a policy. |
| Parallel safety | Runs after the epic; no code ownership conflicts. |

---

### RD-138 Walrus And Seal Documentation And Evidence

| Field | Value |
|---|---|
| Priority | P1-completion |
| Status | NOT STARTED |
| Lane | L9 Demo/docs |
| Objective | Make the completed privacy story checkable by someone who did not build it. |
| Suggested implementation | Write `docs/seal.md` (architecture, identity scheme, policy table, key servers and threshold, denial matrix, limitations). Update `docs/walrus-adapter.md` for the three modes and live evidence. Update the README sponsor table so Walrus and Seal carry live claims with links only if RD-123 and RD-136 actually succeeded — if either did not, the table must keep saying mock. Extend `docs/demo-script.md` with the renter-encrypts → landlord-decrypts → landlord-denied sequence. Update `AGENTS.md` status. |
| Files/modules | `docs/seal.md`, `docs/walrus-adapter.md`, `docs/demo-script.md`, `README.md`, `AGENTS.md`, `plan/backlog.md`. |
| Dependencies | RD-123, RD-126, RD-137. |
| Blocks | Submission. |
| Acceptance criteria | A reader can reproduce both the storage and access-control claims from the docs alone. No claim exceeds what was actually run. |
| Tests | Link check; a fresh-machine read-through. |
| Verification | Docs diff plus the evidence links. |
| Failure fallback | Document the achieved level honestly using the fallback ladder in spec §19. |
| Sponsor | Sui/Seal/Walrus. |
| Demo impact | Determines whether the work is believed. |
| Parallel safety | Docs-only; runs last. |
