import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import type { RunInput } from "./run.js";

// ─── minimal stubs for external dependencies ──────────────────────────────────

const mandateBase = {
  id: "0xmandate",
  owner: "0xowner",
  agentSui: "0xagent",
  maxMonthlyRentEur: 2000,
  allowedMunicipalities: [1],
  minBedrooms: 1,
  expiresAtMs: Date.now() + 10 * 24 * 60 * 60 * 1000,
  remainingApplications: 3,
  revoked: false,
  permittedActions: 1,
};

const listingBase = {
  id: "0xlisting",
  provider: "0xprovider",
  landlord: "0xlandlord",
  municipality: 1,
  monthlyRentEur: 1500,
  bedrooms: 2,
  active: true,
  expiresAtMs: Date.now() + 10 * 24 * 60 * 60 * 1000,
};

const reservedApplication = {
  id: "app_1",
  listingId: "0xlisting",
  listingObjectId: "0xlisting",
  mandateId: "0xmandate",
  agentSuiAddress: "0xagent",
  agentEvmAddress: "0xevm",
  humanIdHash: "sha256:demo",
  walrusBlobId: "mock:blob",
  packetHash: "0xhash",
  status: "reserved" as const,
  idempotencyKey: "key1",
  submitHint: {
    packageId: "0xpackage",
    module: "rental" as const,
    function: "submit_application" as const,
    mandateId: "0xmandate",
    listingObjectId: "0xlisting",
    agentSuiAddress: "0xagent",
  },
};

// Set up module mocks before importing runAgent
vi.mock("@rentdelegate/sui-client", () => ({
  createRentDelegateClient: vi.fn(),
}));
vi.mock("@mysten/sui/grpc", () => ({
  SuiGrpcClient: vi.fn(),
}));
vi.mock("./providerClient.js", () => ({
  createProviderClient: vi.fn(),
}));
vi.mock("./suiSubmit.js", () => ({
  executeSubmitApplication: vi.fn(),
}));

// Import after mocking
import { createRentDelegateClient } from "@rentdelegate/sui-client";
import { createProviderClient } from "./providerClient.js";
import { executeSubmitApplication } from "./suiSubmit.js";
import { runAgent } from "./run.js";

const mockCreateClient = vi.mocked(createRentDelegateClient);
const mockCreateProvider = vi.mocked(createProviderClient);
const mockExecute = vi.mocked(executeSubmitApplication);

function makeSuiClient(overrides?: { findAgentCapForMandate?: () => Promise<string | null> }) {
  return {
    getMandate: vi.fn(async () => mandateBase),
    getListing: vi.fn(async () => listingBase),
    findAgentCapForMandate: overrides?.findAgentCapForMandate ?? vi.fn(async () => "0xcap"),
    buildSubmitApplicationTx: vi.fn(),
  } as never;
}

function makeProviderClient(walrusBlobId = "mock:blob123") {
  return {
    reserveApplication: vi.fn(async () => reservedApplication),
    verifyReceipt: vi.fn(async () => ({ ...reservedApplication, status: "accepted" as const })),
    getPacketForMandate: vi.fn(async () => ({
      mandateId: "0xmandate",
      walrusBlobId,
      packetHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
      sizeBytes: 256,
      encryptionMode: "mock" as const,
      registeredAtMs: Date.now(),
    })),
  } as never;
}

const BASE_INPUT: RunInput = {
  mandateId: "0xmandate",
  listingObjectId: "0xlisting",
  agentSuiAddress: "0xagent",
  agentEvmAddress: "0xevm",
  agentCapId: "0xcap",
  privateKey: "suiprivkeyFAKE",
  packageId: "0xpackage",
  rpcUrl: "https://rpc.test",
  providerApiBase: "http://provider.test",
  demoAgentKitHeaders: undefined,
  agentkitHeader: undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateClient.mockReturnValue(makeSuiClient());
  mockCreateProvider.mockReturnValue(makeProviderClient());
  mockExecute.mockResolvedValue({ txDigest: "txdigest", receiptId: "0xreceipt" });
});

