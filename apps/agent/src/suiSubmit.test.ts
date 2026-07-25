import { describe, expect, it, vi } from "vitest";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  executeSubmitApplication,
  keypairFromPrivateKey,
  parseReceiptIdFromEffects,
  parseReceiptIdFromEvents,
  parseReceiptIdFromTransaction,
} from "./suiSubmit.js";
import { createProviderClient } from "./providerClient.js";

const PACKAGE_ID = "0xpackage";
const INPUT = {
  mandateId: "0xmandate",
  listingObjectId: "0xlisting",
  agentCapId: "0xcap",
  walrusBlobIdBytes: [109, 111, 99, 107],
  packetHashBytes: [1, 2, 3],
  accessExpiresAtMs: 1_790_000_000_000,
  worldRefHashBytes: [],
};

describe("keypairFromPrivateKey", () => {
  it("parses suiprivkey values", () => {
    const keypair = Ed25519Keypair.generate();
    const parsed = keypairFromPrivateKey(keypair.getSecretKey());
    expect(parsed.toSuiAddress()).toBe(keypair.toSuiAddress());
  });

  it("parses base64 raw Ed25519 private keys", () => {
    const raw = new Uint8Array(32).fill(7);
    const parsed = keypairFromPrivateKey(Buffer.from(raw).toString("base64"));
    expect(parsed.toSuiAddress()).toMatch(/^0x[0-9a-f]+$/);
  });
});

describe("receipt ID parsing", () => {
  it("extracts receipt ID from the gRPC event json payload", () => {
    expect(
      parseReceiptIdFromEvents(
        [
          {
            eventType: `${PACKAGE_ID}::rental::ApplicationSubmitted`,
            json: { receipt_id: "0xreceipt", remaining_applications: "1" },
          },
        ],
        PACKAGE_ID,
      ),
    ).toBe("0xreceipt");
  });

  it("still reads JSON-RPC-shaped event payloads", () => {
    expect(
      parseReceiptIdFromEvents(
        [
          {
            eventType: `${PACKAGE_ID}::rental::ApplicationSubmitted`,
            contents: { json: { receipt_id: { id: "0xreceipt" } } },
          },
        ],
        PACKAGE_ID,
      ),
    ).toBe("0xreceipt");
  });

  it("falls back to gRPC changedObjects resolved through the objectTypes map", () => {
    expect(
      parseReceiptIdFromEffects(
        {
          changedObjects: [
            { objectId: "0xmandate", idOperation: "None", outputState: "ObjectWrite" },
            { objectId: "0xreceipt", idOperation: "Created", outputState: "ObjectWrite" },
          ],
        },
        PACKAGE_ID,
        {
          "0xmandate": `${PACKAGE_ID}::rental::RentalMandate`,
          "0xreceipt": `${PACKAGE_ID}::rental::ApplicationReceipt`,
        },
      ),
    ).toBe("0xreceipt");
  });

  it("returns null when created objects carry no resolvable type", () => {
    expect(
      parseReceiptIdFromEffects(
        { changedObjects: [{ objectId: "0xreceipt", idOperation: "Created" }] },
        PACKAGE_ID,
      ),
    ).toBeNull();
  });

  it("falls back to created object effects with inline type metadata", () => {
    expect(
      parseReceiptIdFromEffects(
        { created: [{ objectId: "0xreceipt", objectType: `${PACKAGE_ID}::rental::ApplicationReceipt` }] },
        PACKAGE_ID,
      ),
    ).toBe("0xreceipt");
  });

  it("prefers events over effects", () => {
    expect(
      parseReceiptIdFromTransaction(
        {
          events: [
            {
              eventType: `${PACKAGE_ID}::rental::ApplicationSubmitted`,
              json: { receipt_id: "0xeventreceipt" },
            },
          ],
          effects: { changedObjects: [{ objectId: "0xeffectreceipt", idOperation: "Created" }] },
          objectTypes: { "0xeffectreceipt": `${PACKAGE_ID}::rental::ApplicationReceipt` },
        },
        PACKAGE_ID,
      ),
    ).toBe("0xeventreceipt");
  });
});

