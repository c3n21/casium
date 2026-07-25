import { ListingSchema, MUNICIPALITIES } from "@rentdelegate/shared";
import {
  DEMO_LISTING_OBJECT_ID,
  INELIGIBLE_LISTING_OBJECT_ID,
  PUBLISHER_ADDRESS,
} from "@rentdelegate/contracts-config";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/client.js";
import { listings as listingsTable } from "../db/schema.js";

const CreateListingSchema = ListingSchema.omit({ id: true, createdAt: true }).extend({
  id: z.string().min(1).optional(),
});

export type ProviderListing = z.infer<typeof ListingSchema>;

type CreateListingInput = z.infer<typeof CreateListingSchema>;
type ListingResult = { ok: true; value: ProviderListing } | { ok: false; error: string };

const DEMO_LISTINGS: ProviderListing[] = [
  {
    id: "listing_lisbon_eligible",
    listingObjectId: DEMO_LISTING_OBJECT_ID,
    externalListingId: "lisbon-demo-1",
    providerSuiAddress: PUBLISHER_ADDRESS,
    landlordSuiAddress: PUBLISHER_ADDRESS,
    municipalityCode: MUNICIPALITIES.LISBON,
    monthlyRentEur: 1700,
    bedrooms: 2,
    active: true,
    createdAt: "2026-07-25T00:00:00.000Z",
  },
  {
    id: "listing_porto_ineligible",
    listingObjectId: INELIGIBLE_LISTING_OBJECT_ID,
    externalListingId: "porto-demo-1",
    providerSuiAddress: PUBLISHER_ADDRESS,
    landlordSuiAddress: PUBLISHER_ADDRESS,
    municipalityCode: MUNICIPALITIES.PORTO_INELIGIBLE_DEMO,
    monthlyRentEur: 1200,
    bedrooms: 2,
    active: true,
    createdAt: "2026-07-25T00:00:00.000Z",
  },
];

type DbListing = typeof listingsTable.$inferSelect;

function toProviderListing(row: DbListing): ProviderListing {
  return {
    id: row.id,
    listingObjectId: row.suiListingId,
    externalListingId: row.externalListingId,
    providerSuiAddress: row.providerSuiAddress,
    landlordSuiAddress: row.landlordSuiAddress,
    municipalityCode: row.municipalityCode,
    monthlyRentEur: row.monthlyRentEur,
    bedrooms: row.bedrooms,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

async function seedDb(db: Db, listings: ProviderListing[]) {
  for (const listing of listings) {
    await db
      .insert(listingsTable)
      .values({
        id: listing.id,
        suiListingId: listing.listingObjectId,
        externalListingId: listing.externalListingId,
        providerSuiAddress: listing.providerSuiAddress,
        landlordSuiAddress: listing.landlordSuiAddress,
        municipalityCode: listing.municipalityCode,
        monthlyRentEur: listing.monthlyRentEur,
        bedrooms: listing.bedrooms,
        active: listing.active,
      })
      .onConflictDoNothing();
  }
}

export function createListingService(seedListings = DEMO_LISTINGS, db?: Db) {
  const listingsMap = new Map(seedListings.map((listing) => [listing.id, listing]));

  // Kick off DB seeding asynchronously; callers await dbReady before DB reads
  const dbReady: Promise<void> = db
    ? seedDb(db, seedListings).catch((err: unknown) => {
        console.error("Failed to seed listings into DB:", err);
      })
    : Promise.resolve();

  return {
    async create(input: unknown): Promise<ListingResult> {
      const parsed = CreateListingSchema.safeParse(input);

      if (!parsed.success) {
        return { ok: false, error: "LISTING_INVALID" };
      }

      const listing = toListing(parsed.data);

      if (db) {
        await db
          .insert(listingsTable)
          .values({
            id: listing.id,
            suiListingId: listing.listingObjectId,
            externalListingId: listing.externalListingId,
            providerSuiAddress: listing.providerSuiAddress,
            landlordSuiAddress: listing.landlordSuiAddress,
            municipalityCode: listing.municipalityCode,
            monthlyRentEur: listing.monthlyRentEur,
            bedrooms: listing.bedrooms,
            active: listing.active,
          })
          .onConflictDoNothing();
      }

      // Always keep in-memory map in sync for fast reads
      listingsMap.set(listing.id, listing);
      return { ok: true, value: listing };
    },

    async list(): Promise<ProviderListing[]> {
      if (db) {
        await dbReady;
        const rows = await db.select().from(listingsTable);
        return rows.map(toProviderListing);
      }
      return [...listingsMap.values()];
    },

    async get(id: string): Promise<ProviderListing | null> {
      if (db) {
        await dbReady;
        const [row] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
        return row ? toProviderListing(row) : null;
      }
      return listingsMap.get(id) ?? null;
    },
  };
}

function toListing(input: CreateListingInput): ProviderListing {
  return {
    id: input.id ?? `listing_${input.externalListingId}`,
    listingObjectId: input.listingObjectId,
    externalListingId: input.externalListingId,
    providerSuiAddress: input.providerSuiAddress,
    landlordSuiAddress: input.landlordSuiAddress,
    municipalityCode: input.municipalityCode,
    monthlyRentEur: input.monthlyRentEur,
    bedrooms: input.bedrooms,
    active: input.active,
    createdAt: new Date().toISOString(),
  };
}

export type ListingService = ReturnType<typeof createListingService>;
