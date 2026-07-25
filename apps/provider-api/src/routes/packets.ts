import { Hono } from "hono";
import { z } from "zod";

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

const packetStore = new Map<string, PacketRecord>(); // mandateId -> record

export function createPacketRoutes() {
  const router = new Hono();

  router.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = PacketRecordSchema.safeParse(body);
    if (!parsed.success) return c.json({ error: "INVALID_PACKET_RECORD" }, 422);
    const record: PacketRecord = { ...parsed.data, registeredAtMs: Date.now() };
    packetStore.set(parsed.data.mandateId, record);
    return c.json(record, 201);
  });

  router.get("/:mandateId", (c) => {
    const record = packetStore.get(c.req.param("mandateId"));
    if (!record) return c.json({ error: "PACKET_NOT_FOUND" }, 404);
    return c.json(record);
  });

  return router;
}
