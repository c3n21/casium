# Seal Access Control — Design Decisions And Architecture

**Epic S tickets:** RD-131 … RD-138
**Status:** DONE — `seal_approve_packet` deployed at upgrade tx `BLqv4XRxg5MEGAt4jDr1v2eeNzuauQ7MhixH5971HgyS`.

---

## Identity Scheme

### Decision

The inner Seal identity for a rental application packet is:

```
id = bcs(mandate_id) || bcs(listing_id)
```

Both `mandate_id` and `listing_id` are 32-byte Sui object IDs, so the inner identity is exactly **64 bytes**.

BCS encoding of a Sui address/object ID is the raw 32 bytes with no length prefix (it is a fixed-size type in BCS). The shared utility `deriveSealIdentity({mandateId, listingObjectId})` in `packages/shared/src/seal.ts` is the single authoritative source for this layout — both the renter (encrypt) and landlord (decrypt) paths import it, so they can never drift.

### Why not the receipt ID?

The renter encrypts the packet _before_ submitting the application — the `ApplicationReceipt` object does not yet exist. The identity must be computable from information the renter has at encryption time.

`mandate_id` and `listing_id` are both known when the renter opens `PacketBuilder`:
- `mandate_id` comes from the wallet-connected renter's existing `RentalMandate` object.
- `listing_id` comes from the listing the renter is applying to.

Together they scope the ciphertext to exactly one intended application: one renter, one listing.

### Why not mandate ID alone?

Using only `mandate_id` would make one encrypted packet reusable across any listing the renter applies to. A landlord for listing B could (in principle) request decryption of a packet that was intended for listing A, and the policy would approve it because the mandate matches. Combining both IDs tightens the scope to a single application intent.

---

## Namespace (Package ID)

### Decision

The Seal identity namespace is the **original package ID** (`packageId` from
`packages/contracts-config/testnet.json` — the v1 package `0x7e0130cd…`).

The **upgraded package ID** (`latestPackageId`) is used only as the move-call target of the
`seal_approve_packet` PTB that key servers dry-run.

| Call site | Package ID |
|---|---|
| `SealClient.encrypt` / `createSealClient({ packageId })` | `packageId` (v1) |
| `SessionKey.create({ packageId })` | `packageId` (v1) |
| `tx.moveCall({ target: … })` for `seal_approve_packet` | `latestPackageId` (v2) |
| All other transaction targets | `latestPackageId` (v2) |

### Reasoning

`@mysten/seal` **requires** the namespace to be the first version of the package. Both
`SealClient.encrypt` and `SessionKey.create` fetch the package object and reject anything else:

```
InvalidPackageError: Package 0xbab0d701… is not the first version
```

This is deliberate on Seal's part. Pinning the namespace to v1 is what makes encrypted data
survive package upgrades — if the namespace tracked the latest version, every upgrade would
change the derived identity and permanently orphan all previously encrypted blobs.

Seal resolves the latest version itself when dry-running `seal_approve_packet`, so a v1
namespace does **not** mean key servers look for the function in the v1 package. This corrects
an earlier assumption in this document: encrypting under the original package ID does not break
decryption, and encrypting under the upgraded ID does not work at all.

