import { ReserveApplicationSchema } from "@rentdelegate/shared";
import type { VerifyReceiptInput } from "@rentdelegate/shared";
import type { ReservedApplication } from "./types.js";

export type PacketRecord = {
  mandateId: string;
  walrusBlobId: string;
  packetHash: string;
  sizeBytes: number;
  encryptionMode: "aes-gcm" | "seal" | "mock";
  registeredAtMs: number;
};

/**
 * Mock-mode headers understood by a provider API running AGENTKIT_MODE=mock.
 * These prove nothing about World: they are only for local Sui-focused smokes.
 */
export type DemoAgentKitHeaders = {
  humanIdHash: string;
  agentEvmAddress: string;
  mandateAgentSuiAddress?: string;
};

export type ProviderClientOptions = {
  baseUrl: string;
  /** Pre-built agentkit header value to attach to reservation requests. */
  agentkitHeader?: string;
  /** Opt-in mock-AgentKit headers. Ignored whenever a real agentkitHeader is set. */
  demoAgentKitHeaders?: DemoAgentKitHeaders;
  fetchImpl?: typeof fetch;
};

export function createProviderClient(options: ProviderClientOptions) {
  const { baseUrl, agentkitHeader, demoAgentKitHeaders, fetchImpl = fetch } = options;

  async function post<T>(path: string, body: unknown, requireAgentKit = false): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };

    if (requireAgentKit && agentkitHeader) {
      headers["agentkit"] = agentkitHeader;
    } else if (requireAgentKit && demoAgentKitHeaders) {
      // Mock-AgentKit path: only accepted by a provider started with AGENTKIT_MODE=mock.
      // Must stay opt-in so a real run can never silently degrade to unverified World context.
      headers["x-demo-human-id-hash"] = demoAgentKitHeaders.humanIdHash;
      headers["x-demo-agent-evm-address"] = demoAgentKitHeaders.agentEvmAddress;
      if (demoAgentKitHeaders.mandateAgentSuiAddress) {
        headers["x-demo-mandate-agent-sui-address"] = demoAgentKitHeaders.mandateAgentSuiAddress;
      }
    } else if (requireAgentKit) {
      throw new Error(
        "No agentkit header configured. Provide AGENTKIT_HEADER env or a real AgentKit signer.",
      );
    }

    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const json = (await response.json()) as T;

    if (!response.ok) {
      const err = json as { error?: string };
      throw new Error(`Provider API ${path} returned ${response.status}: ${err.error ?? "unknown"}`);
    }

    return json;
  }

  async function get<T>(path: string): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`);
    const json = (await response.json()) as T;
    if (!response.ok) throw new Error(`Provider API GET ${path} returned ${response.status}`);
    return json;
  }

  return {
    async reserveApplication(listingId: string, body: unknown): Promise<ReservedApplication> {
      return post<ReservedApplication>(`/listings/${listingId}/applications`, body, true);
    },

    async getApplication(applicationId: string): Promise<ReservedApplication> {
      return get<ReservedApplication>(`/applications/${applicationId}`);
    },

    async verifyReceipt(applicationId: string, input: VerifyReceiptInput): Promise<ReservedApplication> {
      return post<ReservedApplication>(`/applications/${applicationId}/verify`, input);
    },

    async getPacketForMandate(mandateId: string): Promise<PacketRecord | null> {
      const response = await fetchImpl(
        `${baseUrl}/packets/${encodeURIComponent(mandateId)}`,
        { headers: { "content-type": "application/json" } },
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`getPacketForMandate failed: ${response.status}`);
      return response.json() as Promise<PacketRecord>;
    },
  };
}

export type ProviderClient = ReturnType<typeof createProviderClient>;
