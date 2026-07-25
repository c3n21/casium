import { MUNICIPALITIES } from "@rentdelegate/shared";

export const DEMO_LISTINGS = [
  {
    id: "listing_lisbon_eligible",
    suiListingId: "0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a",
    externalListingId: "lisbon-demo-1",
    providerSuiAddress: "0x371321932fb4c4b79b9b0762ac0878ebfb670cc6f6327ecf9d1d06cd9489243e",
    landlordSuiAddress: "0x371321932fb4c4b79b9b0762ac0878ebfb670cc6f6327ecf9d1d06cd9489243e",
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
