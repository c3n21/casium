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

import {
  DEMO_LISTING_OBJECT_ID,
  INELIGIBLE_LISTING_OBJECT_ID,
  PACKAGE_ID as DEFAULT_PACKAGE_ID,
  PUBLISHER_ADDRESS,
  RPC_URL as DEFAULT_RPC_URL,
  SMOKE as SMOKE_OBJECTS,
} from "@rentdelegate/contracts-config";
import { createRentDelegateClient } from "@rentdelegate/sui-client";
import { evaluateEligibility } from "./rules.js";
import { createProviderClient } from "./providerClient.js";
import type { DemoAgentKitHeaders } from "./providerClient.js";
import { createAgentkitSigner } from "./agentkitSigner.js";
import { runAgent } from "./run.js";

const PACKAGE_ID = process.env.SUI_PACKAGE_ID ?? DEFAULT_PACKAGE_ID;
const RPC_URL = process.env.SUI_RPC_URL ?? DEFAULT_RPC_URL;
const PROVIDER_API_BASE = process.env.PROVIDER_API_URL ?? "http://localhost:4021";

const SMOKE_MANDATE_ID = process.env.MANDATE_ID ?? SMOKE_OBJECTS.mandateId;
const SMOKE_LISTING_ID = process.env.LISTING_ID ?? DEMO_LISTING_OBJECT_ID;
const SMOKE_INELIGIBLE_LISTING_ID = process.env.INELIGIBLE_LISTING_ID ?? INELIGIBLE_LISTING_OBJECT_ID;
const SMOKE_AGENT_SUI_ADDRESS = process.env.AGENT_SUI_ADDRESS ?? PUBLISHER_ADDRESS;
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

  const demoHeaders = readDemoAgentKitHeaders();
  const agentkitSigner = createAgentkitSigner();

  if (agentkitSigner) {
    console.log(`AgentKit:  live signing as ${agentkitSigner.address} (${agentkitSigner.chainId})`);
  } else if (process.env.AGENTKIT_HEADER) {
    console.log("AgentKit:  static AGENTKIT_HEADER — valid for one URL until it expires");
  } else if (demoHeaders) {
    console.log("AgentKit:  [MOCK] demo headers — requires provider AGENTKIT_MODE=mock, proves no World identity");
  }

  // Discover AgentCap
  let agentCapId: string;
  if (process.env.AGENT_CAP_ID) {
    agentCapId = process.env.AGENT_CAP_ID;
    console.log(`    AgentCap:  ${agentCapId} (from env override)`);
  } else {
    const suiClient = createRentDelegateClient({
      network: "testnet",
      rpcUrl: RPC_URL,
      packageId: PACKAGE_ID,
    });
    const discovered = await suiClient.findAgentCapForMandate(SMOKE_MANDATE_ID, SMOKE_AGENT_SUI_ADDRESS);
    if (!discovered) {
      // Fall back to smoke object for backwards compatibility with the testnet smoke setup
      agentCapId = SMOKE_OBJECTS.agentCapId;
      console.log(`    AgentCap:  ${agentCapId} (smoke fallback — no cap found for mandate)`);
    } else {
      agentCapId = discovered;
      console.log(`    AgentCap:  ${agentCapId} (discovered)`);
    }
  }

  // Show eligibility info for both demo listings before running the pipeline
  console.log("\n[2] Evaluating listings...");
  const suiClient = createRentDelegateClient({
    network: "testnet",
    rpcUrl: RPC_URL,
    packageId: PACKAGE_ID,
  });
  const listings = await Promise.all([
    suiClient.getListing(SMOKE_LISTING_ID),
    suiClient.getListing(SMOKE_INELIGIBLE_LISTING_ID).catch(() => null),
  ]);
  const [eligible, ineligible] = listings;

  const mandate = await suiClient.getMandate(SMOKE_MANDATE_ID);

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

  // Run the pipeline via the shared runAgent function
  try {
    const result = await runAgent({
      mandateId: SMOKE_MANDATE_ID,
      listingObjectId: SMOKE_LISTING_ID,
      agentSuiAddress: SMOKE_AGENT_SUI_ADDRESS,
      // Must match the signature's recovered address when signing live, or the
      // provider rejects the reservation with MANDATE_EVM_MISMATCH.
      agentEvmAddress: agentkitSigner?.address ?? SMOKE_AGENT_EVM_ADDRESS,
      agentCapId,
      privateKey: process.env.AGENT_SUI_PRIVATE_KEY ?? process.env.AGENT_SUI_PRIVATE_KEY_BASE64,
      packageId: PACKAGE_ID,
      rpcUrl: RPC_URL,
      providerApiBase: PROVIDER_API_BASE,
      demoAgentKitHeaders: demoHeaders ?? undefined,
      agentkitHeader: process.env.AGENTKIT_HEADER,
      ...(agentkitSigner ? { createAgentkitHeader: agentkitSigner.createHeader } : {}),
    }, (progress) => {
      const stageLabels: Record<string, string> = {
        "loading-mandate": "[1] Loading mandate from testnet...",
        "uploading": "[3] Encrypting and uploading application packet...",
        "reserving": "[4] Reserving application with provider API...",
        "submitting": "[5] Executing Sui submit_application PTB...",
        "verifying": "[6] Verifying receipt with provider API...",
        "complete": "=== Agent run complete ===",
      };
      const label = stageLabels[progress.stage];
      if (label) console.log(`\n${label}`);
    });

    if (result.status === "ineligible") {
      console.log(`\n  Listing not eligible: ${result.reason}`);
      return;
    }

    console.log(`\n=== Agent run complete ===`);
    console.log(`Eligible listing: ${SMOKE_LISTING_ID}`);
    console.log(`Application ID:   ${result.applicationId}`);
    console.log(`Receipt ID:       ${result.receiptId}`);
    console.log(`Blob ID:          ${result.blobId}`);
    console.log(`Tx digest:        ${result.txDigest}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("No private key provided")) {
      // Show the PTB-ready message without a key
      console.log(`\n  No private key set. Set AGENT_SUI_PRIVATE_KEY=suiprivkey... to execute.`);
    } else if (msg.includes("AGENTKIT_UNVERIFIED") || msg.includes("No agentkit header")) {
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
