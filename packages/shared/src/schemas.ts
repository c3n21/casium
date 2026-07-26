import { z } from "zod";

const suiObjectIdSchema = z.string().regex(/^0x[a-fA-F0-9]+$/, "Expected a Sui object ID");
export const suiAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{1,64}$/, "Expected a Sui address with 1 to 64 hex characters")
  .refine((value) => value.slice(2).length !== 40, {
    message: "Expected a Sui address, but this looks like a 40-hex EVM address",
  })
  .transform(normalizeSuiAddress);
const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Expected an EVM address");
const hexHashSchema = z.string().regex(/^0x[a-fA-F0-9]+$/, "Expected a hex hash");

export function normalizeSuiAddress(address: string): string {
  return `0x${address.slice(2).toLowerCase().padStart(64, "0")}`;
}

export const CreateMandateSchema = z.object({
  agentSuiAddress: suiAddressSchema,
  agentEvmAddress: evmAddressSchema,
  maxMonthlyRentEur: z.number().int().positive(),
  allowedMunicipalities: z.array(z.number().int().positive()).min(1),
  minBedrooms: z.number().int().min(0),
  expiresAtMs: z.number().int().positive(),
  remainingApplications: z.number().int().positive(),
  permittedActions: z.number().int().nonnegative(),
});

export const ListingSchema = z.object({
  id: z.string().min(1),
  listingObjectId: suiObjectIdSchema,
  externalListingId: z.string().min(1),
  providerSuiAddress: suiAddressSchema,
  landlordSuiAddress: suiAddressSchema,
  municipalityCode: z.number().int().positive(),
  monthlyRentEur: z.number().int().positive(),
  bedrooms: z.number().int().min(0),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});

export const ReserveApplicationSchema = z.object({
  mandateId: suiObjectIdSchema,
  listingObjectId: suiObjectIdSchema,
  agentSuiAddress: suiAddressSchema,
  agentEvmAddress: evmAddressSchema,
  walrusBlobId: z.string().min(1),
  packetHash: hexHashSchema,
  accessExpiresAtMs: z.number().int().positive(),
  idempotencyKey: z.string().uuid(),
});

export const VerifyReceiptSchema = z.object({
  applicationId: z.string().min(1),
  txDigest: z.string().min(1),
  receiptId: suiObjectIdSchema,
});

export type CreateMandateInput = z.infer<typeof CreateMandateSchema>;
export type Listing = z.infer<typeof ListingSchema>;
export type ReserveApplicationInput = z.infer<typeof ReserveApplicationSchema>;
export type VerifyReceiptInput = z.infer<typeof VerifyReceiptSchema>;
