import type { RentDelegateClient } from "@rentdelegate/sui-client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { ClientWithCoreApi, SuiClientTypes } from "@mysten/sui/client";

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

export type ExecuteSubmitApplicationOptions = {
  suiClient: RentDelegateClient;
  executionClient: ClientWithCoreApi;
  packageId: string;
  expectedAgentSuiAddress: string;
  privateKey: string;
  input: SuiSubmitInput;
};

/**
 * Submit an application on-chain using the agent's own Sui key.
 * The agent never custodies the renter's wallet — it uses AgentCap.
 *
 * This remains useful for dry runs and for the no-private-key CLI fallback.
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

export async function executeSubmitApplication(
  options: ExecuteSubmitApplicationOptions,
): Promise<SuiSubmitResult> {
  const keypair = keypairFromPrivateKey(options.privateKey);
  const signerAddress = normalizeAddress(keypair.toSuiAddress());
  const expectedAddress = normalizeAddress(options.expectedAgentSuiAddress);

  if (signerAddress !== expectedAddress) {
    throw new Error(
      `Agent Sui key address mismatch: derived ${keypair.toSuiAddress()}, expected ${options.expectedAgentSuiAddress}`,
    );
  }

  const tx = await buildSubmitApplicationTx(options.suiClient, options.input);
  const result = await options.executionClient.core.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    include: { effects: true, events: true },
  });

  if (result.$kind === "FailedTransaction" || !result.Transaction.status.success) {
    const failed = result.$kind === "FailedTransaction" ? result.FailedTransaction : result.Transaction;
    throw new Error(`Sui submit_application failed: ${failed.status.error?.message ?? "unknown execution error"}`);
  }

  const receiptId = parseReceiptIdFromTransaction(result.Transaction, options.packageId);
  return { txDigest: result.Transaction.digest, receiptId };
}

export function keypairFromPrivateKey(privateKey: string): Ed25519Keypair {
  const trimmed = privateKey.trim();
  if (!trimmed) throw new Error("Missing agent Sui private key");

  if (trimmed.startsWith("suiprivkey")) {
    return Ed25519Keypair.fromSecretKey(trimmed);
  }

  const bytes = Uint8Array.from(Buffer.from(trimmed, "base64"));
  return Ed25519Keypair.fromSecretKey(bytes);
}

export function parseReceiptIdFromTransaction(
  transaction: Pick<SuiClientTypes.Transaction<{ events: true; effects: true }>, "events" | "effects">,
  packageId: string,
): string | null {
  const fromEvents = parseReceiptIdFromEvents(transaction.events, packageId);
  if (fromEvents) return fromEvents;
  return parseReceiptIdFromEffects(transaction.effects, packageId);
}

export function parseReceiptIdFromEvents(events: unknown, packageId: string): string | null {
  if (!Array.isArray(events)) return null;

  const submittedType = `${packageId}::rental::ApplicationSubmitted`;
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const typedEvent = event as { eventType?: string; contents?: { json?: unknown }; parsedJson?: unknown };
    if (typedEvent.eventType !== submittedType) continue;

    const json = typedEvent.contents?.json ?? typedEvent.parsedJson;
    const receiptId = receiptIdFromJson(json);
    if (receiptId) return receiptId;
  }

  return null;
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
  const typedEffects = effects as {
    created?: Array<{ objectId?: string; objectType?: string }>;
    changedObjects?: Array<{ objectId?: string; objectType?: string; idOperation?: string }>;
  };
  const receiptType = `${packageId}::rental::ApplicationReceipt`;

  const created = typedEffects.created ?? [];
  const receipt = created.find(
    (obj) => typeof obj.objectType === "string" && obj.objectType.startsWith(receiptType),
  );

  if (receipt?.objectId) return receipt.objectId;

  const changedReceipt = (typedEffects.changedObjects ?? []).find(
    (obj) => obj.idOperation === "Created" && typeof obj.objectType === "string" && obj.objectType.startsWith(receiptType),
  );

  return changedReceipt?.objectId ?? null;
}

function receiptIdFromJson(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const value = (json as { receipt_id?: unknown }).receipt_id;
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}
