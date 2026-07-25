import { ListingSchema, MUNICIPALITIES } from "@rentdelegate/shared";
import {
  DEMO_LISTING_OBJECT_ID,
  INELIGIBLE_LISTING_OBJECT_ID,
  PUBLISHER_ADDRESS,
} from "@rentdelegate/contracts-config";
import { z } from "zod";

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

export function createListingService(seedListings = DEMO_LISTINGS) {
  const listings = new Map(seedListings.map((listing) => [listing.id, listing]));

  return {
    create(input: unknown): ListingResult {
      const parsed = CreateListingSchema.safeParse(input);

      if (!parsed.success) {
        return { ok: false, error: "LISTING_INVALID" };
      }

      const listing = toListing(parsed.data);
      listings.set(listing.id, listing);
      return { ok: true, value: listing };
    },
    list(): ProviderListing[] {
      return [...listings.values()];
    },
    get(id: string): ProviderListing | null {
      return listings.get(id) ?? null;
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
