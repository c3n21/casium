import type { ApplicationReceipt, RentDelegateClient } from "@rentdelegate/sui-client";
import type { VerifyReceiptInput } from "@rentdelegate/shared";
import { ERROR_CODES } from "@rentdelegate/shared";
import type { ErrorCode } from "@rentdelegate/shared";
import type { WalrusAdapter } from "@rentdelegate/walrus";
import { createWalrusAdapter } from "@rentdelegate/walrus";
import type { ReservedApplication } from "./applications.js";

const STATUS_SUBMITTED = 1;

export type BlobVerification = "skipped-mock" | "verified";

export type VerifiedReceipt = {
  receiptId: string;
  txDigest: string;
  mandateId: string;
  listingObjectId: string;
  submittedAtMs: number;
  accessExpiresAtMs: number;
  rawObject: ApplicationReceipt;
  blobVerification: BlobVerification;
};

export type ReceiptVerificationResult =
  | { ok: true; value: VerifiedReceipt }
  | { ok: false; error?: ErrorCode };

export type ReceiptVerificationService = {
  verify(application: ReservedApplication, input: VerifyReceiptInput): Promise<ReceiptVerificationResult>;
};

export function createSuiReceiptVerifier(
  suiClient: Pick<RentDelegateClient, "getReceipt">,
  walrus: WalrusAdapter = createWalrusAdapter(),
): ReceiptVerificationService {
  return {
    async verify(application, input) {
      const receipt = await suiClient.getReceipt(input.receiptId).catch(() => null);

      if (!receipt || !matchesApplication(receipt, application)) {
        return { ok: false };
      }

      const verified: Omit<VerifiedReceipt, "blobVerification"> = {
        receiptId: input.receiptId,
        txDigest: input.txDigest,
        mandateId: receipt.mandateId,
        listingObjectId: receipt.listingId,
        submittedAtMs: receipt.submittedAtMs,
        accessExpiresAtMs: receipt.accessExpiresAtMs,
        rawObject: receipt,
      };

      // Walrus blob check
      const walrusMode = process.env["WALRUS_MODE"] ?? "mock";
      const blobId = application.walrusBlobId;

      // Skip blob verification in mock mode or for mock blob IDs
      if (walrusMode === "mock" || blobId.startsWith("mock:")) {
        return {
          ok: true,
          value: { ...verified, blobVerification: "skipped-mock" },
        };
      }

      // Check blob availability
      const statusResult = await walrus.status(blobId).catch(() => ({ blobId, status: "unknown" as const }));
      if (statusResult.status === "not_found") {
        return { ok: false, error: ERROR_CODES.BLOB_UNAVAILABLE };
      }

      // Download and verify hash — ciphertext is never stored or logged
      const downloaded = await walrus.download(blobId);
      const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        downloaded.buffer instanceof ArrayBuffer
          ? downloaded.buffer
          : new Uint8Array(downloaded).buffer,
      );
      const actualHash =
        "0x" +
        Array.from(new Uint8Array(hashBuffer))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

      if (actualHash !== application.packetHash.toLowerCase()) {
        return { ok: false, error: ERROR_CODES.PACKET_HASH_MISMATCH };
      }

      return {
        ok: true,
        value: { ...verified, blobVerification: "verified" },
      };
    },
  };
}

function matchesApplication(receipt: ApplicationReceipt, application: ReservedApplication) {
  return (
    receipt.mandateId.toLowerCase() === application.mandateId.toLowerCase() &&
    receipt.listingId.toLowerCase() === application.listingObjectId.toLowerCase() &&
    receipt.agent.toLowerCase() === application.agentSuiAddress.toLowerCase() &&
    receipt.provider.toLowerCase() === application.providerSuiAddress.toLowerCase() &&
    receipt.landlord.toLowerCase() === application.landlordSuiAddress.toLowerCase() &&
    bytesToUtf8(receipt.walrusBlobIdBytes) === application.walrusBlobId &&
    bytesToHex(receipt.packetHashBytes) === application.packetHash.toLowerCase() &&
    receipt.status === STATUS_SUBMITTED
  );
}

function bytesToUtf8(bytes: number[]) {
  return new TextDecoder().decode(Uint8Array.from(bytes));
}

function bytesToHex(bytes: number[]) {
  return `0x${bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
