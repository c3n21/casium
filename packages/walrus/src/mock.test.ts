import { describe, expect, it } from "vitest";
import { createMockWalrusAdapter } from "./mock.js";

describe("mock Walrus adapter", () => {
  it("round-trips bytes with mock-prefixed blob IDs", async () => {
    const adapter = createMockWalrusAdapter();
    const bytes = new TextEncoder().encode("synthetic encrypted packet");

    const uploaded = await adapter.upload(bytes);

    expect(uploaded.blobId).toMatch(/^mock:/);
    expect(uploaded.storage).toBe("mock");
    await expect(adapter.status(uploaded.blobId)).resolves.toMatchObject({ status: "stored" });
    await expect(adapter.download(uploaded.blobId)).resolves.toEqual(bytes);
  });

  it("reports missing mock blobs", async () => {
    const adapter = createMockWalrusAdapter();
    await expect(adapter.status("mock:missing")).resolves.toMatchObject({ status: "not_found" });
    await expect(adapter.download("mock:missing")).rejects.toThrow("Mock Walrus blob not found");
  });
});
