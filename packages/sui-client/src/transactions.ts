import { Transaction } from "@mysten/sui/transactions";
import type {
  CreateListingInput,
  CreateMandateInput,
  RentDelegateConfig,
  RevokeMandateInput,
  SubmitApplicationInput,
  WithdrawApplicationInput,
} from "./types.js";

const CLOCK_OBJECT_ID = "0x6";

export function buildCreateMandateTx(config: RentDelegateConfig, input: CreateMandateInput): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target(config, "create_mandate"),
    arguments: [
      tx.pure.address(input.agentSuiAddress),
      tx.pure.vector("u8", input.agentEvmAddressBytes),
      tx.pure.u64(input.maxMonthlyRentEur),
      tx.pure.vector("u64", input.allowedMunicipalities),
      tx.pure.u64(input.minBedrooms),
      tx.pure.u64(input.expiresAtMs),
      tx.pure.u64(input.remainingApplications),
      tx.pure.u64(input.permittedActions),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function buildCreateListingTx(config: RentDelegateConfig, input: CreateListingInput): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target(config, "create_listing"),
    arguments: [
      tx.pure.vector("u8", input.externalListingIdBytes),
      tx.pure.address(input.landlordSuiAddress),
      tx.pure.u64(input.municipality),
      tx.pure.u64(input.monthlyRentEur),
      tx.pure.u64(input.bedrooms),
      tx.pure.bool(input.active),
      tx.pure.u64(input.expiresAtMs),
      tx.pure.vector("u8", input.metadataRefBytes),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function buildSubmitApplicationTx(config: RentDelegateConfig, input: SubmitApplicationInput): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target(config, "submit_application"),
    arguments: [
      tx.object(input.mandateId),
      tx.object(input.listingObjectId),
      tx.object(input.agentCapId),
      tx.pure.vector("u8", input.walrusBlobIdBytes),
      tx.pure.vector("u8", input.packetHashBytes),
      tx.pure.u64(input.accessExpiresAtMs),
      tx.pure.vector("u8", input.worldRefHashBytes),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function buildRevokeMandateTx(config: RentDelegateConfig, input: RevokeMandateInput): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target(config, "revoke_mandate"),
    arguments: [tx.object(input.mandateId), tx.object(input.ownerCapId)],
  });
  return tx;
}

export function buildWithdrawApplicationTx(config: RentDelegateConfig, input: WithdrawApplicationInput): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: target(config, "withdraw_application"),
    arguments: [tx.object(input.mandateId), tx.object(input.receiptId), tx.object(input.ownerCapId)],
  });
  return tx;
}

function target(config: RentDelegateConfig, functionName: string): `${string}::rental::${string}` {
  return `${config.packageId}::rental::${functionName}`;
}
