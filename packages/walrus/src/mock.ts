import { createHash } from "node:crypto";
import type { WalrusAdapter } from "./adapter.js";

export function createMockWalrusAdapter(seed = new Map<string, Uint8Array>()): WalrusAdapter {
  const blobs = new Map(seed);

  return {
    async upload(bytes) {
      const copy = Uint8Array.from(bytes);
      const digest = createHash("sha256").update(copy).digest("hex");
      const blobId = `mock:${digest}`;
      blobs.set(blobId, copy);
      return { blobId, size: copy.byteLength, storage: "mock" };
    },
    async download(blobId) {
      const blob = blobs.get(blobId);
      if (!blob) throw new Error(`Mock Walrus blob not found: ${blobId}`);
      return Uint8Array.from(blob);
    },
    async status(blobId) {
      return { blobId, status: blobs.has(blobId) ? "stored" : "not_found" };
    },
  };
}
