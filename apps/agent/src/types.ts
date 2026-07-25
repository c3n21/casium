export type ReservedApplication = {
  id: string;
  listingId: string;
  listingObjectId: string;
  mandateId: string;
  agentSuiAddress: string;
  agentEvmAddress: string;
  humanIdHash: string;
  walrusBlobId: string;
  packetHash: string;
  status: "reserved" | "accepted";
  idempotencyKey: string;
  submitHint: {
    packageId: string | null;
    module: "rental";
    function: "submit_application";
    mandateId: string;
    listingObjectId: string;
    agentSuiAddress: string;
  };
  receipt?: {
    receiptId: string;
    txDigest: string;
  };
};
