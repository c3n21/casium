import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { packets as packetsTable } from "../db/schema.js";

const PacketRecordSchema = z.object({
  mandateId: z.string().min(1),
  providerListingId: z.string().min(1).default("listing_lisbon_eligible"),
  walrusBlobId: z.string().min(1),
  packetHash: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  encryptionMode: z.enum(["aes-gcm", "seal", "mock"]),
});

export type PacketRecord = z.infer<typeof PacketRecordSchema> & {
  registeredAtMs: number;
};

/**
 * In-memory fallback, used when no Db is injected (tests, PROVIDER_STORE=memory).
 * Module-level so it survives app re-creation inside one process — but not a
 * process restart, which is exactly why the Postgres path exists.
 *
 * Key is `${mandateId}:${providerListingId}`.
 */
const packetStore = new Map<string, PacketRecord>();

function storeKey(mandateId: string, providerListingId: string): string {
  return `${mandateId}:${providerListingId}`;
}

function rowToRecord(row: {
  mandateId: string;
  providerListingId: string;
  walrusBlobId: string;
  packetHash: string;
  sizeBytes: number;
  encryptionMode: string;
  registeredAtMs: number;
}): PacketRecord {
  return {
    mandateId: row.mandateId,
    providerListingId: row.providerListingId,
    walrusBlobId: row.walrusBlobId,
    packetHash: row.packetHash,
    sizeBytes: row.sizeBytes,
    encryptionMode: row.encryptionMode as PacketRecord["encryptionMode"],
    registeredAtMs: row.registeredAtMs,
  };
}

export function createPacketRoutes(db?: Db) {
  const router = new Hono();

  async function put(record: PacketRecord): Promise<void> {
    if (!db) {
      packetStore.set(storeKey(record.mandateId, record.providerListingId), record);
      return;
    }

    // One packet per (mandate, listing): a re-upload replaces the previous record.
    await db
      .insert(packetsTable)
      .values(record)
      .onConflictDoUpdate({
        target: [packetsTable.mandateId, packetsTable.providerListingId],
        set: {
          walrusBlobId: record.walrusBlobId,
          packetHash: record.packetHash,
          sizeBytes: record.sizeBytes,
          encryptionMode: record.encryptionMode,
          registeredAtMs: record.registeredAtMs,
        },
      });
  }

  /**
   * Exact lookup by (mandateId, providerListingId).
   */
  async function getExact(
    mandateId: string,
    providerListingId: string,
  ): Promise<PacketRecord | null> {
    if (!db) return packetStore.get(storeKey(mandateId, providerListingId)) ?? null;

    const [row] = await db
      .select()
      .from(packetsTable)
      .where(
        and(
          eq(packetsTable.mandateId, mandateId),
          eq(packetsTable.providerListingId, providerListingId),
        ),
      );
    if (!row) return null;
    return rowToRecord(row);
  }

  /**
   * List all packets stored for a given mandateId.
   */
  async function listByMandate(mandateId: string): Promise<PacketRecord[]> {
    if (!db) {
      const prefix = `${mandateId}:`;
      return [...packetStore.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([, record]) => record);
    }

    const rows = await db
      .select()
      .from(packetsTable)
      .where(eq(packetsTable.mandateId, mandateId));
    return rows.map(rowToRecord);
  }

  // ── Routes ──────────────────────────────────────────────────────────────────

  router.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = PacketRecordSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "INVALID_PACKET_RECORD" }, 422);

    const record: PacketRecord = { ...parsed.data, registeredAtMs: Date.now() };
    await put(record);
    return c.json(record, 201);
  });

  /**
   * List all packets for a mandate. Must be declared before `/:mandateId` so
   * the static segment "by-mandate" is not captured as a mandateId param.
   */
  router.get("/by-mandate/:mandateId", async (c) => {
    const records = await listByMandate(c.req.param("mandateId"));
    return c.json({ packets: records });
  });

  /**
   * Exact lookup by mandateId + providerListingId.
   */
  router.get("/:mandateId/:providerListingId", async (c) => {
    const record = await getExact(
      c.req.param("mandateId"),
      c.req.param("providerListingId"),
    );
    if (!record) return c.json({ error: "PACKET_NOT_FOUND" }, 404);
    return c.json(record);
  });

  /**
   * Backward-compat: returns the "listing_lisbon_eligible" packet for a mandate.
   * In memory mode, also falls back to the first packet found for the mandate.
   */
  router.get("/:mandateId", async (c) => {
    const mandateId = c.req.param("mandateId");
    const DEFAULT_LISTING = "listing_lisbon_eligible";

    if (!db) {
      // Try the canonical default key first; then fall back to the first key
      // that starts with this mandateId (supports older records uploaded without
      // an explicit providerListingId).
      const direct = packetStore.get(storeKey(mandateId, DEFAULT_LISTING));
      if (direct) return c.json(direct);

      const prefix = `${mandateId}:`;
      for (const [key, record] of packetStore) {
        if (key.startsWith(prefix)) return c.json(record);
      }
      return c.json({ error: "PACKET_NOT_FOUND" }, 404);
    }

    const record = await getExact(mandateId, DEFAULT_LISTING);
    if (!record) return c.json({ error: "PACKET_NOT_FOUND" }, 404);
    return c.json(record);
  });

  return router;
}
