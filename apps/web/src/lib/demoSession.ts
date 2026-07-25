/**
 * demoSession — typed localStorage wrappers for the live-demo mandate handoff.
 *
 * All reads/writes guard against SSR by checking `typeof window !== "undefined"`.
 * Keys are scoped with the `rentdelegate:` prefix so they don't collide with
 * other apps running on the same origin.
 */

const K = {
  lastMandateId: "rentdelegate:lastMandateId",
  lastOwnerCapId: "rentdelegate:lastOwnerCapId",
  lastAgentCapId: "rentdelegate:lastAgentCapId",
  lastMandateTxDigest: "rentdelegate:lastMandateTxDigest",
  lastPacketMandateId: "rentdelegate:lastPacketMandateId",
  lastPacketBlobId: "rentdelegate:lastPacketBlobId",
  lastPacketHash: "rentdelegate:lastPacketHash",
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

export type StoredMandate = {
  mandateId: string;
  ownerCapId: string;
  agentCapId: string;
  txDigest: string;
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

  /** Mandate ID whose packet was most recently uploaded. Used by `/agent` as priority-2 source. */
  getLastPacketMandateId(): string | null {
    return lsGet(K.lastPacketMandateId);
  },

  /** Most recently created mandate ID. Used by `/agent` as priority-3 source. */
  getLastMandateId(): string | null {
    return lsGet(K.lastMandateId);
  },
} as const;
