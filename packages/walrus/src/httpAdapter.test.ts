import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWalrusHttpAdapter } from "./httpAdapter.js";

// Minimal fetch mock helpers
function mockFetch(response: {
  ok: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}) {
  return vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: response.json ?? (() => Promise.resolve({})),
    text: response.text ?? (() => Promise.resolve("")),
    arrayBuffer: response.arrayBuffer ?? (() => Promise.resolve(new ArrayBuffer(0))),
  });
}

describe("createWalrusHttpAdapter", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // --- upload ---

  describe("upload", () => {
    it("calls PUT /v1/blobs?epochs=N with correct URL and body", async () => {
      const blobId = "test-blob-id-abc";
      const fetchMock = mockFetch({
        ok: true,
        json: () => Promise.resolve({ newlyCreated: { blobObject: { blobId } } }),
      });
      globalThis.fetch = fetchMock;

      const adapter = createWalrusHttpAdapter({
        publisherUrl: "https://publisher.example.com",
        aggregatorUrl: "https://aggregator.example.com",
        epochs: 3,
      });

      const bytes = new TextEncoder().encode("hello walrus");
      await adapter.upload(bytes);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://publisher.example.com/v1/blobs?epochs=3");
      expect(init.method).toBe("PUT");
      expect(init.body).toBe(bytes);
      expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/octet-stream");
    });

    it("extracts blobId from newlyCreated.blobObject path", async () => {
      const blobId = "newly-created-blob";
      globalThis.fetch = mockFetch({
        ok: true,
        json: () => Promise.resolve({ newlyCreated: { blobObject: { blobId } } }),
      });

      const adapter = createWalrusHttpAdapter({ publisherUrl: "https://p.example.com" });
      const result = await adapter.upload(new Uint8Array([1, 2, 3]));

      expect(result.blobId).toBe(blobId);
      expect(result.storage).toBe("walrus");
      expect(result.size).toBe(3);
    });

    it("extracts blobId from alreadyCertified path", async () => {
      const blobId = "already-certified-blob";
      globalThis.fetch = mockFetch({
        ok: true,
        json: () => Promise.resolve({ alreadyCertified: { blobId } }),
      });

      const adapter = createWalrusHttpAdapter({ publisherUrl: "https://p.example.com" });
      const result = await adapter.upload(new Uint8Array([4, 5, 6]));

      expect(result.blobId).toBe(blobId);
      expect(result.storage).toBe("walrus");
    });

    it("throws on non-2xx upload response", async () => {
      globalThis.fetch = mockFetch({
        ok: false,
        status: 503,
        text: () => Promise.resolve("Service Unavailable"),
      });

      const adapter = createWalrusHttpAdapter({ publisherUrl: "https://p.example.com" });
      await expect(adapter.upload(new Uint8Array([1]))).rejects.toThrow("Walrus upload failed: 503");
    });

    it("throws if response has no blobId", async () => {
      globalThis.fetch = mockFetch({
        ok: true,
        json: () => Promise.resolve({ something: "unexpected" }),
      });

      const adapter = createWalrusHttpAdapter({ publisherUrl: "https://p.example.com" });
      await expect(adapter.upload(new Uint8Array([1]))).rejects.toThrow("no blobId");
    });
  });

  // --- download ---

  describe("download", () => {
    it("calls GET /v1/blobs/{blobId} and returns bytes", async () => {
      const data = new Uint8Array([10, 20, 30, 40]);
      const buf = data.buffer as ArrayBuffer;
      globalThis.fetch = mockFetch({
        ok: true,
        arrayBuffer: () => Promise.resolve(buf),
      });

      const adapter = createWalrusHttpAdapter({
        aggregatorUrl: "https://agg.example.com",
      });
      const result = await adapter.download("my-blob-id");

      expect(result).toEqual(data);
    });

    it("throws on non-2xx download response", async () => {
      globalThis.fetch = mockFetch({ ok: false, status: 404 });

      const adapter = createWalrusHttpAdapter({ aggregatorUrl: "https://agg.example.com" });
      await expect(adapter.download("missing-blob")).rejects.toThrow("Walrus download failed: 404");
    });
  });

  // --- status ---

  describe("status", () => {
    it("returns 'stored' for 200 HEAD response", async () => {
      globalThis.fetch = mockFetch({ ok: true, status: 200 });

      const adapter = createWalrusHttpAdapter({ aggregatorUrl: "https://agg.example.com" });
      const result = await adapter.status("blob-123");

      expect(result).toEqual({ blobId: "blob-123", status: "stored" });
    });

    it("returns 'not_found' for 404 HEAD response", async () => {
      globalThis.fetch = mockFetch({ ok: false, status: 404 });

      const adapter = createWalrusHttpAdapter({ aggregatorUrl: "https://agg.example.com" });
      const result = await adapter.status("blob-missing");

      expect(result).toEqual({ blobId: "blob-missing", status: "not_found" });
    });

    it("returns 'unknown' for other non-2xx responses", async () => {
      globalThis.fetch = mockFetch({ ok: false, status: 500 });

      const adapter = createWalrusHttpAdapter({ aggregatorUrl: "https://agg.example.com" });
      const result = await adapter.status("blob-err");

      expect(result).toEqual({ blobId: "blob-err", status: "unknown" });
    });

    it("returns 'unknown' when fetch throws", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));

      const adapter = createWalrusHttpAdapter({ aggregatorUrl: "https://agg.example.com" });
      const result = await adapter.status("blob-net-err");

      expect(result).toEqual({ blobId: "blob-net-err", status: "unknown" });
    });
  });
});
