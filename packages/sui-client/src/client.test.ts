import { describe, expect, it, vi } from "vitest";
import { createCasiumClient } from "./client.js";
import type { CasiumConfig } from "./types.js";

const config: CasiumConfig = {
  network: "testnet",
  rpcUrl: "https://fullnode.testnet.sui.io:443",
  packageId: "0xpackage",
};

const AGENT_ADDRESS = "0xagent";
const MANDATE_ID = "0xmandate";
const CAP_ID = "0xcap";

function makeListOwnedResponse(caps: Array<{ objectId: string; mandateId: string }>) {
  return {
    objects: caps.map((cap) => ({
      objectId: cap.objectId,
      json: {
        mandate_id: { id: cap.mandateId },
        agent_sui: AGENT_ADDRESS,
      },
    })),
    cursor: null,
    hasNextPage: false,
  };
}

function makeMockSuiClient(listOwnedResult: ReturnType<typeof makeListOwnedResponse>) {
  return {
    core: {
      listOwnedObjects: vi.fn(async () => listOwnedResult),
    },
  } as never;
}

describe("findAgentCapForMandate", () => {
  it("returns null when agent owns no AgentCap for the mandate", async () => {
    const mockClient = makeMockSuiClient(makeListOwnedResponse([]));
    const client = createCasiumClient(config, mockClient);

    const result = await client.findAgentCapForMandate(MANDATE_ID, AGENT_ADDRESS);
    expect(result).toBeNull();
  });

  it("returns the object ID of the matching AgentCap", async () => {
    const mockClient = makeMockSuiClient(
      makeListOwnedResponse([{ objectId: CAP_ID, mandateId: MANDATE_ID }]),
    );
    const client = createCasiumClient(config, mockClient);

    const result = await client.findAgentCapForMandate(MANDATE_ID, AGENT_ADDRESS);
    expect(result).toBe(CAP_ID);
  });

  it("ignores caps for other mandates", async () => {
    const mockClient = makeMockSuiClient(
      makeListOwnedResponse([
        { objectId: "0xcap_other", mandateId: "0xother_mandate" },
        { objectId: CAP_ID, mandateId: MANDATE_ID },
      ]),
    );
    const client = createCasiumClient(config, mockClient);

    const result = await client.findAgentCapForMandate(MANDATE_ID, AGENT_ADDRESS);
    expect(result).toBe(CAP_ID);
  });

  it("throws when multiple caps match the same mandate", async () => {
    const mockClient = makeMockSuiClient(
      makeListOwnedResponse([
        { objectId: "0xcap1", mandateId: MANDATE_ID },
        { objectId: "0xcap2", mandateId: MANDATE_ID },
      ]),
    );
    const client = createCasiumClient(config, mockClient);

    await expect(client.findAgentCapForMandate(MANDATE_ID, AGENT_ADDRESS)).rejects.toThrow(
      /Ambiguous AgentCap/,
    );
  });

  it("accepts string-typed mandate_id fields (non-object form)", async () => {
    const mockClient = {
      core: {
        listOwnedObjects: vi.fn(async () => ({
          objects: [
            {
              objectId: CAP_ID,
              json: { mandate_id: MANDATE_ID, agent_sui: AGENT_ADDRESS },
            },
          ],
          cursor: null,
          hasNextPage: false,
        })),
      },
    } as never;
    const client = createCasiumClient(config, mockClient);

    const result = await client.findAgentCapForMandate(MANDATE_ID, AGENT_ADDRESS);
    expect(result).toBe(CAP_ID);
  });

  it("queries with the correct type filter and owner", async () => {
    const listOwnedObjects = vi.fn(async () => ({
      objects: [],
      cursor: null,
      hasNextPage: false,
    }));
    const mockClient = { core: { listOwnedObjects } } as never;
    const client = createCasiumClient(config, mockClient);

    await client.findAgentCapForMandate(MANDATE_ID, AGENT_ADDRESS);

    expect(listOwnedObjects).toHaveBeenCalledWith({
      owner: AGENT_ADDRESS,
      type: `${config.packageId}::rental::AgentCap`,
      include: { json: true },
    });
  });
});
