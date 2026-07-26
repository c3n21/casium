/**
 * Live World AgentKit signing for the agent.
 *
 * The provider validates the header against the *exact* request URL
 * (`validateAgentkitMessage(payload, c.req.url)`) and the payload carries a nonce and
 * an issue time. A single pre-signed `AGENTKIT_HEADER` therefore only works for one
 * endpoint until it expires — fine for a manual curl, useless for an agent that must
 * reserve against whichever listing it was pointed at, on whichever host it runs.
 *
 * So mint a header per request. Note this deliberately does *not* use the client's
 * auto-negotiating `fetch`: that path waits for the server to advertise an AgentKit
 * challenge, and this provider verifies with the low-level helpers instead of the
 * resource-server extension, so it never advertises one and no header is ever sent.
 *
 * The extension shape mirrors `scripts/agentkit-live-request.html`, which is the
 * reference implementation that was verified against AgentBook by hand.
 */

import { buildAgentkitSchema, createAgentkitClient } from "@worldcoin/agentkit";
import { Wallet } from "ethers";

/** World Chain mainnet — where AgentBook registrations live. */
const DEFAULT_CHAIN_ID = "eip155:480";

export type AgentkitSignerInfo = {
  /** EVM address derived from the key — must be the AgentBook-registered address. */
  address: string;
  chainId: string;
  /** Mint an AgentKit header bound to this exact absolute URL. */
  createHeader(url: string): Promise<string>;
};

/**
 * Build an AgentKit header signer from an EVM private key.
 * Returns null when no key is configured, so callers fall back to their existing
 * header or mock paths rather than failing at startup.
 */
export function createAgentkitSigner(
  privateKey = process.env.AGENT_EVM_PRIVATE_KEY,
  chainId = process.env.AGENTKIT_CHAIN_ID ?? DEFAULT_CHAIN_ID,
): AgentkitSignerInfo | null {
  if (!privateKey) return null;

  let wallet: Wallet;
  try {
    wallet = new Wallet(privateKey);
  } catch (err) {
    throw new Error(
      `AGENT_EVM_PRIVATE_KEY is not a valid EVM private key: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const client = createAgentkitClient({
    signer: {
      address: wallet.address,
      chainId,
      type: "eip191",
      signMessage: (message: string) => wallet.signMessage(message),
    },
  });

  return {
    address: wallet.address,
    chainId,
    async createHeader(url: string): Promise<string> {
      const parsed = new URL(url);
      return client.createHeader({
        info: {
          domain: parsed.hostname,
          uri: url,
          statement: "Verify a World human-backed agent request for Casium.",
          version: "1",
          nonce: randomHex(16),
          issuedAt: new Date().toISOString(),
          resources: [url],
        },
        supportedChains: [{ chainId, type: "eip191" }],
        schema: buildAgentkitSchema(),
      });
    },
  };
}

function randomHex(byteLength: number): string {
  return [...crypto.getRandomValues(new Uint8Array(byteLength))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
