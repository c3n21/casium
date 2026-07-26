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
  /**
   * Mints an AgentKit header for a given absolute URL. Preferred over a static
   * header: the provider validates the signature against the exact request URL,
   * so one header cannot cover more than one endpoint.
   */
  createAgentkitHeader?: (url: string) => Promise<string>;
  fetchImpl?: typeof fetch;
};

export function createProviderClient(options: ProviderClientOptions) {
  const { baseUrl, agentkitHeader, demoAgentKitHeaders, createAgentkitHeader, fetchImpl = fetch } =
    options;

  async function post<T>(path: string, body: unknown, requireAgentKit = false): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const url = `${baseUrl}${path}`;

    if (requireAgentKit && agentkitHeader) {
      headers["agentkit"] = agentkitHeader;
    } else if (requireAgentKit && createAgentkitHeader) {
      headers["agentkit"] = await createAgentkitHeader(url);
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
        "No AgentKit credentials configured. Set AGENT_EVM_PRIVATE_KEY (live signing), " +
          "AGENTKIT_HEADER (a pre-signed header), or the AGENTKIT_DEMO_* pair against a " +
          "provider running AGENTKIT_MODE=mock.",
      );
    }

    const response = await fetchImpl(url, {
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

    async getPacketForListing(mandateId: string, providerListingId: string): Promise<PacketRecord | null> {
      const response = await fetchImpl(
        `${baseUrl}/packets/${encodeURIComponent(mandateId)}/${encodeURIComponent(providerListingId)}`,
        { headers: { "content-type": "application/json" } },
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`getPacketForListing failed: ${response.status}`);
      return response.json() as Promise<PacketRecord>;
    },
  };
}

export type ProviderClient = ReturnType<typeof createProviderClient>;
