/**
 * RentDelegate Agent — deterministic mandate-scoped rental application agent.
 *
 * Dependency order:
 *   1. Load mandate from Sui to know scope constraints.
 *   2. Fetch provider listings and evaluate each against mandate rules (no LLM).
 *   3. For eligible listing: upload encrypted packet to Walrus (mock), reserve with provider API.
 *   4. Sign and execute the Sui submit_application PTB with the agent key.
 *   5. Ask provider API to verify the on-chain receipt.
 *
 * The agent uses its own Sui address + AgentCap — never the renter's wallet.
 */

import { createRentDelegateClient } from "@rentdelegate/sui-client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { createMockWalrusAdapter } from "@rentdelegate/walrus";
import { makeSyntheticPacket } from "@rentdelegate/shared";
import { evaluateEligibility } from "./rules.js";
import { createProviderClient } from "./providerClient.js";
import type { DemoAgentKitHeaders } from "./providerClient.js";
import { executeSubmitApplication } from "./suiSubmit.js";

const PACKAGE_ID =
  process.env.SUI_PACKAGE_ID ?? "0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d";
const RPC_URL = process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443";
const PROVIDER_API_BASE = process.env.PROVIDER_API_URL ?? "http://localhost:4021";

const SMOKE_MANDATE_ID =
  process.env.MANDATE_ID ?? "0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee";
const SMOKE_LISTING_ID =
  process.env.LISTING_ID ?? "0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a";
const SMOKE_INELIGIBLE_LISTING_ID =
  process.env.INELIGIBLE_LISTING_ID ?? "0x1000000000000000000000000000000000000000000000000000000000000006";
const SMOKE_AGENT_SUI_ADDRESS =
  process.env.AGENT_SUI_ADDRESS ?? "0x371321932fb4c4b79b9b0762ac0878ebfb670cc6f6327ecf9d1d06cd9489243e";
const SMOKE_AGENT_EVM_ADDRESS =
  process.env.AGENT_EVM_ADDRESS ?? "0x662DbABBeff9B237490bBE6A898776a4A1D87CCe";

/**
 * Mock-AgentKit headers for local Sui-focused smokes. Opt-in only: both env vars
 * must be set, and the provider API must be running with AGENTKIT_MODE=mock.
 */
function readDemoAgentKitHeaders(): DemoAgentKitHeaders | null {
  const humanIdHash = process.env.AGENTKIT_DEMO_HUMAN_ID_HASH;
  const agentEvmAddress = process.env.AGENTKIT_DEMO_AGENT_EVM_ADDRESS;

  if (!humanIdHash || !agentEvmAddress) return null;

  return {
    humanIdHash,
    agentEvmAddress,
    ...(process.env.AGENTKIT_DEMO_MANDATE_AGENT_SUI_ADDRESS
      ? { mandateAgentSuiAddress: process.env.AGENTKIT_DEMO_MANDATE_AGENT_SUI_ADDRESS }
      : {}),
  };
}