describe("runAgent", () => {
  it("returns complete status on a successful run", async () => {
    const result = await runAgent(BASE_INPUT);

    expect(result.status).toBe("complete");
    expect(result.mandateId).toBe("0xmandate");
    expect(result.receiptId).toBe("0xreceipt");
    expect(result.txDigest).toBe("txdigest");
    expect(result.applicationId).toBe("app_1");
    expect(result.blobId).toBe("mock:blob123");
  });

  it("returns ineligible when the mandate is revoked", async () => {
    mockCreateClient.mockReturnValue({
      ...makeSuiClient(),
      getMandate: vi.fn(async () => ({ ...mandateBase, revoked: true })),
    } as never);

    const result = await runAgent(BASE_INPUT);

    expect(result.status).toBe("ineligible");
    expect(result.reason).toMatch(/revoked/i);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("returns ineligible when the listing fails the eligibility check", async () => {
    mockCreateClient.mockReturnValue({
      ...makeSuiClient(),
      getListing: vi.fn(async () => ({ ...listingBase, monthlyRentEur: 9999 })),
    } as never);

    const result = await runAgent(BASE_INPUT);

    expect(result.status).toBe("ineligible");
    expect(result.reason).toMatch(/exceeds/i);
  });

  it("discovers AgentCap when agentCapId is not in input", async () => {
    const findAgentCap = vi.fn(async () => "0xdiscovered_cap");
    mockCreateClient.mockReturnValue(makeSuiClient({ findAgentCapForMandate: findAgentCap }));

    const result = await runAgent({ ...BASE_INPUT, agentCapId: undefined });

    expect(findAgentCap).toHaveBeenCalledWith("0xmandate", "0xagent");
    expect(result.status).toBe("complete");
  });

  it("throws when AgentCap discovery returns null", async () => {
    mockCreateClient.mockReturnValue(
      makeSuiClient({ findAgentCapForMandate: vi.fn(async () => null) }),
    );

    await expect(runAgent({ ...BASE_INPUT, agentCapId: undefined })).rejects.toThrow(/No AgentCap found/);
  });

  it("throws when no private key is provided", async () => {
    await expect(runAgent({ ...BASE_INPUT, privateKey: undefined })).rejects.toThrow(/No private key provided/);
    expect(mockCreateProvider).not.toHaveBeenCalled();
  });

  it("calls onProgress with the expected stages", async () => {
    const stages: string[] = [];
    await runAgent(BASE_INPUT, (p) => stages.push(p.stage));

    expect(stages).toContain("loading-mandate");
    expect(stages).toContain("evaluating");
    expect(stages).toContain("uploading");
    expect(stages).toContain("reserving");
    expect(stages).toContain("submitting");
    expect(stages).toContain("verifying");
    expect(stages).toContain("complete");
  });

  it("includes a runId in every progress event and in the result", async () => {
    const runIds = new Set<string>();
    const result = await runAgent(BASE_INPUT, (p) => runIds.add(p.runId));

    expect(runIds.size).toBe(1);
    expect(result.runId).toBe([...runIds][0]);
  });

  it("throws when no packet has been registered for the mandate", async () => {
    mockCreateProvider.mockReturnValue({
      ...makeProviderClient(),
      getPacketForMandate: vi.fn(async () => null),
    } as never);

    await expect(runAgent(BASE_INPUT)).rejects.toThrow(/No packet registered for mandate/);
  });
});

describe("landlord access window", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("completes on a real Walrus blob, which the default window fits inside", async () => {
    const provider = makeProviderClient("realblob123");
    mockCreateProvider.mockReturnValue(provider as never);

    const result = await runAgent(BASE_INPUT);

    expect(result.status).toBe("complete");

    // 3 days by default: short enough that a 5-epoch blob outlives the window it
    // writes on chain. A 30-day window here is what broke every real-blob run.
    const [, reserved] = (provider.reserveApplication as ReturnType<typeof vi.fn>).mock.calls[0];
    const windowMs = reserved.accessExpiresAtMs - Date.now();
    expect(windowMs).toBeGreaterThan(2.9 * DAY_MS);
    expect(windowMs).toBeLessThan(3.1 * DAY_MS);
  });

  it("honours AGENT_ACCESS_WINDOW_DAYS", async () => {
    vi.stubEnv("AGENT_ACCESS_WINDOW_DAYS", "2");
    const provider = makeProviderClient("realblob123");
    mockCreateProvider.mockReturnValue(provider as never);

    await runAgent(BASE_INPUT);

    const [, reserved] = (provider.reserveApplication as ReturnType<typeof vi.fn>).mock.calls[0];
    const windowMs = reserved.accessExpiresAtMs - Date.now();
    expect(windowMs).toBeGreaterThan(1.9 * DAY_MS);
    expect(windowMs).toBeLessThan(2.1 * DAY_MS);
  });

  it("still refuses a window the blob cannot outlive", async () => {
    vi.stubEnv("AGENT_ACCESS_WINDOW_DAYS", "30");
    mockCreateProvider.mockReturnValue(makeProviderClient("realblob123") as never);

    await expect(runAgent(BASE_INPUT)).rejects.toThrow(/Blob lifecycle mismatch/);
  });

  it("skips the lifecycle check for mock blobs regardless of window", async () => {
    vi.stubEnv("AGENT_ACCESS_WINDOW_DAYS", "30");
    mockCreateProvider.mockReturnValue(makeProviderClient("mock:blob123") as never);

    const result = await runAgent(BASE_INPUT);

    expect(result.status).toBe("complete");
  });
});
