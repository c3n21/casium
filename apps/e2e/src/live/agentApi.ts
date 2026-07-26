/**
 * Thin HTTP client for the **real** agent service on :4022.
 *
 * `POST /runs` is fire-and-forget — it returns a runId immediately and the
 * pipeline continues in the background — so every caller has to poll. Polling
 * here rather than in each spec keeps the "no arbitrary waits" rule intact:
 * the loop ends on a terminal status, not on a sleep.
 */

import type { APIRequestContext } from "@playwright/test";
import { AGENT_API_URL } from "./env.js";

export type AgentHealth = {
  ok: boolean;
  service: string;
  agentSuiAddress: string;
  agentEvmAddress: string | null;
  agentkitMode: "live-signing" | "live-header" | "mock" | "none";
};

export type AgentIdentity = AgentHealth & { packageId: string };

export type TargetResult = {
  providerListingId: string;
  listingObjectId: string;
  status: "complete" | "ineligible" | "failed" | "duplicate";
  reason?: string;
  applicationId?: string;
  txDigest?: string;
  receiptId?: string;
  blobId?: string;
};

export type RunResult = {
  runId: string;
  mandateId: string;
  status: "complete" | "ineligible" | "failed";
  reason?: string;
  error?: string;
  applicationId?: string;
  txDigest?: string;
  receiptId?: string;
  blobId?: string;
  targets?: TargetResult[];
};

export type RunRecord =
  | { runId: string; status: "running" }
  | { runId: string; status: "done"; result: RunResult }
  | { runId: string; status: "failed"; error: string };

export type RunTarget = { providerListingId: string; listingObjectId: string };

export async function agentHealth(request: APIRequestContext): Promise<AgentHealth> {
  const response = await request.get(`${AGENT_API_URL}/health`);
  return (await response.json()) as AgentHealth;
}

export async function agentIdentity(request: APIRequestContext): Promise<AgentIdentity> {
  const response = await request.get(`${AGENT_API_URL}/identity`);
  return (await response.json()) as AgentIdentity;
}

export async function startRun(
  request: APIRequestContext,
  body: { mandateId: string; targets?: RunTarget[]; listingObjectId?: string },
): Promise<string> {
  const response = await request.post(`${AGENT_API_URL}/runs`, { data: body });
  if (response.status() !== 202) {
    throw new Error(`Agent refused the run: ${response.status()} ${await response.text()}`);
  }
  const { runId } = (await response.json()) as { runId: string };
  return runId;
}

/**
 * Poll until the run leaves `running`. A run touches testnet several times
 * (AgentCap discovery, mandate, listing) plus the provider, so the default
 * ceiling is generous; it is a failure bound, not an expected duration.
 */
export async function waitForRun(
  request: APIRequestContext,
  runId: string,
  timeoutMs = 90_000,
): Promise<Exclude<RunRecord, { status: "running" }>> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const response = await request.get(`${AGENT_API_URL}/runs/${runId}`);
    const record = (await response.json()) as RunRecord;
    if (record.status !== "running") return record;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Agent run ${runId} did not finish within ${timeoutMs}ms`);
}

/** Run and wait, returning the terminal record. */
export async function runToCompletion(
  request: APIRequestContext,
  body: { mandateId: string; targets?: RunTarget[]; listingObjectId?: string },
) {
  return waitForRun(request, await startRun(request, body));
}
