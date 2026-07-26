import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { identityToHex, deriveSealIdentity } from "@casium/shared";

// ---------------------------------------------------------------------------
// Mock @mysten/seal before importing the module under test.
// ---------------------------------------------------------------------------
const mockEncrypt = vi.fn();
const mockDecrypt = vi.fn();

vi.mock("@mysten/seal", () => ({
  SealClient: vi.fn().mockImplementation(() => ({
    encrypt: mockEncrypt,
    decrypt: mockDecrypt,
  })),
}));

// Import AFTER mocking so the module under test picks up the mock.
const { createSealClient } = await import("./client.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MANDATE_ID =
  "0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee";
const LISTING_ID =
  "0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a";
const PACKAGE_ID =
  "0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d";

const PLAINTEXT = new Uint8Array([1, 2, 3, 4]);
const ENCRYPTED = new Uint8Array([9, 8, 7, 6]);
const BACKUP_KEY = new Uint8Array([0xff, 0xfe]);

// Fake SuiClient — only the shape matters; SealClient is mocked.
const fakeSuiClient = {} as Parameters<typeof createSealClient>[0]["suiClient"];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("createSealClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  describe("encryptPacket", () => {
    it("calls SealClient.encrypt with the identity derived from mandateId + listingObjectId", async () => {
      mockEncrypt.mockResolvedValue({
        encryptedObject: ENCRYPTED,
        key: BACKUP_KEY,
      });

      const client = createSealClient({
        suiClient: fakeSuiClient,
        packageId: PACKAGE_ID,
        threshold: 2,
      });

      await client.encryptPacket(PLAINTEXT, {
        mandateId: MANDATE_ID,
        listingObjectId: LISTING_ID,
      });

      expect(mockEncrypt).toHaveBeenCalledOnce();
      const callArgs = (mockEncrypt as Mock).mock.calls[0][0] as {
        threshold: number;
        packageId: string;
        id: string;
        data: Uint8Array;
      };

      // The `id` passed to SealClient.encrypt must equal the hex encoding of
      // deriveSealIdentity({ mandateId, listingObjectId }).
      const expectedId = identityToHex(
        deriveSealIdentity({ mandateId: MANDATE_ID, listingObjectId: LISTING_ID }),
      );
      expect(callArgs.id).toBe(expectedId);
      expect(callArgs.packageId).toBe(PACKAGE_ID);
      expect(callArgs.threshold).toBe(2);
      expect(callArgs.data).toEqual(PLAINTEXT);
    });

    it("returns the encryptedObject bytes from SealClient.encrypt", async () => {
      mockEncrypt.mockResolvedValue({
        encryptedObject: ENCRYPTED,
        key: BACKUP_KEY,
      });

      const client = createSealClient({
        suiClient: fakeSuiClient,
        packageId: PACKAGE_ID,
      });

      const result = await client.encryptPacket(PLAINTEXT, {
        mandateId: MANDATE_ID,
        listingObjectId: LISTING_ID,
      });

      expect(result).toEqual(ENCRYPTED);
    });

    it("does NOT return the backup key — only a Uint8Array is returned", async () => {
      mockEncrypt.mockResolvedValue({
        encryptedObject: ENCRYPTED,
        key: BACKUP_KEY,
      });

      const client = createSealClient({
        suiClient: fakeSuiClient,
        packageId: PACKAGE_ID,
      });

      const result = await client.encryptPacket(PLAINTEXT, {
        mandateId: MANDATE_ID,
        listingObjectId: LISTING_ID,
      });

      // The return value must be exactly a Uint8Array (the encrypted object),
      // never an object that exposes `key`.
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).not.toHaveProperty("key");
      // Confirm it's not the backup key itself.
      expect(result).not.toEqual(BACKUP_KEY);
    });

    it("uses DEFAULT_THRESHOLD (2) when no threshold is supplied", async () => {
      mockEncrypt.mockResolvedValue({
        encryptedObject: ENCRYPTED,
        key: BACKUP_KEY,
      });

      const client = createSealClient({
        suiClient: fakeSuiClient,
        packageId: PACKAGE_ID,
        // threshold intentionally omitted
      });

      await client.encryptPacket(PLAINTEXT, {
        mandateId: MANDATE_ID,
        listingObjectId: LISTING_ID,
      });

      const callArgs = (mockEncrypt as Mock).mock.calls[0][0] as {
        threshold: number;
      };
      expect(callArgs.threshold).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  describe("decryptPacket", () => {
    it("calls SealClient.decrypt with data, sessionKey, and txBytes", async () => {
      mockDecrypt.mockResolvedValue(PLAINTEXT);

      const fakeSessionKey = {} as Parameters<
        ReturnType<typeof createSealClient>["decryptPacket"]
      >[1]["sessionKey"];
      const fakeTxBytes = new Uint8Array([0xaa, 0xbb]);

      const client = createSealClient({
        suiClient: fakeSuiClient,
        packageId: PACKAGE_ID,
      });

      const result = await client.decryptPacket(ENCRYPTED, {
        sessionKey: fakeSessionKey,
        txBytes: fakeTxBytes,
      });

      expect(mockDecrypt).toHaveBeenCalledOnce();
      const callArgs = (mockDecrypt as Mock).mock.calls[0][0] as {
        data: Uint8Array;
        sessionKey: unknown;
        txBytes: Uint8Array;
      };
      expect(callArgs.data).toEqual(ENCRYPTED);
      expect(callArgs.sessionKey).toBe(fakeSessionKey);
      expect(callArgs.txBytes).toEqual(fakeTxBytes);

      expect(result).toEqual(PLAINTEXT);
    });
  });

  // -------------------------------------------------------------------------
  describe("identity derivation consistency", () => {
    it("produces identical ids for the same inputs on repeated calls", async () => {
      mockEncrypt.mockResolvedValue({
        encryptedObject: ENCRYPTED,
        key: BACKUP_KEY,
      });

      const client = createSealClient({
        suiClient: fakeSuiClient,
        packageId: PACKAGE_ID,
      });

      await client.encryptPacket(PLAINTEXT, {
        mandateId: MANDATE_ID,
        listingObjectId: LISTING_ID,
      });
      await client.encryptPacket(PLAINTEXT, {
        mandateId: MANDATE_ID,
        listingObjectId: LISTING_ID,
      });

      const id0 = ((mockEncrypt as Mock).mock.calls[0][0] as { id: string }).id;
      const id1 = ((mockEncrypt as Mock).mock.calls[1][0] as { id: string }).id;
      expect(id0).toBe(id1);
    });

    it("produces different ids when mandateId changes", async () => {
      mockEncrypt.mockResolvedValue({
        encryptedObject: ENCRYPTED,
        key: BACKUP_KEY,
      });

      const OTHER_MANDATE =
        "0x16de4b28830417bea4becaa591671ca69024fea9d99d355c9c8784e468dcc454";

      const client = createSealClient({
        suiClient: fakeSuiClient,
        packageId: PACKAGE_ID,
      });

      await client.encryptPacket(PLAINTEXT, {
        mandateId: MANDATE_ID,
        listingObjectId: LISTING_ID,
      });
      await client.encryptPacket(PLAINTEXT, {
        mandateId: OTHER_MANDATE,
        listingObjectId: LISTING_ID,
      });

      const id0 = ((mockEncrypt as Mock).mock.calls[0][0] as { id: string }).id;
      const id1 = ((mockEncrypt as Mock).mock.calls[1][0] as { id: string }).id;
      expect(id0).not.toBe(id1);
    });

    it("produces different ids when listingObjectId changes", async () => {
      mockEncrypt.mockResolvedValue({
        encryptedObject: ENCRYPTED,
        key: BACKUP_KEY,
      });

      const OTHER_LISTING =
        "0xd0f9b4ae975b27d56af6c23844cbfa76dfda81f2913585788c51289ad1f0b3d1";

      const client = createSealClient({
        suiClient: fakeSuiClient,
        packageId: PACKAGE_ID,
      });

      await client.encryptPacket(PLAINTEXT, {
        mandateId: MANDATE_ID,
        listingObjectId: LISTING_ID,
      });
      await client.encryptPacket(PLAINTEXT, {
        mandateId: MANDATE_ID,
        listingObjectId: OTHER_LISTING,
      });

      const id0 = ((mockEncrypt as Mock).mock.calls[0][0] as { id: string }).id;
      const id1 = ((mockEncrypt as Mock).mock.calls[1][0] as { id: string }).id;
      expect(id0).not.toBe(id1);
    });
  });

  // -------------------------------------------------------------------------
  describe("packageId resolution", () => {
    it("exposes the resolved packageId", () => {
      const client = createSealClient({
        suiClient: fakeSuiClient,
        packageId: PACKAGE_ID,
      });
      expect(client.packageId).toBe(PACKAGE_ID);
    });

    it("falls back to env var SEAL_PACKAGE_ID when packageId is omitted", () => {
      const original = process.env["SEAL_PACKAGE_ID"];
      process.env["SEAL_PACKAGE_ID"] = "0xdeadbeef";
      try {
        const client = createSealClient({ suiClient: fakeSuiClient });
        expect(client.packageId).toBe("0xdeadbeef");
      } finally {
        if (original === undefined) {
          delete process.env["SEAL_PACKAGE_ID"];
        } else {
          process.env["SEAL_PACKAGE_ID"] = original;
        }
      }
    });

    it("falls back to SUI_PACKAGE_ID when SEAL_PACKAGE_ID is absent", () => {
      const origSeal = process.env["SEAL_PACKAGE_ID"];
      const origSui = process.env["SUI_PACKAGE_ID"];
      delete process.env["SEAL_PACKAGE_ID"];
      process.env["SUI_PACKAGE_ID"] = "0xcafe";
      try {
        const client = createSealClient({ suiClient: fakeSuiClient });
        expect(client.packageId).toBe("0xcafe");
      } finally {
        if (origSeal === undefined) delete process.env["SEAL_PACKAGE_ID"];
        else process.env["SEAL_PACKAGE_ID"] = origSeal;
        if (origSui === undefined) delete process.env["SUI_PACKAGE_ID"];
        else process.env["SUI_PACKAGE_ID"] = origSui;
      }
    });
  });
});
