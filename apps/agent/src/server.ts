/**
 * RentDelegate Agent HTTP server (RD-113).
 *
 * Wraps the runAgent pipeline in a Hono HTTP server so the UI can trigger agent runs
 * without editing .env or using the CLI directly.
 *
 * Endpoints:
 *   GET  /health           → liveness + config snapshot
 *   POST /runs             → start a new agent run (returns runId immediately)
 *   GET  /runs/:id         → poll run status and result
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import {
  DEMO_LISTING_OBJECT_ID,
  PACKAGE_ID as DEFAULT_PACKAGE_ID,
  PUBLISHER_ADDRESS,
  RPC_URL as DEFAULT_RPC_URL,
  SMOKE as SMOKE_OBJECTS,
} from "@rentdelegate/contracts-config";
import { runAgent } from "./run.js";
import type { RunResult, RunInput } from "./run.js";
import type { DemoAgentKitHeaders } from "./providerClient.js";
import { createAgentkitSigner } from "./agentkitSigner.js";

const PACKAGE_ID = process.env.SUI_PACKAGE_ID ?? DEFAULT_PACKAGE_ID;
const RPC_URL = process.env.SUI_RPC_URL ?? DEFAULT_RPC_URL;
const PROVIDER_API_BASE = process.env.PROVIDER_API_URL ?? "http://localhost:4021";

const SMOKE_MANDATE_ID = process.env.MANDATE_ID ?? SMOKE_OBJECTS.mandateId;
const SMOKE_AGENT_SUI_ADDRESS = process.env.AGENT_SUI_ADDRESS ?? PUBLISHER_ADDRESS;
const SMOKE_AGENT_EVM_ADDRESS =
  process.env.AGENT_EVM_ADDRESS ?? "0x662DbABBeff9B237490bBE6A898776a4A1D87CCe";

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

const demoHeaders = readDemoAgentKitHeaders();
const agentkitSigner = createAgentkitSigner();

if (agentkitSigner) {
  console.log(`AgentKit:  live signing as ${agentkitSigner.address} (${agentkitSigner.chainId})`);
} else if (process.env.AGENTKIT_HEADER) {
  console.log("AgentKit:  static AGENTKIT_HEADER — valid for one URL until it expires");
} else if (demoHeaders) {
  console.log("AgentKit:  [MOCK] demo headers — rejected by a provider in AGENTKIT_MODE=real");
}

// In-memory run store — sufficient for demo; survives only the process lifetime.
type RunRecord =
  | { status: "running" }
  | { status: "done"; result: RunResult }
  | { status: "failed"; error: string };

const runs = new Map<string, RunRecord>();

const app = new Hono();

app.use("*", cors({ allowHeaders: ["content-type"] }));

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "rentdelegate-agent",
    agentSuiAddress: SMOKE_AGENT_SUI_ADDRESS,
    agentkitMode: agentkitSigner
      ? "live-signing"
      : process.env.AGENTKIT_HEADER
        ? "live-header"
        : demoHeaders
          ? "mock"
          : "none",
    agentEvmAddress: agentkitSigner?.address ?? SMOKE_AGENT_EVM_ADDRESS,
  }),
);

app.post("/runs", async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    mandateId?: string;
    listingObjectId?: string;
  };

  const mandateId = body.mandateId ?? SMOKE_MANDATE_ID;
  const runId = crypto.randomUUID();

  runs.set(runId, { status: "running" });

  const runInput: RunInput = {
    mandateId,
    listingObjectId: body.listingObjectId,
    agentSuiAddress: SMOKE_AGENT_SUI_ADDRESS,
    // When signing live this must be the signer's own address: the provider compares
    // the reserved body against the address it recovered from the signature and
    // rejects a mismatch with MANDATE_EVM_MISMATCH.
    agentEvmAddress: agentkitSigner?.address ?? SMOKE_AGENT_EVM_ADDRESS,
    agentCapId: process.env.AGENT_CAP_ID,
    privateKey: process.env.AGENT_SUI_PRIVATE_KEY ?? process.env.AGENT_SUI_PRIVATE_KEY_BASE64,
    packageId: PACKAGE_ID,
    rpcUrl: RPC_URL,
    providerApiBase: PROVIDER_API_BASE,
    demoAgentKitHeaders: demoHeaders ?? undefined,
    agentkitHeader: process.env.AGENTKIT_HEADER,
    ...(agentkitSigner ? { createAgentkitHeader: agentkitSigner.createHeader } : {}),
  };

  // Fire-and-forget: start the run async, don't block the HTTP response.
  void runAgent(runInput, (progress) => {
    console.log(`[run:${runId.slice(0, 8)}] stage=${progress.stage}`);
  })
    .then((result) => {
      runs.set(runId, { status: "done", result });
    })
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err);
      runs.set(runId, { status: "failed", error });
    });

  return c.json({ runId, status: "running" }, 202);
});

app.get("/runs/:id", (c) => {
  const runId = c.req.param("id");
  const run = runs.get(runId);
  if (!run) return c.json({ error: "RUN_NOT_FOUND" }, 404);
  return c.json({ runId, ...run });
});

export { app };

// Start the server when this file is the entry point.
const PORT = Number(process.env.AGENT_SERVER_PORT ?? 4022);
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[rentdelegate-agent] server listening on http://localhost:${PORT}`);
  console.log(`  agentSuiAddress: ${SMOKE_AGENT_SUI_ADDRESS}`);
  console.log(
    `  agentkitMode:    ${process.env.AGENTKIT_HEADER ? "live" : demoHeaders ? "mock" : "none"}`,
  );
});
