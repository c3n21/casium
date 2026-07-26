import { bigint, boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex } from "drizzle-orm/pg-core";

export const listings = pgTable("listings", {
  id: text("id").primaryKey(),
  suiListingId: text("sui_listing_id").notNull().unique(),
  externalListingId: text("external_listing_id").notNull(),
  providerSuiAddress: text("provider_sui_address").notNull(),
  landlordSuiAddress: text("landlord_sui_address").notNull(),
  municipalityCode: bigint("municipality_code", { mode: "number" }).notNull(),
  monthlyRentEur: bigint("monthly_rent_eur", { mode: "number" }).notNull(),
  bedrooms: integer("bedrooms").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const applications = pgTable(
  "applications",
  {
    id: text("id").primaryKey(),
    listingId: text("listing_id").notNull().references(() => listings.id),
    mandateId: text("mandate_id").notNull(),
    agentSuiAddress: text("agent_sui_address").notNull(),
    agentEvmAddress: text("agent_evm_address").notNull(),
    humanIdHash: text("human_id_hash").notNull(),
    walrusBlobId: text("walrus_blob_id").notNull(),
    packetHash: text("packet_hash").notNull(),
    status: text("status").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("applications_agent_idempotency_unique").on(table.agentEvmAddress, table.idempotencyKey)],
);

export const humanListingUsage = pgTable(
  "human_listing_usage",
  {
    listingId: text("listing_id").notNull().references(() => listings.id),
    humanIdHash: text("human_id_hash").notNull(),
    applicationId: text("application_id").notNull().references(() => applications.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.listingId, table.humanIdHash] })],
);

export const verifiedAgents = pgTable("verified_agents", {
  agentEvmAddress: text("agent_evm_address").primaryKey(),
  humanIdHash: text("human_id_hash").notNull(),
  lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }).notNull(),
  agentkitMetadata: jsonb("agentkit_metadata").notNull().default({}),
});

export const suiReceipts = pgTable(
  "sui_receipts",
  {
    receiptId: text("receipt_id").primaryKey(),
    applicationId: text("application_id").notNull().references(() => applications.id),
    txDigest: text("tx_digest").notNull(),
    mandateId: text("mandate_id").notNull(),
    listingObjectId: text("listing_object_id").notNull(),
    submittedAtMs: bigint("submitted_at_ms", { mode: "number" }).notNull(),
    rawObject: jsonb("raw_object").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("sui_receipts_tx_digest_unique").on(table.txDigest)],
);

/**
 * Renter packet registrations, keyed by (mandateId, providerListingId). One
 * packet per mandate+listing pair: a re-upload replaces the previous record.
 * providerListingId defaults to "listing_lisbon_eligible" for backwards
 * compatibility with older single-listing records.
 *
 * Durable because the agent reads this before every run — losing it on restart
 * surfaces three steps later as "No packet registered for mandate …".
 */
export const packets = pgTable(
  "packets",
  {
    mandateId: text("mandate_id").notNull(),
    providerListingId: text("provider_listing_id").notNull().default("listing_lisbon_eligible"),
    walrusBlobId: text("walrus_blob_id").notNull(),
    packetHash: text("packet_hash").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    encryptionMode: text("encryption_mode").notNull(),
    registeredAtMs: bigint("registered_at_ms", { mode: "number" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.mandateId, table.providerListingId] })],
);

export const documentAccessGrants = pgTable("document_access_grants", {
  id: text("id").primaryKey(),
  applicationId: text("application_id").notNull().references(() => applications.id),
  receiptId: text("receipt_id").notNull(),
  requesterSuiAddress: text("requester_sui_address").notNull(),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