async function main() {
  console.log("=== RentDelegate Agent ===");
  console.log(`Package:   ${PACKAGE_ID}`);
  console.log(`Provider:  ${PROVIDER_API_BASE}`);
  console.log(`Mandate:   ${SMOKE_MANDATE_ID}`);

  const suiClient = createRentDelegateClient({ network: "testnet", rpcUrl: RPC_URL, packageId: PACKAGE_ID });
  const executionClient = new SuiGrpcClient({ network: "testnet", baseUrl: RPC_URL });
  const walrus = createMockWalrusAdapter();
  const demoHeaders = readDemoAgentKitHeaders();
  const provider = createProviderClient({
    baseUrl: PROVIDER_API_BASE,
    ...(process.env.AGENTKIT_HEADER ? { agentkitHeader: process.env.AGENTKIT_HEADER } : {}),
    ...(demoHeaders ? { demoAgentKitHeaders: demoHeaders } : {}),
  });

  if (!process.env.AGENTKIT_HEADER && demoHeaders) {
    console.log("AgentKit:  [MOCK] demo headers — requires provider AGENTKIT_MODE=mock, proves no World identity");
  }

  // 1. Load mandate
  console.log("\n[1] Loading mandate from testnet...");
  const mandate = await suiClient.getMandate(SMOKE_MANDATE_ID);
  console.log(`    Mandate owner:  ${mandate.owner}`);
  console.log(`    Remaining:      ${mandate.remainingApplications}`);
  console.log(`    Max rent:       €${mandate.maxMonthlyRentEur}`);
  console.log(`    Municipalities: [${mandate.allowedMunicipalities.join(", ")}]`);
  console.log(`    Revoked:        ${mandate.revoked}`);

  // 2. Evaluate listings
  console.log("\n[2] Evaluating listings...");
  const listings = await Promise.all([
    suiClient.getListing(SMOKE_LISTING_ID),
    suiClient.getListing(SMOKE_INELIGIBLE_LISTING_ID).catch(() => null),
  ]);

  const [eligible, ineligible] = listings;

  if (eligible) {
    const result = evaluateEligibility(mandate, eligible);
    console.log(`    Lisbon listing (${SMOKE_LISTING_ID.slice(0, 16)}…):`);
    console.log(`      → eligible: ${result.eligible}`);
    console.log(`      → ${result.reason}`);
  }

  if (ineligible) {
    const result = evaluateEligibility(mandate, ineligible);
    console.log(`    Porto listing (${SMOKE_INELIGIBLE_LISTING_ID.slice(0, 16)}…):`);
    console.log(`      → eligible: ${result.eligible}`);
    console.log(`      → ${result.reason}`);
  } else {
    console.log(`    Porto listing: not readable (expected for mock object)`);
  }

  if (!eligible) {
    console.log("\n  No eligible listing found. Stopping.");
    return;
  }

  const eligibilityCheck = evaluateEligibility(mandate, eligible);
  if (!eligibilityCheck.eligible) {
    console.log(`\n  Listing not eligible: ${eligibilityCheck.reason}`);
    return;
  }

  // 3. Upload encrypted packet (mock Walrus)
  console.log("\n[3] Encrypting and uploading application packet...");
  const packet = makeSyntheticPacket({ renterName: "Alice Demo Agent" });
  const packetBytes = new TextEncoder().encode(JSON.stringify(packet));
  const { blobId } = await walrus.upload(packetBytes);
  console.log(`    Blob ID: ${blobId}`);
  console.log(`    [MOCK] Walrus upload — labeled as mock in blob ID prefix`);

  // packetHash = sha256 of uploaded bytes (used as on-chain commitment)
  const hashBuffer = await crypto.subtle.digest("SHA-256", packetBytes);
  const packetHashHex = `0x${Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;

  // 4. Reserve with provider API
  console.log("\n[4] Reserving application with provider API...");
  const idempotencyKey = crypto.randomUUID();

  try {
    const reserved = await provider.reserveApplication("listing_lisbon_eligible", {
      mandateId: SMOKE_MANDATE_ID,
      listingObjectId: SMOKE_LISTING_ID,
      agentSuiAddress: SMOKE_AGENT_SUI_ADDRESS,
      agentEvmAddress: SMOKE_AGENT_EVM_ADDRESS,
      walrusBlobId: blobId,
      packetHash: packetHashHex,
      accessExpiresAtMs: Date.now() + 30 * 24 * 60 * 60 * 1000,
      idempotencyKey,
    });

    console.log(`    Application ID: ${reserved.id}`);
    console.log(`    Status:         ${reserved.status}`);
    console.log(`    Human ID hash:  ${reserved.humanIdHash}`);
    console.log(`    Submit hint:`);
    console.log(`      package:   ${reserved.submitHint.packageId ?? "(set SUI_PACKAGE_ID)"}`);
    console.log(`      function:  ${reserved.submitHint.module}::${reserved.submitHint.function}`);

    // 5. Execute Sui PTB with the agent-owned key and AgentCap.
    console.log("\n[5] Executing Sui submit_application PTB...");
    const blobIdBytes = Array.from(new TextEncoder().encode(blobId));
    const packetHashBytes = Array.from(new Uint8Array(hashBuffer));
    const accessExpiresAtMs = Date.now() + 30 * 24 * 60 * 60 * 1000;

    const submitInput = {
      mandateId: SMOKE_MANDATE_ID,
      listingObjectId: SMOKE_LISTING_ID,
      agentCapId: process.env.AGENT_CAP_ID ?? "0xabeb55d1266102eed4235531c542fb01fd85bb3095c3d579960923f2e1e25c2a",
      walrusBlobIdBytes: blobIdBytes,
      packetHashBytes,
      accessExpiresAtMs,
      worldRefHashBytes: [],
    };

    const privateKey = process.env.AGENT_SUI_PRIVATE_KEY ?? process.env.AGENT_SUI_PRIVATE_KEY_BASE64;
    if (!privateKey) {
      const tx = suiClient.buildSubmitApplicationTx(submitInput);
      const serialized = await tx.toJSON();
      console.log(`    PTB ready. Bytes (base64 prefix): ${serialized.slice(0, 48)}…`);
      console.log(`    Set AGENT_SUI_PRIVATE_KEY=suiprivkey... or AGENT_SUI_PRIVATE_KEY_BASE64 to execute.`);
      return;
    }

    const executed = await executeSubmitApplication({
      suiClient,
      executionClient,
      packageId: PACKAGE_ID,
      expectedAgentSuiAddress: SMOKE_AGENT_SUI_ADDRESS,
      privateKey,
      input: submitInput,
    });

    if (!executed.receiptId) {
      throw new Error("Sui transaction succeeded but ApplicationReceipt ID was not found in events/effects");
    }

    console.log(`    Tx digest:  ${executed.txDigest}`);
    console.log(`    Receipt ID: ${executed.receiptId}`);

    console.log("\n[6] Verifying receipt with provider API...");
    const verified = await provider.verifyReceipt(reserved.id, {
      applicationId: reserved.id,
      txDigest: executed.txDigest,
      receiptId: executed.receiptId,
    });
    console.log(`    Status: ${verified.status}`);

    console.log("\n=== Agent run complete ===");
    console.log(`Eligible listing: ${SMOKE_LISTING_ID}`);
    console.log(`Application ID:   ${reserved.id}`);
    console.log(`Receipt ID:       ${executed.receiptId}`);
    console.log(`Blob ID:          ${blobId}`);
    console.log(`Packet hash:      ${packetHashHex}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("AGENTKIT_UNVERIFIED") || msg.includes("No agentkit header")) {
      console.log(`\n  Provider requires a real AgentKit header. Run with AGENTKIT_HEADER env or start`);
      console.log(`  provider in AGENTKIT_MODE=mock for local testing.`);
    } else {
      throw error;
    }
  }
}

main().catch((error) => {
  console.error("Agent failed:", error);
  process.exitCode = 1;
});