describe("executeSubmitApplication", () => {
  it("rejects private keys that do not match AGENT_SUI_ADDRESS", async () => {
    const keypair = Ed25519Keypair.generate();
    await expect(
      executeSubmitApplication({
        suiClient: fakeRentDelegateClient(),
        executionClient: fakeExecutionClient(),
        packageId: PACKAGE_ID,
        expectedAgentSuiAddress: Ed25519Keypair.generate().toSuiAddress(),
        privateKey: keypair.getSecretKey(),
        input: INPUT,
      }),
    ).rejects.toThrow(/address mismatch/i);
  });

  it("signs, executes, and returns digest plus receipt ID", async () => {
    const keypair = Ed25519Keypair.generate();
    const tx = fakeTransaction();
    const listCoins = vi.fn(async () => ({
      objects: [{ objectId: "0xgas", version: "1", digest: "digest", balance: "200000000" }],
    }));
    const signAndExecuteTransaction = vi.fn(async () => ({
      $kind: "Transaction",
      Transaction: {
        digest: "txdigest",
        status: { success: true, error: null },
        events: [
          {
            eventType: `${PACKAGE_ID}::rental::ApplicationSubmitted`,
            json: { receipt_id: "0xreceipt" },
          },
        ],
        effects: {},
      },
    }));

    const result = await executeSubmitApplication({
      suiClient: fakeRentDelegateClient(tx),
      executionClient: { core: { listCoins, signAndExecuteTransaction } } as never,
      packageId: PACKAGE_ID,
      expectedAgentSuiAddress: keypair.toSuiAddress(),
      privateKey: keypair.getSecretKey(),
      input: INPUT,
    });

    expect(result).toEqual({ txDigest: "txdigest", receiptId: "0xreceipt" });
    expect(listCoins).toHaveBeenCalledWith({ owner: keypair.toSuiAddress(), coinType: "0x2::sui::SUI" });
    expect(tx.setGasBudget).toHaveBeenCalledWith(100_000_000n);
    expect(tx.setGasPayment).toHaveBeenCalledWith([{ objectId: "0xgas", version: "1", digest: "digest" }]);
    expect(signAndExecuteTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        signer: expect.objectContaining({}),
        include: { effects: true, events: true, objectTypes: true },
      }),
    );
  });

  it("fails before signing when no gas coin can cover the budget", async () => {
    const keypair = Ed25519Keypair.generate();
    const signAndExecuteTransaction = vi.fn();

    await expect(
      executeSubmitApplication({
        suiClient: fakeRentDelegateClient(),
        executionClient: {
          core: { listCoins: vi.fn(async () => ({ objects: [] })), signAndExecuteTransaction },
        } as never,
        packageId: PACKAGE_ID,
        expectedAgentSuiAddress: keypair.toSuiAddress(),
        privateKey: keypair.getSecretKey(),
        input: INPUT,
      }),
    ).rejects.toThrow(/No SUI gas coin/);

    expect(signAndExecuteTransaction).not.toHaveBeenCalled();
  });
});

describe("provider receipt verification handoff", () => {
  it("posts the receipt verification body to the provider API", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) =>
      Response.json({ id: "app_1", status: "accepted" }),
    );
    const provider = createProviderClient({ baseUrl: "http://provider.test", fetchImpl });

    await provider.verifyReceipt("app_1", {
      applicationId: "app_1",
      txDigest: "txdigest",
      receiptId: "0xreceipt",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://provider.test/applications/app_1/verify",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ applicationId: "app_1", txDigest: "txdigest", receiptId: "0xreceipt" }),
      }),
    );
  });
});

describe("provider reservation AgentKit headers", () => {
  const RESERVE_BODY = { mandateId: "0xmandate" };

  it("throws when neither a real nor a demo AgentKit header is configured", async () => {
    const fetchImpl = vi.fn();
    const provider = createProviderClient({ baseUrl: "http://provider.test", fetchImpl });

    await expect(provider.reserveApplication("listing_1", RESERVE_BODY)).rejects.toThrow(
      /No agentkit header configured/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends opt-in mock headers when demo AgentKit headers are configured", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: "app_1" }));
    const provider = createProviderClient({
      baseUrl: "http://provider.test",
      fetchImpl,
      demoAgentKitHeaders: {
        humanIdHash: "sha256:demo",
        agentEvmAddress: "0xevm",
        mandateAgentSuiAddress: "0xsui",
      },
    });

    await provider.reserveApplication("listing_1", RESERVE_BODY);

    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["x-demo-human-id-hash"]).toBe("sha256:demo");
    expect(headers["x-demo-agent-evm-address"]).toBe("0xevm");
    expect(headers["x-demo-mandate-agent-sui-address"]).toBe("0xsui");
    expect(headers["agentkit"]).toBeUndefined();
  });

  it("prefers a real AgentKit header over demo headers", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ id: "app_1" }));
    const provider = createProviderClient({
      baseUrl: "http://provider.test",
      fetchImpl,
      agentkitHeader: "real-header",
      demoAgentKitHeaders: { humanIdHash: "sha256:demo", agentEvmAddress: "0xevm" },
    });

    await provider.reserveApplication("listing_1", RESERVE_BODY);

    const headers = fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["agentkit"]).toBe("real-header");
    expect(headers["x-demo-human-id-hash"]).toBeUndefined();
  });
});

function fakeRentDelegateClient(tx = fakeTransaction()) {
  return {
    buildSubmitApplicationTx: vi.fn(() => tx),
  } as never;
}

function fakeExecutionClient() {
  return { core: { listCoins: vi.fn(), signAndExecuteTransaction: vi.fn() } } as never;
}

function fakeTransaction() {
  return {
    setGasBudget: vi.fn(),
    setGasPayment: vi.fn(),
    setSenderIfNotSet: vi.fn(),
    build: vi.fn(),
  };
}
