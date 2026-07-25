/**
 * Canonical RentDelegate testnet contract IDs and configuration.
 *
 * This is the single source of truth for every object ID, package ID, and
 * explorer URL used by the application. No other package or app may contain
 * a 0x-prefixed 64-hex Sui object literal — import from here instead.
 *
 * Sourced from: packages/contracts-config/testnet.json
 */

export const NETWORK = "testnet" as const;
export const RPC_URL = "https://fullnode.testnet.sui.io:443";

/** Published Move package ID (original, stable). */
export const PACKAGE_ID = "0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d";

/** UpgradeCap — required for RD-133 package upgrade. */
export const UPGRADE_CAP_ID = "0x2250bb6b4e9804285aa42d9dd7f2737ecdd93ed4b03edbf515459fb7223d62af";

/** Address that published the package; also used as provider + landlord in demo listings. */
export const PUBLISHER_ADDRESS = "0x371321932fb4c4b79b9b0762ac0878ebfb670cc6f6327ecf9d1d06cd9489243e";

/**
 * Smoke-test objects created during initial publish smoke (ANNzWCc4…).
 * These are the "known-good" demo objects for UI evidence panels.
 */
export const SMOKE = {
  mandateId: "0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee",
  ownerCapId: "0xcdb3924e29345c3be077f3c54de78435144ad141d0458a93f6fb6ae0381a571d",
  agentCapId: "0xabeb55d1266102eed4235531c542fb01fd85bb3095c3d579960923f2e1e25c2a",
  /** Eligible Lisbon listing — shared object, used in both smoke and live runs. */
  listingObjectId: "0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a",
  receiptId: "0xc46d42744b7381447851f9f2adb6cf32322ab4bd6aba243e925597418899ad20",
  createMandateTxDigest: "ANNzWCc4StQWGnbdDKmxkwozYhk2V8CDVDUk4UA1sfDA",
} as const;

/**
 * Live agent run (RD-108): real agent-signed submit_application on testnet.
 * World AgentKit ran in mock mode; Walrus used the labeled mock adapter.
 */
export const LIVE_AGENT_RUN = {
  mandateId: "0x16de4b28830417bea4becaa591671ca69024fea9d99d355c9c8784e468dcc454",
  ownerCapId: "0xb2e9e3f3bfcd285ca6b58de0ccbe3138140a58c5e3968dd48850511ab3c6d806",
  agentCapId: "0xcdc9d7aa5345a4b5c4e8b6fc093a3b5c2b4caf469a3b9f99144449ac462bebd9",
  /** Same Lisbon listing as smoke — shared object. */
  listingObjectId: "0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a",
  receiptId: "0xc6f490b959f23db9936090be9bdd52ede80cb685561cc528593f958978235865",
  /**
   * Real Porto (municipality 6) RentalListing on testnet.
   * The agent must read this object and produce a EMUNICIPALITY_NOT_ALLOWED rejection —
   * NOT fall into a "not readable" catch branch.
   */
  ineligibleListingObjectId: "0xd0f9b4ae975b27d56af6c23844cbfa76dfda81f2913585788c51289ad1f0b3d1",
  submitApplicationTxDigest: "BatrGYNdmzXA8wdEJT4XC4LXa55fZ6ezMAFcsbvAd1dm",
  createIneligibleListingTxDigest: "DFoXLEaZmbGyKXgKsG3YBjVLvbQJP7h2dZNSFHN9xRLg",
  rejectedSubmitTxDigest: "6YRsTLLYKCEcWjnXBrfKwxwFc1tiTomLryxmvG7r71sA",
} as const;

// ---------------------------------------------------------------------------
// Convenience flat aliases (for simpler destructuring in consumers)
// ---------------------------------------------------------------------------

/** Eligible Lisbon listing — the one the agent successfully applies to. */
export const DEMO_LISTING_OBJECT_ID = SMOKE.listingObjectId;

/**
 * Ineligible Porto listing — must trigger EMUNICIPALITY_NOT_ALLOWED, not a read failure.
 * This is the real on-chain object, not a placeholder.
 */
export const INELIGIBLE_LISTING_OBJECT_ID = LIVE_AGENT_RUN.ineligibleListingObjectId;

/** Smoke mandate for the renter demo UI evidence panel. */
export const SMOKE_MANDATE_ID = SMOKE.mandateId;

/** Smoke receipt for the landlord demo UI evidence panel. */
export const SMOKE_RECEIPT_ID = SMOKE.receiptId;

// ---------------------------------------------------------------------------
// Explorer URL helpers
// ---------------------------------------------------------------------------

export const EXPLORER_TX = (digest: string): string =>
  `https://suivision.xyz/txblock/${digest}?network=testnet`;

export const EXPLORER_OBJECT = (id: string): string =>
  `https://suivision.xyz/object/${id}?network=testnet`;
