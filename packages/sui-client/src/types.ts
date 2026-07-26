import type { Transaction } from "@mysten/sui/transactions";

export type CasiumConfig = {
  network: "testnet" | "localnet";
  rpcUrl: string;
  packageId: string;
};

export type CreateMandateInput = {
  agentSuiAddress: string;
  agentEvmAddressBytes: number[];
  maxMonthlyRentEur: number;
  allowedMunicipalities: number[];
  minBedrooms: number;
  expiresAtMs: number;
  remainingApplications: number;
  permittedActions: number;
};

export type CreateListingInput = {
  externalListingIdBytes: number[];
  landlordSuiAddress: string;
  municipality: number;
  monthlyRentEur: number;
  bedrooms: number;
  active: boolean;
  expiresAtMs: number;
  metadataRefBytes: number[];
};

export type SubmitApplicationInput = {
  mandateId: string;
  listingObjectId: string;
  agentCapId: string;
  walrusBlobIdBytes: number[];
  packetHashBytes: number[];
  accessExpiresAtMs: number;
  worldRefHashBytes: number[];
};

export type RevokeMandateInput = {
  mandateId: string;
  ownerCapId: string;
};

export type WithdrawApplicationInput = {
  mandateId: string;
  receiptId: string;
  ownerCapId: string;
};

export type RentalMandate = {
  id: string;
  owner: string;
  agentSui: string;
  /** Lowercase 0x-prefixed EVM address, or null when the on-chain vector is empty. */
  agentEvm: string | null;
  maxMonthlyRentEur: number;
  allowedMunicipalities: number[];
  minBedrooms: number;
  expiresAtMs: number;
  remainingApplications: number;
  revoked: boolean;
  permittedActions: number;
};

export type RentalListing = {
  id: string;
  provider: string;
  landlord: string;
  municipality: number;
  monthlyRentEur: number;
  bedrooms: number;
  active: boolean;
  expiresAtMs: number;
};

export type ApplicationReceipt = {
  id: string;
  mandateId: string;
  listingId: string;
  agent: string;
  provider: string;
  landlord: string;
  walrusBlobIdBytes: number[];
  packetHashBytes: number[];
  submittedAtMs: number;
  accessExpiresAtMs: number;
  status: number;
  worldRefHashBytes: number[];
};

export type CasiumClient = {
  getMandate(id: string): Promise<RentalMandate>;
  getListing(id: string): Promise<RentalListing>;
  getReceipt(id: string): Promise<ApplicationReceipt>;
  findAgentCapForMandate(mandateId: string, agentSuiAddress: string): Promise<string | null>;
  buildCreateMandateTx(input: CreateMandateInput): Transaction;
  buildCreateListingTx(input: CreateListingInput): Transaction;
  buildSubmitApplicationTx(input: SubmitApplicationInput): Transaction;
  buildRevokeMandateTx(input: RevokeMandateInput): Transaction;
  buildWithdrawApplicationTx(input: WithdrawApplicationInput): Transaction;
};
