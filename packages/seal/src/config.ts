import type { KeyServerConfig } from "@mysten/seal";

export type { KeyServerConfig };

/**
 * Default threshold: require at least 2 of the configured key servers to
 * respond before decryption succeeds. This distributes trust and prevents a
 * single server from being a point of compromise.
 *
 * A threshold of 1 is acceptable for local development only.
 */
export const DEFAULT_THRESHOLD = 2;

/**
 * Mysten Labs open-mode testnet key servers.
 *
 * Object IDs are the authoritative on-chain references; the servers hold their
 * own URLs as on-chain fields, so these IDs are stable even when server URLs
 * rotate.
 *
 * Source: https://seal-docs.wal.app/Pricing (Verified independent server type
 * key servers, Testnet section)
 */
export const MYSTEN_TESTNET_KEY_SERVERS: KeyServerConfig[] = [
  {
    objectId:
      "0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75",
    weight: 1,
  },
  {
    objectId:
      "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8",
    weight: 1,
  },
];

/**
 * Resolve the key server configs to use at runtime.
 *
 * Order of precedence:
 *  1. `SEAL_KEY_SERVER_IDS` env var — comma-separated list of Sui object IDs.
 *  2. The two Mysten Labs open-mode testnet servers above.
 *
 * The env var is provided to allow overriding in tests or for deployments that
 * have arranged a different set of key servers (e.g. permissioned servers for
 * production, or a single server for local dev with threshold 1).
 */
export function getKeyServerConfigs(): KeyServerConfig[] {
  const envIds = process.env.SEAL_KEY_SERVER_IDS?.split(",").filter(Boolean);
  if (envIds && envIds.length > 0) {
    return envIds.map((id) => ({ objectId: id.trim(), weight: 1 }));
  }
  return MYSTEN_TESTNET_KEY_SERVERS;
}
