import { describe, expect, it, vi } from "vitest";
import { ERROR_CODES } from "@casium/shared";
import { createSuiReceiptVerifier } from "./suiVerifier.js";
import type { ReservedApplication } from "./applications.js";
import type { WalrusAdapter } from "@casium/walrus";
import type { ApplicationReceipt } from "@casium/sui-client";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReceipt(overrides: Partial<ApplicationReceipt> = {}): ApplicationReceipt {
  const base: ApplicationReceipt = {
    id: "0xcafe",
    mandateId: "0xmandate",
    listingId: "0xlisting",
    agent: "0xa",
    provider: "0xb",
    landlord: "0xc",
    walrusBlobIdBytes: [...new TextEncoder().encode("mock:testblob")],
    packetHashBytes: [0xbe, 0xef],
    submittedAtMs: 1_784_962_851_988,
    accessExpiresAtMs: 1_790_000_000_000,
    status: 1,
    worldRefHashBytes: [],
  };
  return { ...base, ...overrides };
}

function makeApplication(overrides: Partial<ReservedApplication> = {}): ReservedApplication {
  const base: ReservedApplication = {
    id: "app_1",
    listingId: "listing_1",
    listingObjectId: "0xlisting",
    providerSuiAddress: "0x000000000000000000000000000000000000000000000000000000000000000b",
    landlordSuiAddress: "0x000000000000000000000000000000000000000000000000000000000000000c",
    mandateId: "0xmandate",
    agentSuiAddress: "0x000000000000000000000000000000000000000000000000000000000000000a",
    agentEvmAddress: "0xevmagent",
    humanIdHash: "sha256:human",
    walrusBlobId: "mock:testblob",
    packetHash: "0xbeef",
    status: "reserved",
    idempotencyKey: "key-1",
    submitHint: {
      packageId: null,
      module: "rental",
      function: "submit_application",
      mandateId: "0xmandate",
      listingObjectId: "0xlisting",
      agentSuiAddress: "0xagent",
    },
  };
  return { ...base, ...overrides };
}

function makeVerifyInput() {
  return {
    applicationId: "app_1",
    txDigest: "tx_abc",
    receiptId: "0xcafe",
  };
}

function makeMockSuiClient(receipt: ApplicationReceipt | null) {
  return {
    getReceipt: vi.fn().mockResolvedValue(receipt),
  };
}

