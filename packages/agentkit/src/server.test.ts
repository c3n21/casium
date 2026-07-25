import { describe, expect, it } from "vitest";
import { createMockAgentKitVerifier, hashHumanId } from "./server.js";

describe("AgentKit server helpers", () => {
  it("hashes raw human IDs immediately", () => {
    expect(hashHumanId("human-1")).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hashHumanId("human-1")).toBe(hashHumanId("human-1"));
  });

  it("verifies explicit mock AgentKit headers", async () => {
    const verifier = createMockAgentKitVerifier();
    const request = new Request("https://provider.test/listings/listing/applications", {
      headers: {
        "x-demo-human-id-hash": "sha256:human",
        "x-demo-agent-evm-address": "0x1111111111111111111111111111111111111111",
        "x-demo-mandate-agent-sui-address": "0xabc",
      },
    });

    await expect(verifier.verify(request, request.url)).resolves.toEqual({
      ok: true,
      context: {
        mode: "mock-agentkit",
        humanIdHash: "sha256:human",
        agentEvmAddress: "0x1111111111111111111111111111111111111111",
        mandateAgentSuiAddress: "0xabc",
      },
    });
  });

  it("rejects missing mock AgentKit headers", async () => {
    const verifier = createMockAgentKitVerifier();
    const request = new Request("https://provider.test/listings/listing/applications");

    await expect(verifier.verify(request, request.url)).resolves.toEqual({
      ok: false,
      error: "AGENTKIT_UNVERIFIED",
    });
  });
});
