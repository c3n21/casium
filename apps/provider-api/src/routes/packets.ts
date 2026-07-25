import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { packets as packetsTable } from "../db/schema.js";

const PacketRecordSchema = z.object({
  mandateId: z.string().min(1),
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
 */
const packetStore = new Map<string, PacketRecord>(); // mandateId -> record

export function createPacketRoutes(db?: Db) {
  const router = new Hono();

  async function put(record: PacketRecord): Promise<void> {
    if (!db) {
      packetStore.set(record.mandateId, record);
      return;
    }

    // One packet per mandate: a re-upload replaces the previous record.
    await db
      .insert(packetsTable)
      .values(record)
      .onConflictDoUpdate({
        target: packetsTable.mandateId,
        set: {
          walrusBlobId: record.walrusBlobId,
          packetHash: record.packetHash,
          sizeBytes: record.sizeBytes,
          encryptionMode: record.encryptionMode,
          registeredAtMs: record.registeredAtMs,
        },
      });
  }

  async function get(mandateId: string): Promise<PacketRecord | null> {
    if (!db) return packetStore.get(mandateId) ?? null;

    const [row] = await db.select().from(packetsTable).where(eq(packetsTable.mandateId, mandateId));
    if (!row) return null;

    return {
      mandateId: row.mandateId,
      walrusBlobId: row.walrusBlobId,
      packetHash: row.packetHash,
      sizeBytes: row.sizeBytes,
      encryptionMode: row.encryptionMode as PacketRecord["encryptionMode"],
      registeredAtMs: row.registeredAtMs,
    };
  }

  router.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = PacketRecordSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "INVALID_PACKET_RECORD" }, 422);

    const record: PacketRecord = { ...parsed.data, registeredAtMs: Date.now() };
    await put(record);
    return c.json(record, 201);
  });

  router.get("/:mandateId", async (c) => {
    const record = await get(c.req.param("mandateId"));
    if (!record) return c.json({ error: "PACKET_NOT_FOUND" }, 404);
    return c.json(record);
  });

  return router;
}
