---
letter: S
name: "Seal Access Control"
range: 131-139
status: active
---

# Epic S — Seal Access Control

> Background only. You do **not** need this file to execute a ticket —
> `node scripts/backlog.mjs show RD-xxx` tells you what to load.
> Tickets live in `plan/tickets/`; status is in `plan/state.md`.

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

