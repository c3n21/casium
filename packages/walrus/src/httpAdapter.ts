import type { WalrusAdapter, WalrusBlobStatus } from "./adapter.js";

export type WalrusHttpAdapterOptions = {
  publisherUrl?: string;
  aggregatorUrl?: string;
  epochs?: number;
};

// Default Walrus testnet endpoints
const DEFAULT_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
const DEFAULT_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

export function createWalrusHttpAdapter(options: WalrusHttpAdapterOptions = {}): WalrusAdapter {
  const publisherUrl = options.publisherUrl ?? process.env["WALRUS_PUBLISHER_URL"] ?? DEFAULT_PUBLISHER;
  const aggregatorUrl = options.aggregatorUrl ?? process.env["WALRUS_AGGREGATOR_URL"] ?? DEFAULT_AGGREGATOR;
  const epochs = options.epochs ?? Number(process.env["WALRUS_EPOCHS"] ?? 5);

  return {
    async upload(bytes: Uint8Array) {
      // PUT /v1/blobs?epochs=N
      const response = await fetch(`${publisherUrl}/v1/blobs?epochs=${epochs}`, {
        method: "PUT",
        body: bytes as unknown as BodyInit,
        headers: { "Content-Type": "application/octet-stream" },
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Walrus upload failed: ${response.status} ${text}`);
      }
      const result = (await response.json()) as Record<string, unknown>;
      // Response has either { newlyCreated: { blobObject: { blobId } } } or { alreadyCertified: { blobId } }
      const blobId = extractBlobId(result);
      if (!blobId) throw new Error(`Walrus upload response has no blobId: ${JSON.stringify(result)}`);
      return { blobId, size: bytes.byteLength, storage: "walrus" as const };
    },
    async download(blobId: string) {
      // GET /v1/blobs/{blobId}
      const response = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`);
      if (!response.ok) {
        throw new Error(`Walrus download failed: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      return new Uint8Array(buffer);
    },
    async status(blobId: string) {
      // HEAD /v1/blobs/{blobId} to check existence
      try {
        const response = await fetch(`${aggregatorUrl}/v1/blobs/${blobId}`, { method: "HEAD" });
        if (response.ok) return { blobId, status: "stored" as WalrusBlobStatus };
        if (response.status === 404) return { blobId, status: "not_found" as WalrusBlobStatus };
        return { blobId, status: "unknown" as WalrusBlobStatus };
      } catch {
        return { blobId, status: "unknown" as WalrusBlobStatus };
      }
    },
    async extend(blobId: string, epochs: number): Promise<void> {
      // Walrus HTTP API does not currently support extension via publisher.
      // Use CLI: walrus extend --blob-id <id> --epochs <n>
      throw new Error(
        `Blob extension via HTTP adapter not supported. Use CLI: walrus extend --blob-id ${blobId} --epochs ${epochs}`,
      );
    },
  };
}

function extractBlobId(result: Record<string, unknown>): string | null {
  // newlyCreated path
  const nc = result["newlyCreated"] as Record<string, unknown> | undefined;
  if (nc) {
    const bo = nc["blobObject"] as Record<string, unknown> | undefined;
    if (bo && typeof bo["blobId"] === "string") return bo["blobId"];
    if (typeof nc["blobId"] === "string") return nc["blobId"];
  }
  // alreadyCertified path
  const ac = result["alreadyCertified"] as Record<string, unknown> | undefined;
  if (ac && typeof ac["blobId"] === "string") return ac["blobId"];
  // Direct blobId
  if (typeof result["blobId"] === "string") return result["blobId"];
  return null;
}
