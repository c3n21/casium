/**
 * demoSession — typed localStorage wrappers for the live-demo mandate handoff.
 *
 * All reads/writes guard against SSR by checking `typeof window !== "undefined"`.
 * Keys are scoped with the `casium:` prefix so they don't collide with
 * other apps running on the same origin.
 */

import { SMOKE } from "@casium/contracts-config";

/**
 * Mandate IDs that must never be used as the live-demo default.
 * These objects predate the agent_evm binding (RD-162/RD-164) and will be
 * rejected by the provider with MANDATE_EVM_MISMATCH — their agentEvm is null.
 */
const LEGACY_SMOKE_MANDATE_IDS: Set<string> = new Set([SMOKE.mandateId]);

function isLegacySmoke(id: string | null): boolean {
  return id !== null && LEGACY_SMOKE_MANDATE_IDS.has(id);
}

const K = {
  lastMandateId: "casium:lastMandateId",
  lastOwnerCapId: "casium:lastOwnerCapId",
  lastAgentCapId: "casium:lastAgentCapId",
  lastMandateTxDigest: "casium:lastMandateTxDigest",
  lastPacketMandateId: "casium:lastPacketMandateId",
  lastPacketBlobId: "casium:lastPacketBlobId",
  lastPacketHash: "casium:lastPacketHash",
  lastSelectedListings: "casium:lastSelectedListings",
} as const;

function isClient(): boolean {
  return typeof window !== "undefined";
}

function lsGet(key: string): string | null {
  if (!isClient()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  if (!isClient()) return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore quota or security errors — the demo path degrades gracefully.
  }
}

function lsRemove(key: string): void {
  if (!isClient()) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore errors.
  }
}

export type StoredMandate = {
  mandateId: string;
  ownerCapId: string;
  agentCapId: string;
  txDigest: string;
};

export type StoredListing = {
  providerListingId: string;
  listingObjectId: string;
  /**
   * Human-facing listing ID (e.g. `porto-demo-1`), carried across the handoff so
   * `/agent` can name the selection instead of showing internal provider keys.
   * Optional: entries written before the field existed only carry the internal ID.
   */
  externalListingId?: string;
};

export const demoSession = {
  /**
   * Persist all four mandate identifiers after a successful `create_mandate` tx.
   * Call this inside a `useEffect` or event handler (client-side only).
   */
  saveMandate(mandate: StoredMandate): void {
    lsSet(K.lastMandateId, mandate.mandateId);
    lsSet(K.lastOwnerCapId, mandate.ownerCapId);
    lsSet(K.lastAgentCapId, mandate.agentCapId);
    lsSet(K.lastMandateTxDigest, mandate.txDigest);
  },

  /**
   * Restore a previously saved mandate, or return `null` if any field is missing.
   */
  loadMandate(): StoredMandate | null {
    const mandateId = lsGet(K.lastMandateId);
    const ownerCapId = lsGet(K.lastOwnerCapId);
    const agentCapId = lsGet(K.lastAgentCapId);
    const txDigest = lsGet(K.lastMandateTxDigest);
    if (!mandateId || !ownerCapId || !agentCapId || !txDigest) return null;
    return { mandateId, ownerCapId, agentCapId, txDigest };
  },

  /**
   * Persist the mandate ID associated with an uploaded packet.
   * Written in the `onComplete` callback of PacketBuilder on the renter page.
   */
  savePacket(mandateId: string, blobId: string, packetHash: string): void {
    lsSet(K.lastPacketMandateId, mandateId);
    lsSet(K.lastPacketBlobId, blobId);
    lsSet(K.lastPacketHash, packetHash);
  },

  /** Mandate ID whose packet was most recently uploaded. Used by `/agent` as priority-2 source.
   *  Returns null when the stored value is a legacy smoke mandate — those have agentEvm=null and
   *  will always fail MANDATE_EVM_MISMATCH with a live AgentKit signer.
   */
  getLastPacketMandateId(): string | null {
    const id = lsGet(K.lastPacketMandateId);
    if (isLegacySmoke(id)) return null;
    return id;
  },

  /** Most recently created mandate ID. Used by `/agent` as priority-3 source.
   *  Returns null when the stored value is a legacy smoke mandate.
   */
  getLastMandateId(): string | null {
    const id = lsGet(K.lastMandateId);
    if (isLegacySmoke(id)) return null;
    return id;
  },

  /** Clear all mandate fields from localStorage (e.g. after revocation). */
  clearMandate(): void {
    lsRemove(K.lastMandateId);
    lsRemove(K.lastOwnerCapId);
    lsRemove(K.lastAgentCapId);
    lsRemove(K.lastMandateTxDigest);
  },

  /** Clear all packet handoff fields from localStorage. */
  clearPacket(): void {
    lsRemove(K.lastPacketMandateId);
    lsRemove(K.lastPacketBlobId);
    lsRemove(K.lastPacketHash);
    lsRemove(K.lastSelectedListings);
  },

  /** Persist the selected listings for the multi-listing agent handoff. */
  saveListings(listings: StoredListing[]): void {
    lsSet(K.lastSelectedListings, JSON.stringify(listings));
  },

  /** Restore previously saved listings. Returns [] on missing key or parse error. */
  loadListings(): StoredListing[] {
    const raw = lsGet(K.lastSelectedListings);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as StoredListing[];
    } catch {
      return [];
    }
  },

  /** Clear the selected-listings key from localStorage. */
  clearListings(): void {
    lsRemove(K.lastSelectedListings);
  },
} as const;
