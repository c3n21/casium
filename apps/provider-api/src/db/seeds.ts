import { MUNICIPALITIES } from "@rentdelegate/shared";

export const DEMO_LISTINGS = [
  {
    id: "listing_lisbon_eligible",
    suiListingId: "0xTODO_LISBON_ELIGIBLE_LISTING",
    externalListingId: "lisbon-demo-1",
    providerSuiAddress: "0xTODO_PROVIDER",
    landlordSuiAddress: "0xTODO_LANDLORD",
    municipalityCode: MUNICIPALITIES.LISBON,
    monthlyRentEur: 1700,
    bedrooms: 2,
    active: true,
  },
  {
    id: "listing_porto_ineligible",
    suiListingId: "0xTODO_PORTO_INELIGIBLE_LISTING",
    externalListingId: "porto-demo-1",
    providerSuiAddress: "0xTODO_PROVIDER",
    landlordSuiAddress: "0xTODO_LANDLORD",
    municipalityCode: MUNICIPALITIES.PORTO_INELIGIBLE_DEMO,
    monthlyRentEur: 1200,
    bedrooms: 2,
    active: true,
  },
] as const;