function makeMockWalrusAdapter(overrides: Partial<WalrusAdapter> = {}): WalrusAdapter {
  return {
    upload: vi.fn(),
    download: vi.fn(),
    status: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createSuiReceiptVerifier", () => {
  describe("mock mode (WALRUS_MODE=mock)", () => {
    it("skips blob check and records blobVerification=skipped-mock for mock:// blob IDs", async () => {
      const receipt = makeReceipt();
      const application = makeApplication({ walrusBlobId: "mock:testblob" });
      const suiClient = makeMockSuiClient(receipt);
      const walrus = makeMockWalrusAdapter();

      const verifier = createSuiReceiptVerifier(suiClient, walrus);
      const result = await verifier.verify(application, makeVerifyInput());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.blobVerification).toBe("skipped-mock");
      }
      // Walrus adapter must not be called for mock blobs
      expect(walrus.status).not.toHaveBeenCalled();
      expect(walrus.download).not.toHaveBeenCalled();
    });

    it("skips blob check when WALRUS_MODE env is mock (non-mock: blob ID)", async () => {
      vi.stubEnv("WALRUS_MODE", "mock");

      // Use a real-looking blob ID to confirm env check fires first
      const realBlobId = "AbCdEfGh12345678realBlobId";
      const receipt = makeReceipt({
        walrusBlobIdBytes: [...new TextEncoder().encode(realBlobId)],
      });
      const application = makeApplication({
        walrusBlobId: realBlobId,
        packetHash: "0xbeef",
      });
      const suiClient = makeMockSuiClient(receipt);
      const walrus = makeMockWalrusAdapter();

      const verifier = createSuiReceiptVerifier(suiClient, walrus);
      const result = await verifier.verify(application, makeVerifyInput());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.blobVerification).toBe("skipped-mock");
      }
      expect(walrus.status).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
    });
  });

  describe("live mode (WALRUS_MODE=http)", () => {
    const REAL_BLOB_ID = "AbCdEfGh12345678realBlobId";

    function makeReceiptWithRealBlob(): ApplicationReceipt {
      return makeReceipt({
        walrusBlobIdBytes: [...new TextEncoder().encode(REAL_BLOB_ID)],
      });
    }

    async function hashOf(data: Uint8Array): Promise<string> {
      const buf = await crypto.subtle.digest("SHA-256", data);
      return "0x" + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    it("returns BLOB_UNAVAILABLE when blob is not found", async () => {
      vi.stubEnv("WALRUS_MODE", "http");

      const receipt = makeReceiptWithRealBlob();
      const application = makeApplication({ walrusBlobId: REAL_BLOB_ID });
      const suiClient = makeMockSuiClient(receipt);
      const walrus = makeMockWalrusAdapter({
        status: vi.fn().mockResolvedValue({ blobId: REAL_BLOB_ID, status: "not_found" }),
      });

      const verifier = createSuiReceiptVerifier(suiClient, walrus);
      const result = await verifier.verify(application, makeVerifyInput());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(ERROR_CODES.BLOB_UNAVAILABLE);
      }
      expect(walrus.download).not.toHaveBeenCalled();

      vi.unstubAllEnvs();
    });

    it("returns PACKET_HASH_MISMATCH when downloaded hash differs from stored hash", async () => {
      vi.stubEnv("WALRUS_MODE", "http");

      const storedData = new TextEncoder().encode("correct ciphertext");
      const tamperedData = new TextEncoder().encode("tampered ciphertext");
      const storedHash = await hashOf(storedData);
      // Receipt packetHashBytes must decode to storedHash so matchesApplication passes
      const hashBytes = Array.from(Buffer.from(storedHash.replace(/^0x/, ""), "hex"));

      const receipt = makeReceipt({
        walrusBlobIdBytes: [...new TextEncoder().encode(REAL_BLOB_ID)],
        packetHashBytes: hashBytes,
      });
      const application = makeApplication({
        walrusBlobId: REAL_BLOB_ID,
        packetHash: storedHash,
      });
      const suiClient = makeMockSuiClient(receipt);
      const walrus = makeMockWalrusAdapter({
        status: vi.fn().mockResolvedValue({ blobId: REAL_BLOB_ID, status: "stored" }),
        download: vi.fn().mockResolvedValue(tamperedData),
      });

      const verifier = createSuiReceiptVerifier(suiClient, walrus);
      const result = await verifier.verify(application, makeVerifyInput());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(ERROR_CODES.PACKET_HASH_MISMATCH);
      }

      vi.unstubAllEnvs();
    });

    it("verifies and returns blobVerification=verified when hash matches", async () => {
      vi.stubEnv("WALRUS_MODE", "http");

      const ciphertext = new TextEncoder().encode("valid ciphertext bytes");
      const hash = await hashOf(ciphertext);
      // Receipt packetHashBytes must decode to the same hex as `hash`
      const hashBytes = Array.from(
        Buffer.from(hash.replace(/^0x/, ""), "hex"),
      );

      const receipt = makeReceipt({
        walrusBlobIdBytes: [...new TextEncoder().encode(REAL_BLOB_ID)],
        packetHashBytes: hashBytes,
      });
      const application = makeApplication({
        walrusBlobId: REAL_BLOB_ID,
        packetHash: hash,
      });
      const suiClient = makeMockSuiClient(receipt);
      const walrus = makeMockWalrusAdapter({
        status: vi.fn().mockResolvedValue({ blobId: REAL_BLOB_ID, status: "stored" }),
        download: vi.fn().mockResolvedValue(ciphertext),
      });

      const verifier = createSuiReceiptVerifier(suiClient, walrus);
      const result = await verifier.verify(application, makeVerifyInput());

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.blobVerification).toBe("verified");
        expect(result.value.receiptId).toBe("0xcafe");
        expect(result.value.mandateId).toBe("0xmandate");
      }

      vi.unstubAllEnvs();
    });
  });

  it("returns ok=false when on-chain receipt does not match application", async () => {
    const receipt = makeReceipt({ mandateId: "0xwrong" });
    const application = makeApplication();
    const suiClient = makeMockSuiClient(receipt);
    const walrus = makeMockWalrusAdapter();

    const verifier = createSuiReceiptVerifier(suiClient, walrus);
    const result = await verifier.verify(application, makeVerifyInput());

    expect(result.ok).toBe(false);
    expect(walrus.status).not.toHaveBeenCalled();
  });

  it("matches padded and abbreviated Sui addresses", async () => {
    const receipt = makeReceipt({ agent: "0xa", provider: "0xb", landlord: "0xc" });
    const application = makeApplication({
      agentSuiAddress: "0x000000000000000000000000000000000000000000000000000000000000000a",
      providerSuiAddress: "0x000000000000000000000000000000000000000000000000000000000000000b",
      landlordSuiAddress: "0x000000000000000000000000000000000000000000000000000000000000000c",
    });
    const suiClient = makeMockSuiClient(receipt);
    const walrus = makeMockWalrusAdapter();

    const verifier = createSuiReceiptVerifier(suiClient, walrus);
    const result = await verifier.verify(application, makeVerifyInput());

    expect(result.ok).toBe(true);
  });

  it("returns ok=false when getReceipt throws", async () => {
    const suiClient = { getReceipt: vi.fn().mockRejectedValue(new Error("network error")) };
    const walrus = makeMockWalrusAdapter();

    const verifier = createSuiReceiptVerifier(suiClient, walrus);
    const result = await verifier.verify(makeApplication(), makeVerifyInput());

    expect(result.ok).toBe(false);
  });
});
