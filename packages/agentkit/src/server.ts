import { createHash } from "node:crypto";
import {
  createAgentBookVerifier,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
} from "@worldcoin/agentkit";

export type AgentKitContext = {
  mode: "real-agentkit" | "mock-agentkit";
  humanIdHash: string;
  agentEvmAddress: string;
  mandateAgentSuiAddress?: string;
};

export type AgentKitVerificationResult =
  | { ok: true; context: AgentKitContext }
  | { ok: false; error: "AGENTKIT_UNVERIFIED" };

export type AgentKitVerifier = {
  verify(request: Request, resourceUri: string): Promise<AgentKitVerificationResult>;
};

export function hashHumanId(humanId: string, salt = process.env.AGENTKIT_HUMAN_ID_SALT): string {
  const hash = createHash("sha256");

  if (salt) {
    hash.update(salt);
    hash.update(":");
  }

  hash.update(humanId);
  return `sha256:${hash.digest("hex")}`;
}

export function createMockAgentKitVerifier(): AgentKitVerifier {
  return {
    async verify(request) {
      const humanIdHash = request.headers.get("x-demo-human-id-hash");
      const agentEvmAddress = request.headers.get("x-demo-agent-evm-address");
      const mandateAgentSuiAddress = request.headers.get("x-demo-mandate-agent-sui-address") ?? undefined;

      if (!humanIdHash || !agentEvmAddress) {
        return { ok: false, error: "AGENTKIT_UNVERIFIED" };
      }

      return {
        ok: true,
        context: {
          mode: "mock-agentkit",
          humanIdHash,
          agentEvmAddress,
          ...(mandateAgentSuiAddress ? { mandateAgentSuiAddress } : {}),
        },
      };
    },
  };
}

export function createRealAgentKitVerifier(): AgentKitVerifier {
  const agentBook = createAgentBookVerifier();

  return {
    async verify(request, resourceUri) {
      const header = request.headers.get("agentkit");

      if (!header) {
        debugAgentKit("missing agentkit header");
        return { ok: false, error: "AGENTKIT_UNVERIFIED" };
      }

      try {
        const payload = parseAgentkitHeader(header);
        const validation = await validateAgentkitMessage(payload, resourceUri);

        if (!validation.valid) {
          debugAgentKit("message validation failed", validation.error);
          return { ok: false, error: "AGENTKIT_UNVERIFIED" };
        }

        const signature = await verifyAgentkitSignature(payload, process.env.AGENTKIT_EVM_RPC_URL);

        if (!signature.valid || !signature.address) {
          debugAgentKit("signature verification failed", signature.error);
          return { ok: false, error: "AGENTKIT_UNVERIFIED" };
        }

        const humanId = await agentBook.lookupHuman(signature.address);

        if (!humanId) {
          debugAgentKit("agentbook lookup failed", signature.address);
          return { ok: false, error: "AGENTKIT_UNVERIFIED" };
        }

        return {
          ok: true,
          context: {
            mode: "real-agentkit",
            humanIdHash: hashHumanId(humanId),
            agentEvmAddress: signature.address,
          },
        };
      } catch (error) {
        debugAgentKit("verification threw", error instanceof Error ? error.message : String(error));
        return { ok: false, error: "AGENTKIT_UNVERIFIED" };
      }
    },
  };
}

function debugAgentKit(message: string, detail?: string) {
  if (process.env.AGENTKIT_DEBUG === "1") {
    console.error(`[agentkit] ${message}${detail ? `: ${detail}` : ""}`);
  }
}

export function createAgentKitVerifier(mode = process.env.AGENTKIT_MODE): AgentKitVerifier {
  return mode === "real" ? createRealAgentKitVerifier() : createMockAgentKitVerifier();
}
