import type { RentDelegateClient } from "@rentdelegate/sui-client";

export type SuiSubmitInput = {
  mandateId: string;
  listingObjectId: string;
  agentCapId: string;
  walrusBlobIdBytes: number[];
  packetHashBytes: number[];
  accessExpiresAtMs: number;
  worldRefHashBytes: number[];
};

export type SuiSubmitResult = {
  txDigest: string;
  receiptId: string | null;
};

/**
 * Submit an application on-chain using the agent's own Sui key.
 * The agent never custodies the renter's wallet — it uses AgentCap.
 *
 * In this implementation we build the PTB and return it serialized.
 * Actual execution requires a signer (separate from the client).
 */
export async function buildSubmitApplicationTx(
  suiClient: RentDelegateClient,
  input: SuiSubmitInput,
) {
  return suiClient.buildSubmitApplicationTx({
    mandateId: input.mandateId,
    listingObjectId: input.listingObjectId,
    agentCapId: input.agentCapId,
    walrusBlobIdBytes: input.walrusBlobIdBytes,
    packetHashBytes: input.packetHashBytes,
    accessExpiresAtMs: input.accessExpiresAtMs,
    worldRefHashBytes: input.worldRefHashBytes,
  });
}

/**
 * Parse the submit_application tx effects to find the ApplicationReceipt object ID.
 * Looks for a created object matching the expected type.
 */
export function parseReceiptIdFromEffects(
  effects: unknown,
  packageId: string,
): string | null {
  if (!effects || typeof effects !== "object") return null;
  const typedEffects = effects as { created?: Array<{ objectId?: string; objectType?: string }> };
  const receiptType = `${packageId}::rental::ApplicationReceipt`;

  const created = typedEffects.created ?? [];
  const receipt = created.find(
    (obj) => typeof obj.objectType === "string" && obj.objectType.startsWith(receiptType),
  );

  return receipt?.objectId ?? null;
}
