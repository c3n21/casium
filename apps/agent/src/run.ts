/**
 * runAgent — reusable pipeline that submits a rental application on behalf of a mandate.
 *
 * Extracted from index.ts so it can be driven by the CLI (index.ts) and the HTTP server
 * (server.ts) without duplicating logic.
 */

import { createRentDelegateClient } from "@rentdelegate/sui-client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { DEMO_LISTING_OBJECT_ID } from "@rentdelegate/contracts-config";
import { evaluateEligibility } from "./rules.js";
import { createProviderClient } from "./providerClient.js";
import type { DemoAgentKitHeaders } from "./providerClient.js";
import { executeSubmitApplication } from "./suiSubmit.js";
import {
  blobCoversAccessWindow,
  epochsForAccessWindow,
  WALRUS_EPOCH_DURATION_MS,
} from "@rentdelegate/walrus";

// Provider-side listing ID used for the demo listing. The provider API stores listings
// under its own internal keys; this one maps to DEMO_LISTING_OBJECT_ID.
const DEMO_PROVIDER_LISTING_ID = "listing_lisbon_eligible";

export type RunInput = {
  mandateId: string;
  /** Sui object ID of the listing to apply for. Defaults to the demo listing. */
  listingObjectId: string | undefined;
  agentSuiAddress: string;
  agentEvmAddress: string;
  /** If provided, skip AgentCap discovery and use this ID directly. */
  agentCapId: string | undefined;
  privateKey: string | undefined;
  packageId: string;
  rpcUrl: string;
  providerApiBase: string;
  demoAgentKitHeaders: DemoAgentKitHeaders | undefined;
  agentkitHeader: string | undefined;
};

export type RunStage =
  | "loading-mandate"
  | "evaluating"
  | "uploading"
  | "reserving"
  | "submitting"
  | "verifying"
  | "complete";

export type RunProgress = {
  stage: RunStage;
  runId: string;
};

export type RunResult = {
  runId: string;
  mandateId: string;
  applicationId?: string;
  txDigest?: string;
  receiptId?: string;
  blobId?: string;
  status: "complete" | "ineligible" | "failed";
  reason?: string;
  error?: string;
};

