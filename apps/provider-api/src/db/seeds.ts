import { MUNICIPALITIES } from "@rentdelegate/shared";
import {
  DEMO_LISTING_OBJECT_ID,
  INELIGIBLE_LISTING_OBJECT_ID,
  PUBLISHER_ADDRESS,
} from "@rentdelegate/contracts-config";

export const DEMO_LISTINGS = [
  {
    id: "listing_lisbon_eligible",
    suiListingId: DEMO_LISTING_OBJECT_ID,
    externalListingId: "lisbon-demo-1",
    providerSuiAddress: PUBLISHER_ADDRESS,
    landlordSuiAddress: PUBLISHER_ADDRESS,
    municipalityCode: MUNICIPALITIES.LISBON,
    monthlyRentEur: 1700,
    bedrooms: 2,
    active: true,
  },
  {
    id: "listing_porto_ineligible",
    suiListingId: INELIGIBLE_LISTING_OBJECT_ID,
    externalListingId: "porto-demo-1",
    providerSuiAddress: PUBLISHER_ADDRESS,
    landlordSuiAddress: PUBLISHER_ADDRESS,
    municipalityCode: MUNICIPALITIES.PORTO_INELIGIBLE_DEMO,
    monthlyRentEur: 1200,
    bedrooms: 2,
    active: true,
  },
] as const;
