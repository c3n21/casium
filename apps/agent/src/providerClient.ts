import { ReserveApplicationSchema } from "@rentdelegate/shared";
import type { VerifyReceiptInput } from "@rentdelegate/shared";
import type { ReservedApplication } from "./types.js";

export type ProviderClientOptions = {
  baseUrl: string;
  /** Pre-built agentkit header value to attach to reservation requests. */
  agentkitHeader?: string;
};

export function createProviderClient(options: ProviderClientOptions) {
  const { baseUrl, agentkitHeader } = options;

  async function post<T>(path: string, body: unknown, requireAgentKit = false): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" };

    if (requireAgentKit && agentkitHeader) {
      headers["agentkit"] = agentkitHeader;
    } else if (requireAgentKit) {
      // Fall back to demo mock headers when no real AgentKit header is configured.
      // In production, this path must not be reached without a real header.
      throw new Error(
        "No agentkit header configured. Provide AGENTKIT_HEADER env or a real AgentKit signer.",
      );
    }

    const response = await fetch(`${baseUrl}${path}`, {
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
    const response = await fetch(`${baseUrl}${path}`);
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
  };
}

export type ProviderClient = ReturnType<typeof createProviderClient>;
