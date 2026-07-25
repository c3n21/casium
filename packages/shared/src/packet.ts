import { z } from "zod";

export const PacketDocumentSchema = z.object({
  type: z.literal("rental_application_packet"),
  version: z.literal(1),
  synthetic: z.literal(true),
  renterName: z.string().min(1),
  nationalId: z.string().min(1),
  payslipMonthlyNetEur: z.number().int().positive(),
  employerName: z.string().min(1),
  employmentType: z.enum(["permanent", "fixed-term", "self-employed", "freelance"]),
  referenceName: z.string().min(1),
  referenceRelation: z.string().min(1),
  coverLetter: z.string().min(1),
  proofOfFundsEur: z.number().int().nonnegative().optional(),
  createdAtMs: z.number().int().positive(),
});

export type PacketDocument = z.infer<typeof PacketDocumentSchema>;

export const SYNTHETIC_PACKET_DEFAULTS: PacketDocument = {
  type: "rental_application_packet",
  version: 1,
  synthetic: true,
  renterName: "Alice Demo",
  nationalId: "SYNTHETIC-ID-0000",
  payslipMonthlyNetEur: 3200,
  employerName: "Demo Corp Lda.",
  employmentType: "permanent",
  referenceName: "Bob Previous-Landlord",
  referenceRelation: "previous landlord",
  coverLetter:
    "I am a reliable tenant with stable employment. This is a synthetic demo document — no real identity data is included.",
  proofOfFundsEur: 9600,
  createdAtMs: 0,
};

export function makeSyntheticPacket(overrides?: Partial<PacketDocument>): PacketDocument {
  return PacketDocumentSchema.parse({
    ...SYNTHETIC_PACKET_DEFAULTS,
    ...overrides,
    createdAtMs: overrides?.createdAtMs ?? Date.now(),
  });
}
