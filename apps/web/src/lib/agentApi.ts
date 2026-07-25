/**
 * Agent API client — shared constant and identity fetch (RD-163).
 *
 * The mandate form fetches from GET /identity on mount so the renter never has
 * to type either address. The agent page imports AGENT_API directly so the
 * constant stays in one place.
 *
 * NOTE: A fetched identity is not verified. The agent service asserts its own
 * addresses. Real enforcement happens at the provider's reserve endpoint (RD-164).
 */

export const AGENT_API =
  process.env.NEXT_PUBLIC_AGENT_API_URL ?? "http://localhost:4022";

export type AgentIdentity = {
  agentSuiAddress: string;
  /** Null when neither a live EVM key nor AGENTKIT_DEMO_AGENT_EVM_ADDRESS is set. */
  agentEvmAddress: string | null;
  agentkitMode: "live-signing" | "live-header" | "mock" | "none";
  packageId: string;
};

export type AgentIdentityResult =
  | { ok: true; identity: AgentIdentity }
  | { ok: false; reason: string };

/**
 * Fetch the agent identity pair from GET /identity.
 * Returns an error result (never throws) so the form can render a specific
 * "agent unreachable" state without crashing.
 */
export async function fetchAgentIdentity(): Promise<AgentIdentityResult> {
  try {
    const res = await fetch(`${AGENT_API}/identity`);
    if (!res.ok) {
      return { ok: false, reason: `Agent returned HTTP ${res.status}` };
    }
    const data = (await res.json()) as AgentIdentity;
    return { ok: true, identity: data };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "Could not reach agent service",
    };
  }
}
