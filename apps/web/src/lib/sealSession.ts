import { SessionKey } from "@rentdelegate/seal";
import type { SealCompatibleClient } from "@rentdelegate/seal";

export type SealSessionOptions = {
  /** Sui address of the user creating the session (landlord). */
  address: string;
  /**
   * Package ID containing seal_approve_packet.
   * Must be LATEST_PACKAGE_ID (the upgraded package from RD-133).
   */
  packageId: string;
  /** Sui client compatible with @mysten/seal. */
  suiClient: SealCompatibleClient;
  /** Session TTL in minutes. Defaults to 10. */
  ttlMin?: number;
};

/**
 * Create a Seal SessionKey for the given address and package.
 *
 * After this call, the returned SessionKey needs a personal message signature
 * to be complete:
 *   1. Call `sessionKey.getPersonalMessage()` to get the message bytes.
 *   2. Sign them via `dAppKit.signPersonalMessage({ message })`.
 *   3. Call `await sessionKey.setPersonalMessageSignature(signature)`.
 *
 * The signature returned by dApp Kit is a base64-encoded string, which is
 * what `setPersonalMessageSignature` expects.
 */
export async function createSealSession(opts: SealSessionOptions): Promise<SessionKey> {
  return SessionKey.create({
    address: opts.address,
    packageId: opts.packageId,
    ttlMin: opts.ttlMin ?? 10,
    suiClient: opts.suiClient,
  });
}
