# Seal Access Control — Design Decisions And Architecture

**Epic S ticket:** RD-131  
**Status:** Decisions recorded; implementation in RD-132 … RD-137.

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

Encryption uses the **upgraded package ID** (`latestPackageId` from `packages/contracts-config/testnet.json` after RD-133), not the original.

### Reasoning

Seal prepends the package ID to the inner identity at encryption time and verifies it by dry-running a PTB that calls `<packageId>::rental::seal_approve_packet`. That function does not exist in the original package (`0x7e0130cd…`); it is added by the RD-132/RD-133 upgrade. If we encrypted using the original package ID, the key servers would try to dry-run `seal_approve_packet` in the original package and find no such function — decryption would fail permanently.

Reference: [Seal documentation — the `seal_approve` convention](https://docs.sui.io/sui-stack/seal/sui-stack-seal#the-seal_approve-convention): "Seal prepends the package ID to form the full namespaced identity."

Consequence: all packets encrypted before the package upgrade (i.e., before RD-133) are encrypted in mock/AES-GCM mode and are unaffected. Once the upgraded package is live, the renter flow switches to Seal-encrypted mode using `latestPackageId`.

The `latestPackageId` must be read from `packages/contracts-config` at runtime — it must not be hardcoded in application code outside that package.

---

## Access Policy (RD-132 preview)

The `seal_approve_packet` Move function will enforce all six conditions:

| # | Condition | Error code |
|---|---|---|
| 1 | `ctx.sender() == receipt.landlord` | `ENOT_LANDLORD` |
| 2 | `id == bcs(receipt.mandate_id) \|\| bcs(receipt.listing_id)` | `EIDENTITY_MISMATCH` |
| 3 | `receipt.status == STATUS_SUBMITTED` | `ERECEIPT_NOT_ACTIVE` |
| 4 | `clock.timestamp_ms() <= receipt.access_expires_at_ms` | `EACCESS_EXPIRED` |
| 5 | `object::id(mandate) == receipt.mandate_id` | `EMANDATE_MISMATCH` |
| 6 | `!mandate.revoked` | `EMANDATE_REVOKED` |

Denial proof for each condition is captured in RD-137.

---

## Key Servers And Threshold

- **Demo threshold:** `>= 2` out of the Mysten Labs testnet key server set.
- A single key server (`threshold: 1`) is a single point of trust and undermines the policy claim. It is acceptable for local development only.
- Key server object IDs are stored in `packages/contracts-config` and resolved at runtime so they are not hardcoded in application code.
- The key server object holds the authoritative URL as an on-chain field — do not hardcode server URLs; read them from the object.

---

## Security Notes

- The backup symmetric key returned by `SealClient.encrypt` is discarded immediately — it is never persisted, logged, or transmitted anywhere. The `packages/seal` client wrapper's public API does not expose it.
- The inner plaintext must never leave the browser. The provider API stores only `walrusBlobId` and `packetHash` — no ciphertext, no key material.
- Access to the ciphertext on Walrus is public. The only secret is the decryption key, access to which is controlled by the Move policy.
- The `seal_approve_packet` function relies on the package upgrade policy being well-governed. The `UpgradeCap` (`0x2250bb6b4e9804285aa42d9dd7f2737ecdd93ed4b03edbf515459fb7223d62af`) must not be made freely transferable.

---

## Denial Proof Matrix (populated in RD-137)

| Case | Trigger | Expected Move abort | Live-proven? |
|---|---|---|---|
| Wrong landlord wallet | Wallet != `receipt.landlord` | `ENOT_LANDLORD` | — |
| Identity mismatch | Wrong `mandate_id` or `listing_id` in `id` | `EIDENTITY_MISMATCH` | — |
| Withdrawn receipt | `receipt.status == STATUS_WITHDRAWN` | `ERECEIPT_NOT_ACTIVE` | — |
| Revoked mandate | `mandate.revoked == true` | `EMANDATE_REVOKED` | — |
| Access expired | `clock.timestamp_ms() > receipt.access_expires_at_ms` | `EACCESS_EXPIRED` | — |
| Expired `SessionKey` | Session TTL elapsed | Client-side error | — |
| Mandate/receipt mismatch | `object::id(mandate) != receipt.mandate_id` | `EMANDATE_MISMATCH` | — |

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