Reference: [Seal documentation — the `seal_approve` convention](https://docs.sui.io/sui-stack/seal/sui-stack-seal#the-seal_approve-convention): "Seal prepends the package ID to form the full namespaced identity."

Both IDs must be read from `packages/contracts-config` at runtime — neither may be hardcoded in
application code outside that package.

---

## Policy Function

`seal_approve_packet` is a non-`public` `entry fun` in `rentdelegate::rental` (deployed in the
upgraded package `0xbab0d70134d065a2f48ad8d18f2d8681de0464b7417485cbda8446eff31e8937`). It is the
only function Seal key servers dry-run when a landlord requests decryption.

### Signature

```move
entry fun seal_approve_packet(
    id: vector<u8>,
    receipt: &ApplicationReceipt,
    mandate: &RentalMandate,
    clock: &Clock,
    ctx: &TxContext,
)
```

All three objects (`ApplicationReceipt`, `RentalMandate`, and the system `Clock`) are shared, so
the landlord's dry-run PTB can reference them without owning them.

### Six enforced conditions

| # | Condition | Abort code | Abort name |
|---|---|---|---|
| 1 | `ctx.sender() == receipt.landlord` | 17 | `ESEAL_WRONG_SENDER` |
| 2 | `id == bcs(receipt.mandate_id) \|\| bcs(receipt.listing_id)` | 18 | `ESEAL_WRONG_IDENTITY` |
| 3 | `receipt.status == STATUS_SUBMITTED` | 19 | `ESEAL_WRONG_STATUS` |
| 4 | `clock.timestamp_ms() <= receipt.access_expires_at_ms` | 20 | `ESEAL_EXPIRED_ACCESS` |
| 5 | `object::id(mandate) == receipt.mandate_id` | 21 | `ESEAL_WRONG_MANDATE` |
| 6 | `!mandate.revoked` | 22 | `ESEAL_MANDATE_REVOKED` |

All six must hold simultaneously. A failure on any one aborts the dry-run and the key servers
withhold the decryption key.

---

## Denial Matrix

| Case | Trigger | Abort code | Abort name | Proof type |
|---|---|---|---|---|
| 1 | Wallet is not `receipt.landlord` | 17 | `ESEAL_WRONG_SENDER` | Move test |
| 2 | `id` bytes do not match `mandate_id ‖ listing_id` | 18 | `ESEAL_WRONG_IDENTITY` | Move test |
| 3 | `receipt.status == STATUS_WITHDRAWN` | 19 | `ESEAL_WRONG_STATUS` | Move test |
| 4 | `clock.timestamp_ms() > receipt.access_expires_at_ms` | 20 | `ESEAL_EXPIRED_ACCESS` | Move test |
| 5 | `object::id(mandate) != receipt.mandate_id` | 21 | `ESEAL_WRONG_MANDATE` | Move test |
| 6 | `mandate.revoked == true` | 22 | `ESEAL_MANDATE_REVOKED` | Move test |
| 7 | `SessionKey` TTL elapsed | N/A (client-side) | — | Browser required |

Cases 1–6 are proven by Move unit tests in `packages/move/tests/seal_tests.move`. Run with:

```bash
~/.local/bin/sui move test --path packages/move
```

28 tests pass (including 7 `seal_tests`). Case 7 requires a live browser session with a Slush
wallet — see `docs/browser-testing.md`. `scripts/seal-denial-demo.mjs` documents all seven cases
and can be run with `node scripts/seal-denial-demo.mjs`.

---

## Key Servers And Threshold

Two Mysten Labs open-mode testnet key servers are configured in `packages/seal/src/config.ts`:

| Object ID | Weight |
|---|---|
| `0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75` | 1 |
| `0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8` | 1 |

**Threshold:** `>= 2` (both servers must agree). A threshold of 1 is acceptable for local
development only — a single key server is a single point of trust and undercuts the policy claim.

Key server object IDs are read from `packages/seal/src/config.ts` at runtime (overridable via
`SEAL_KEY_SERVER_IDS` env var). The key server object holds its authoritative URL as an on-chain
field, so the object IDs are stable even when server URLs rotate.

---

## Package Upgrade

`seal_approve_packet` does not exist in the original package and was added by the RD-132/RD-133
upgrade:

| Field | Value |
|---|---|
| Original package ID | `0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d` |
| Latest package ID | `0xbab0d70134d065a2f48ad8d18f2d8681de0464b7417485cbda8446eff31e8937` |
| Upgrade tx digest | `BLqv4XRxg5MEGAt4jDr1v2eeNzuauQ7MhixH5971HgyS` |
| Explorer | https://testnet.suivision.xyz/package/0xbab0d70134d065a2f48ad8d18f2d8681de0464b7417485cbda8446eff31e8937 |

All transaction targets use `latestPackageId`, including the `seal_approve_packet` PTB. The Seal
identity namespace, however, uses the **original** `packageId` — `@mysten/seal` enforces a
first-version namespace and rejects `latestPackageId` with `InvalidPackageError` (see Namespace
section above).

Pre-upgrade shared objects (`RentalMandate`, `RentalListing`, `ApplicationReceipt`) remain usable
by both the original and the upgraded package — no object-model change was required.

---

## Limitations

- **SessionKey TTL:** A `SessionKey` signed with `ttlMin` minutes expires after that duration. The
  landlord must create a new session key after expiry — there is no automatic refresh. Case 7 of the
  denial matrix is purely client-side and cannot be tested without a live browser.
- **Walrus blob expiry:** Blobs are stored for a fixed epoch count (5 epochs in the live smoke). A
  blob can expire while the on-chain `access_expires_at_ms` still permits access. The landlord view
  should show both lifetimes separately. Blob renewal uses `walrus extend`.
- **Testnet only:** All key servers, the package, and the shared objects referenced above are on
  Sui testnet. Mainnet deployment would require separate key server registration and a new publish.

---

## Security Notes

- The backup symmetric key returned by `SealClient.encrypt` is discarded immediately — it is never persisted, logged, or transmitted anywhere. The `packages/seal` client wrapper's public API does not expose it.
- The inner plaintext must never leave the browser. The provider API stores only `walrusBlobId` and `packetHash` — no ciphertext, no key material.
- Access to the ciphertext on Walrus is public. The only secret is the decryption key, access to which is controlled by the Move policy.
- The `seal_approve_packet` function relies on the package upgrade policy being well-governed. The `UpgradeCap` (`0x2250bb6b4e9804285aa42d9dd7f2737ecdd93ed4b03edbf515459fb7223d62af`) must not be made freely transferable.

---

## Denial Proof Matrix (populated — RD-137 DONE)

| Case | Trigger | Expected Move abort | Proof type |
|---|---|---|---|
| Wrong landlord wallet | Wallet != `receipt.landlord` | `ESEAL_WRONG_SENDER` (17) | Move test |
| Identity mismatch | Wrong `mandate_id` or `listing_id` in `id` | `ESEAL_WRONG_IDENTITY` (18) | Move test |
| Withdrawn receipt | `receipt.status == STATUS_WITHDRAWN` | `ESEAL_WRONG_STATUS` (19) | Move test |
| Expired access | `clock.timestamp_ms() > receipt.access_expires_at_ms` | `ESEAL_EXPIRED_ACCESS` (20) | Move test |
| Mandate/receipt mismatch | `object::id(mandate) != receipt.mandate_id` | `ESEAL_WRONG_MANDATE` (21) | Move test |
| Revoked mandate | `mandate.revoked == true` | `ESEAL_MANDATE_REVOKED` (22) | Move test |
| Expired `SessionKey` | Session TTL elapsed | Client-side error | Browser required |

Run `node scripts/seal-denial-demo.mjs` for the full annotated matrix.

---

## File Ownership

| File | Purpose |
|---|---|
| `packages/shared/src/seal.ts` | `deriveSealIdentity()` — single source of truth for the byte layout |
| `packages/seal/src/client.ts` | `SealClient` wrapper (RD-134) |
| `packages/move/sources/rental.move` | `seal_approve_packet` entry function (RD-132) |
| `apps/web/src/lib/packet.ts` | Renter encryption path (RD-135) |
| `apps/web/app/landlord/page.tsx` | Landlord decrypt UI (RD-136) |
| `docs/seal.md` | This file |
