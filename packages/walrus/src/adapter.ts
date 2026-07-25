export type WalrusBlobStatus = "stored" | "not_found" | "unknown";

export type WalrusUploadResult = {
  blobId: string;
  size: number;
  storage: "mock" | "walrus";
};

export type WalrusStatusResult = {
  blobId: string;
  status: WalrusBlobStatus;
  expiresAtMs?: number; // undefined if unknown
  raw?: unknown;
};

export type WalrusAdapter = {
  upload(bytes: Uint8Array): Promise<WalrusUploadResult>;
  download(blobId: string): Promise<Uint8Array>;
  status(blobId: string): Promise<WalrusStatusResult>;
  extend?(blobId: string, epochs: number): Promise<void>; // optional
};

export type WalrusAdapterMode = "mock" | "http" | "cli" | "real";

/** Walrus testnet epoch duration in milliseconds (approximately 1 day = 86400000 ms) */
export const WALRUS_EPOCH_DURATION_MS = 86_400_000;

/**
 * Compute the minimum number of Walrus epochs needed to cover a given access window.
 * Always rounds up. Adds 1 extra epoch as a safety buffer.
 */
export function epochsForAccessWindow(accessExpiresAtMs: number, now = Date.now()): number {
  const durationMs = accessExpiresAtMs - now;
  if (durationMs <= 0) throw new Error("Access window already expired");
  const epochs = Math.ceil(durationMs / WALRUS_EPOCH_DURATION_MS) + 1; // +1 buffer
  return Math.max(epochs, 1);
}

/**
 * Compute access_expires_at_ms from a desired epoch count and current time.
 * Useful for display: "this blob expires in N epochs ≈ X days".
 */
export function accessExpiryFromEpochs(epochs: number, now = Date.now()): number {
  return now + (epochs - 1) * WALRUS_EPOCH_DURATION_MS; // -1 for buffer
}

/**
 * Check whether the blob's stored lifetime covers the access window.
 * Returns true if blob expires after access window, false if not.
 */
export function blobCoversAccessWindow(
  blobEpochs: number,
  accessExpiresAtMs: number,
  now = Date.now(),
): boolean {
  const blobExpiresMs = now + blobEpochs * WALRUS_EPOCH_DURATION_MS;
  return blobExpiresMs >= accessExpiresAtMs;
}
