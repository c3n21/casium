import { SessionKey } from "@casium/seal";
import type { SealCompatibleClient } from "@casium/seal";

export type SealSessionOptions = {
  /** Sui address of the user creating the session (landlord). */
  address: string;
  /**
   * Seal namespace package ID. Must be PACKAGE_ID — the *original* (v1)
   * package. `SessionKey.create` rejects any later version with
   * InvalidPackageError ("Package … is not the first version"), and the value
   * must match the namespace used at encryption time.
   *
   * Not to be confused with the PTB move-call target for seal_approve_packet,
   * which uses LATEST_PACKAGE_ID because the function only exists in v2.
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
