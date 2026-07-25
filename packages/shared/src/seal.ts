/**
 * Seal identity derivation — single authoritative source.
 *
 * Inner identity layout (64 bytes):
 *   bcs(mandate_id)      — 32 raw bytes, fixed-size Sui address/ID in BCS
 *   bcs(listing_id)      — 32 raw bytes, fixed-size Sui address/ID in BCS
 *
 * Seal prepends the package ID to this inner identity automatically when
 * calling SealClient.encrypt / building the seal_approve PTB. The package ID
 * used must be the one that contains seal_approve_packet (i.e. latestPackageId
 * from packages/contracts-config after the RD-133 upgrade, NOT the original).
 *
 * See docs/seal.md for the full design rationale.
 */

/** Expected byte length of a Sui object ID / address in BCS (fixed 32 bytes). */
const SUI_ID_BYTES = 32;

/** Expected hex length of a Sui object ID string, with or without 0x prefix. */
const SUI_ID_HEX_CHARS = SUI_ID_BYTES * 2; // 64 hex chars

/**
 * Convert a hex-encoded Sui object ID to its 32 raw bytes.
 *
 * Accepts both "0x..." and bare hex strings.
 * Pads with leading zeros if the hex is shorter than 64 chars (some IDs are
 * printed without leading zeros in JSON but are still 32 bytes on-chain).
 *
 * @throws if the value is not a valid hex string representable in 32 bytes.
 */
function suiIdToBytes(id: string): Uint8Array {
  const hex = id.startsWith("0x") || id.startsWith("0X") ? id.slice(2) : id;

  if (!/^[0-9a-fA-F]*$/.test(hex)) {
    throw new Error(`deriveSealIdentity: "${id}" is not a valid hex string`);
  }
  if (hex.length > SUI_ID_HEX_CHARS) {
    throw new Error(
      `deriveSealIdentity: "${id}" exceeds 32 bytes (${hex.length} hex chars > ${SUI_ID_HEX_CHARS})`,
    );
  }

  // Left-pad to 64 hex chars so short hex strings still produce 32 bytes.
  const padded = hex.padStart(SUI_ID_HEX_CHARS, "0");

  const bytes = new Uint8Array(SUI_ID_BYTES);
  for (let i = 0; i < SUI_ID_BYTES; i++) {
    bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export interface SealIdentityInput {
  /** Sui object ID of the RentalMandate (hex string, with or without 0x). */
  mandateId: string;
  /** Sui object ID of the RentalListing (hex string, with or without 0x). */
  listingObjectId: string;
}

/**
 * Derive the 64-byte inner Seal identity for a rental application packet.
 *
 * Layout: bcs(mandate_id) || bcs(listing_id)
 *
 * Both fields are fixed-size 32-byte Sui IDs, so no length prefix is needed.
 * The caller must NOT include the package-ID prefix — Seal prepends it.
 *
 * The returned Uint8Array is always 64 bytes.
 */
export function deriveSealIdentity({ mandateId, listingObjectId }: SealIdentityInput): Uint8Array {
  const mandateBytes = suiIdToBytes(mandateId);
  const listingBytes = suiIdToBytes(listingObjectId);

  const identity = new Uint8Array(SUI_ID_BYTES * 2);
  identity.set(mandateBytes, 0);
  identity.set(listingBytes, SUI_ID_BYTES);
  return identity;
}

/**
 * Hex-encode a Uint8Array — inverse of suiIdToBytes, useful for tests and
 * diagnostics. Returns a lowercase hex string without a 0x prefix.
 */
export function identityToHex(identity: Uint8Array): string {
  return Array.from(identity)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
