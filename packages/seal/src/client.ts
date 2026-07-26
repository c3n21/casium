import { SealClient, SessionKey } from "@mysten/seal";
import type { SealCompatibleClient } from "@mysten/seal";
import { deriveSealIdentity, identityToHex } from "@casium/shared";
import { DEFAULT_THRESHOLD, getKeyServerConfigs } from "./config.js";

export { SessionKey };
export type { SessionKey as SessionKeyType, SealCompatibleClient };

export type EncryptOptions = {
  mandateId: string;
  listingObjectId: string;
};

export type DecryptOptions = {
  /** An approved Seal SessionKey obtained from the landlord's wallet. */
  sessionKey: SessionKey;
  /**
   * Serialised PTB bytes whose sole command calls `seal_approve_packet`.
   * The PTB is never executed on-chain; key servers dry-run it to evaluate the
   * access policy.
   */
  txBytes: Uint8Array;
};

export type SealClientOptions = {
  /**
   * A Sui client compatible with @mysten/seal — any `ClientWithExtensions`
   * implementing the `core` extension (SuiGrpcClient or SuiJsonRpcClient).
   */
  suiClient: SealCompatibleClient;
  /**
   * Sui package ID that contains `seal_approve_packet`.
   * Defaults to `process.env.SEAL_PACKAGE_ID ?? process.env.SUI_PACKAGE_ID`.
   * After the RD-133 upgrade this must be the *upgraded* package ID
   * (latestPackageId from contracts-config), not the original.
   */
  packageId?: string;
  /**
   * Minimum number of key servers that must agree before decryption succeeds.
   * Defaults to DEFAULT_THRESHOLD (2).
   */
  threshold?: number;
};

/**
 * Typed wrapper around `@mysten/seal`'s `SealClient` scoped to the
 * Casium packet encryption use-case.
 *
 * Key design decisions (see docs/seal.md for full rationale):
 * - The Seal `id` (inner identity) is always derived via `deriveSealIdentity`
 *   so encryption and decryption callers can never drift from the canonical
 *   layout: bcs(mandate_id) || bcs(listing_id).
 * - The backup symmetric key returned by `SealClient.encrypt` is discarded
 *   immediately and never exposed through this wrapper's public API.
 */
export function createSealClient(options: SealClientOptions) {
  const { suiClient, threshold = DEFAULT_THRESHOLD } = options;
  const packageId =
    options.packageId ??
    process.env["SEAL_PACKAGE_ID"] ??
    process.env["SUI_PACKAGE_ID"] ??
    "";

  const serverConfigs = getKeyServerConfigs();

  const sealClient = new SealClient({
    suiClient,
    serverConfigs,
    verifyKeyServers: false, // set to true in production
  });

  return {
    /**
     * Encrypt `bytes` with Seal using the mandate + listing identity.
     *
     * The backup symmetric key from `SealClient.encrypt` is intentionally
     * dropped here — it is a full bypass of the policy and must never be
     * persisted or transmitted.
     *
     * @returns BCS-encoded encrypted object bytes ready for Walrus upload.
     */
    async encryptPacket(
      bytes: Uint8Array,
      opts: EncryptOptions,
    ): Promise<Uint8Array> {
      const identityBytes = deriveSealIdentity({
        mandateId: opts.mandateId,
        listingObjectId: opts.listingObjectId,
      });
      // SealClient.encrypt requires the inner identity as a hex string (without
      // 0x prefix). Seal prepends the packageId automatically.
      const id = identityToHex(identityBytes);

      const { encryptedObject } = await sealClient.encrypt({
        threshold,
        packageId,
        id,
        data: bytes,
      });
      // `key` (the backup symmetric key) is deliberately not destructured —
      // dropping it here ensures it never leaks through this wrapper.
      return encryptedObject;
    },

    /**
     * Decrypt a Seal-encrypted packet using an approved `SessionKey`.
     *
     * @param encryptedObject - BCS-encoded bytes previously returned by
     *   `encryptPacket` (or fetched from Walrus).
     * @param opts.sessionKey - Active session key signed by the landlord's
     *   wallet.
     * @param opts.txBytes - Serialised PTB that calls `seal_approve_packet`
     *   with the correct receipt and mandate objects. Key servers dry-run this
     *   to evaluate the access policy.
     * @returns Plaintext packet bytes.
     */
    async decryptPacket(
      encryptedObject: Uint8Array,
      opts: DecryptOptions,
    ): Promise<Uint8Array> {
      return sealClient.decrypt({
        data: encryptedObject,
        sessionKey: opts.sessionKey,
        txBytes: opts.txBytes,
      });
    },

    /** The underlying SealClient, exposed for advanced use (e.g. fetchKeys). */
    sealClient,
    packageId,
    threshold,
  };
}

export type CasiumSealClient = ReturnType<typeof createSealClient>;
