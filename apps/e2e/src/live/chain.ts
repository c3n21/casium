/**
 * Read-only testnet access for the live tier.
 *
 * The suite never signs and never writes. Everything here is a real gRPC read
 * against `fullnode.testnet.sui.io`, which is also why the live project sets
 * `retries: 1` — the public endpoint is the flaky dependency.
 *
 * Reading the on-chain receipt rather than restating its fields is what keeps
 * `receipt-verify.spec.ts` honest: the reservation it builds is derived from
 * chain state, so the provider's verifier is compared against the same source
 * of truth it reads itself.
 */

import { createCasiumClient } from "@casium/sui-client";
import type { ApplicationReceipt, RentalListing, RentalMandate } from "@casium/sui-client";
import { LATEST_PACKAGE_ID, RPC_URL } from "@casium/contracts-config";

export function testnetClient() {
  return createCasiumClient({
    network: "testnet",
    rpcUrl: RPC_URL,
    packageId: LATEST_PACKAGE_ID,
  });
}

export async function readReceipt(receiptId: string): Promise<ApplicationReceipt> {
  return testnetClient().getReceipt(receiptId);
}

export async function readMandate(mandateId: string): Promise<RentalMandate> {
  return testnetClient().getMandate(mandateId);
}

export async function readListing(listingObjectId: string): Promise<RentalListing> {
  return testnetClient().getListing(listingObjectId);
}

/** The Walrus blob ID stored on a receipt, as the provider compares it (UTF-8). */
export function receiptBlobId(receipt: ApplicationReceipt): string {
  return new TextDecoder().decode(Uint8Array.from(receipt.walrusBlobIdBytes));
}

/** The packet hash stored on a receipt, as the provider compares it (lowercase hex). */
export function receiptPacketHash(receipt: ApplicationReceipt): string {
  return `0x${receipt.packetHashBytes.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