export async function runAgent(
  input: RunInput,
  onProgress?: (progress: RunProgress) => void,
): Promise<RunResult> {
  const runId = crypto.randomUUID();

  const report = (stage: RunStage) => onProgress?.({ stage, runId });

  const {
    mandateId,
    agentSuiAddress,
    agentEvmAddress,
    packageId,
    rpcUrl,
    providerApiBase,
    demoAgentKitHeaders,
    agentkitHeader,
  } = input;

  const listingObjectId = input.listingObjectId ?? DEMO_LISTING_OBJECT_ID;
  // Use the listing's Sui object ID as provider listing ID unless it's the demo listing,
  // in which case use the well-known provider-side key.
  const providerListingId =
    listingObjectId === DEMO_LISTING_OBJECT_ID ? DEMO_PROVIDER_LISTING_ID : listingObjectId;

  const suiClient = createRentDelegateClient({
    network: "testnet",
    rpcUrl,
    packageId,
  });
  const executionClient = new SuiGrpcClient({ network: "testnet", baseUrl: rpcUrl });
  const provider = createProviderClient({
    baseUrl: providerApiBase,
    ...(agentkitHeader ? { agentkitHeader } : {}),
    ...(demoAgentKitHeaders ? { demoAgentKitHeaders } : {}),
  });

  // 1. Discover AgentCap
  let agentCapId: string;
  if (input.agentCapId) {
    agentCapId = input.agentCapId;
  } else {
    const discovered = await suiClient.findAgentCapForMandate(mandateId, agentSuiAddress);
    if (!discovered) {
      throw new Error(`No AgentCap found for mandate ${mandateId} owned by ${agentSuiAddress}`);
    }
    agentCapId = discovered;
  }

  // 2. Load mandate
  report("loading-mandate");
  const mandate = await suiClient.getMandate(mandateId);

  if (mandate.revoked) {
    return {
      runId,
      mandateId,
      status: "ineligible",
      reason: "Mandate is revoked",
    };
  }

  // 3. Evaluate listing
  report("evaluating");
  const listing = await suiClient.getListing(listingObjectId);
  const eligibility = evaluateEligibility(mandate, listing);

  if (!eligibility.eligible) {
    return {
      runId,
      mandateId,
      status: "ineligible",
      reason: eligibility.reason,
    };
  }

  // 4. Read renter packet from provider
  report("uploading");
  console.log("\n[3] Reading renter packet from provider...");
  const packetRecord = await provider.getPacketForMandate(mandateId);
  if (!packetRecord) {
    throw new Error(
      `No packet registered for mandate ${mandateId}. The renter must build and upload a packet first.`,
    );
  }
  const blobId = packetRecord.walrusBlobId;
  const packetHashHex = packetRecord.packetHash;
  console.log(`    Blob ID: ${blobId}`);
  console.log(`    Hash:    ${packetHashHex}`);

  // Convert blob ID to bytes for the PTB
  const blobIdBytes = Array.from(new TextEncoder().encode(blobId));
  // Convert packet hash hex (0x-prefixed or plain) to bytes for the PTB
  const hexStr = packetHashHex.replace(/^0x/, "");
  const packetHashBytes: number[] = [];
  for (let i = 0; i < hexStr.length; i += 2) {
    packetHashBytes.push(parseInt(hexStr.slice(i, i + 2), 16));
  }

  // 5. Reserve with provider API
  report("reserving");

  // Desired access window: 30 days
  const accessExpiresAtMs = Date.now() + 30 * 24 * 60 * 60 * 1000;

  // Blob lifecycle alignment check (RD-124):
  // Skip for mock blobs (they don't expire). For real blobs, verify the configured
  // epoch count covers the access window before spending gas.
  const isMockBlob = blobId.startsWith("mock:");
  if (!isMockBlob) {
    const configuredEpochs = Number(process.env["WALRUS_EPOCHS"] ?? 5);
    if (!blobCoversAccessWindow(configuredEpochs, accessExpiresAtMs)) {
      const requiredEpochs = epochsForAccessWindow(accessExpiresAtMs);
      const blobDays = configuredEpochs * (WALRUS_EPOCH_DURATION_MS / 86_400_000);
      throw new Error(
        `Blob lifecycle mismatch: access window requires ~${requiredEpochs} epochs but blob was ` +
          `stored for only ${configuredEpochs} epochs (~${blobDays} days). ` +
          `Either reduce the access window or re-upload the packet with WALRUS_EPOCHS>=${requiredEpochs}.`,
      );
    }
  }

  const idempotencyKey = crypto.randomUUID();
  const reserved = await provider.reserveApplication(providerListingId, {
    mandateId,
    listingObjectId,
    agentSuiAddress,
    agentEvmAddress,
    walrusBlobId: blobId,
    packetHash: packetHashHex,
    accessExpiresAtMs,
    idempotencyKey,
  });

  // 6. Execute Sui submit_application PTB
  report("submitting");
  const privateKey = input.privateKey;
  if (!privateKey) {
    throw new Error(
      "No private key provided. Set AGENT_SUI_PRIVATE_KEY or pass privateKey in RunInput.",
    );
  }

  const executed = await executeSubmitApplication({
    suiClient,
    executionClient,
    packageId,
    expectedAgentSuiAddress: agentSuiAddress,
    privateKey,
    input: {
      mandateId,
      listingObjectId,
      agentCapId,
      walrusBlobIdBytes: blobIdBytes,
      packetHashBytes,
      accessExpiresAtMs,
      worldRefHashBytes: [],
    },
  });

  if (!executed.receiptId) {
    throw new Error(
      "Sui transaction succeeded but ApplicationReceipt ID was not found in events/effects",
    );
  }

  // 7. Verify receipt
  report("verifying");
  await provider.verifyReceipt(reserved.id, {
    applicationId: reserved.id,
    txDigest: executed.txDigest,
    receiptId: executed.receiptId,
  });

  report("complete");
  return {
    runId,
    mandateId,
    applicationId: reserved.id,
    txDigest: executed.txDigest,
    receiptId: executed.receiptId,
    blobId,
    status: "complete",
  };
}
