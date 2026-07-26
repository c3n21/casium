import type { CasiumClient } from "@casium/sui-client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { ClientWithCoreApi, SuiClientTypes } from "@mysten/sui/client";

const SUBMIT_APPLICATION_GAS_BUDGET_MIST = 100_000_000n;
const SUI_COIN_TYPE = "0x2::sui::SUI";

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
  suiClient: CasiumClient;
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
  suiClient: CasiumClient,
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
  const gasCoin = await selectGasCoin(options.executionClient, keypair.toSuiAddress());
  tx.setGasBudget(SUBMIT_APPLICATION_GAS_BUDGET_MIST);
  tx.setGasPayment([gasCoin]);

  const result = await options.executionClient.core.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    // objectTypes is required: effects.changedObjects carries no type, only the
    // separate objectTypes map can identify the created ApplicationReceipt.
    include: { effects: true, events: true, objectTypes: true },
  });

  if (result.$kind === "FailedTransaction" || !result.Transaction.status.success) {
    const failed = result.$kind === "FailedTransaction" ? result.FailedTransaction : result.Transaction;
    throw new Error(`Sui submit_application failed: ${failed.status.error?.message ?? "unknown execution error"}`);
  }

  const receiptId = parseReceiptIdFromTransaction(result.Transaction, options.packageId);
  return { txDigest: result.Transaction.digest, receiptId };
}

async function selectGasCoin(executionClient: ClientWithCoreApi, owner: string) {
  const coins = await executionClient.core.listCoins({ owner, coinType: SUI_COIN_TYPE });
  const sorted = coins.objects
    .map((coin) => ({ ...coin, balanceMist: BigInt(coin.balance) }))
    .filter((coin) => coin.balanceMist >= SUBMIT_APPLICATION_GAS_BUDGET_MIST)
    .sort((a, b) => Number(b.balanceMist - a.balanceMist));

  const coin = sorted[0];
  if (!coin) {
    throw new Error(
      `No SUI gas coin with at least ${SUBMIT_APPLICATION_GAS_BUDGET_MIST} MIST found for agent ${owner}`,
    );
  }

  return {
    objectId: coin.objectId,
    version: coin.version,
    digest: coin.digest,
  };
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
  transaction: Pick<
    SuiClientTypes.Transaction<{ events: true; effects: true; objectTypes: true }>,
    "events" | "effects" | "objectTypes"
  >,
  packageId: string,
): string | null {
  const fromEvents = parseReceiptIdFromEvents(transaction.events, packageId);
  if (fromEvents) return fromEvents;
  return parseReceiptIdFromEffects(transaction.effects, packageId, transaction.objectTypes);
}

export function parseReceiptIdFromEvents(events: unknown, packageId: string): string | null {
  if (!Array.isArray(events)) return null;

  const submittedType = `${packageId}::rental::ApplicationSubmitted`;
  for (const event of events) {
    if (!event || typeof event !== "object") continue;
    const typedEvent = event as {
      eventType?: string;
      json?: unknown;
      contents?: { json?: unknown };
      parsedJson?: unknown;
    };
    if (typedEvent.eventType !== submittedType) continue;

    // gRPC exposes the parsed payload as `json`; the other keys cover JSON-RPC-shaped clients.
    const json = typedEvent.json ?? typedEvent.contents?.json ?? typedEvent.parsedJson;
    const receiptId = receiptIdFromJson(json);
    if (receiptId) return receiptId;
  }

  return null;
}

/**
 * Parse the submit_application tx effects to find the ApplicationReceipt object ID.
 *
 * gRPC `effects.changedObjects` entries have no `objectType`, so the created object's
 * type is resolved through the transaction-level `objectTypes` map (requires
 * `include: { objectTypes: true }`). The inline-`objectType` branches keep older
 * JSON-RPC-shaped effects working.
 */
export function parseReceiptIdFromEffects(
  effects: unknown,
  packageId: string,
  objectTypes?: Record<string, string> | null,
): string | null {
  if (!effects || typeof effects !== "object") return null;
  const typedEffects = effects as {
    created?: Array<{ objectId?: string; objectType?: string }>;
    changedObjects?: Array<{ objectId?: string; objectType?: string; idOperation?: string }>;
  };
  const receiptType = `${packageId}::rental::ApplicationReceipt`;
  const isReceiptType = (type: unknown) => typeof type === "string" && type.startsWith(receiptType);
  const typeOf = (objectId: string | undefined, objectType: string | undefined) =>
    objectType ?? (objectId ? objectTypes?.[objectId] : undefined);

  const created = typedEffects.created ?? [];
  const receipt = created.find((obj) => isReceiptType(typeOf(obj.objectId, obj.objectType)));

  if (receipt?.objectId) return receipt.objectId;

  const changedReceipt = (typedEffects.changedObjects ?? []).find(
    (obj) => obj.idOperation === "Created" && isReceiptType(typeOf(obj.objectId, obj.objectType)),
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
