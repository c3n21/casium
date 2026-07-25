/**
 * Unit tests for the agent HTTP server handlers (RD-161).
 *
 * Imports the `app` instance directly so no real server is started — the
 * `serve()` call in server.ts is guarded by `NODE_ENV !== "test"`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── module-level mocks must come before the server import ───────────────────

// Prevent createAgentkitSigner from failing when AGENT_EVM_PRIVATE_KEY is unset.
vi.mock("./agentkitSigner.js", () => ({
  createAgentkitSigner: vi.fn(() => null),
}));

// Stub the run pipeline — we only test handler routing here.
vi.mock("./run.js", () => ({
  runAgent: vi.fn(async () => ({
    runId: "run-1",
    status: "complete",
    mandateId: "0xmandate",
    txDigest: "txdigest",
    receiptId: "0xreceipt",
    applicationId: "app_1",
    blobId: "mock:blob",
  })),
}));

import { app } from "./server.js";

describe("GET /health", () => {
  it("returns ok with the expected shape", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.service).toBe("rentdelegate-agent");
    expect(typeof body.agentSuiAddress).toBe("string");
    expect(typeof body.agentkitMode).toBe("string");
    // agentEvmAddress is null when AGENTKIT_DEMO_AGENT_EVM_ADDRESS is not set in test env
    expect("agentEvmAddress" in body).toBe(true);
  });

  it("returns null agentEvmAddress when no EVM key or demo env is configured", async () => {
    // In the test environment neither AGENT_EVM_PRIVATE_KEY nor
    // AGENTKIT_DEMO_AGENT_EVM_ADDRESS should be set — the server module-level
    // code has already run with those values absent.
    const res = await app.request("/health");
    const body = await res.json() as Record<string, unknown>;
    // Value is null (not the fallback constant) when the agent is not configured.
    expect(body.agentEvmAddress).toBeNull();
  });
});

describe("GET /identity", () => {
  it("returns all four identity fields", async () => {
    const res = await app.request("/identity");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.agentSuiAddress).toBe("string");
    expect("agentEvmAddress" in body).toBe(true);
    expect(typeof body.agentkitMode).toBe("string");
    expect(typeof body.packageId).toBe("string");
  });

  it("agentEvmAddress is null when neither live key nor demo env is set", async () => {
    const res = await app.request("/identity");
    const body = await res.json() as Record<string, unknown>;
    expect(body.agentEvmAddress).toBeNull();
  });

  it("reports agentkitMode as 'none' when no credentials are configured", async () => {
    const res = await app.request("/identity");
    const body = await res.json() as Record<string, unknown>;
    expect(body.agentkitMode).toBe("none");
  });

  it("identity and health agentEvmAddress are consistent", async () => {
    const [healthRes, identityRes] = await Promise.all([
      app.request("/health"),
      app.request("/identity"),
    ]);
    const health = await healthRes.json() as Record<string, unknown>;
    const identity = await identityRes.json() as Record<string, unknown>;
    expect(identity.agentEvmAddress).toBe(health.agentEvmAddress);
    expect(identity.agentSuiAddress).toBe(health.agentSuiAddress);
    expect(identity.agentkitMode).toBe(health.agentkitMode);
  });
});
