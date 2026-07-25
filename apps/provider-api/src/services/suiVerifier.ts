import type { ApplicationReceipt, RentDelegateClient } from "@rentdelegate/sui-client";
import type { VerifyReceiptInput } from "@rentdelegate/shared";
import type { ReservedApplication } from "./applications.js";

const STATUS_SUBMITTED = 1;

export type VerifiedReceipt = {
  receiptId: string;
  txDigest: string;
  mandateId: string;
  listingObjectId: string;
  submittedAtMs: number;
  accessExpiresAtMs: number;
  rawObject: ApplicationReceipt;
};

export type ReceiptVerificationResult = { ok: true; value: VerifiedReceipt } | { ok: false };

export type ReceiptVerificationService = {
  verify(application: ReservedApplication, input: VerifyReceiptInput): Promise<ReceiptVerificationResult>;
};

export function createSuiReceiptVerifier(suiClient: Pick<RentDelegateClient, "getReceipt">): ReceiptVerificationService {
  return {
    async verify(application, input) {
      const receipt = await suiClient.getReceipt(input.receiptId).catch(() => null);

      if (!receipt || !matchesApplication(receipt, application)) {
        return { ok: false };
      }

      return {
        ok: true,
        value: {
          receiptId: input.receiptId,
          txDigest: input.txDigest,
          mandateId: receipt.mandateId,
          listingObjectId: receipt.listingId,
          submittedAtMs: receipt.submittedAtMs,
          accessExpiresAtMs: receipt.accessExpiresAtMs,
          rawObject: receipt,
        },
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
