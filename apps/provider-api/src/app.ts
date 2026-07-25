import { createRentDelegateClient } from "@rentdelegate/sui-client";
import { Hono } from "hono";
import { createAgentKitMiddleware } from "./middleware/agentkit.js";
import { createApplicationRoutes } from "./routes/applications.js";
import { createListingRoutes } from "./routes/listings.js";
import { createApplicationService } from "./services/applications.js";
import { createListingService } from "./services/listings.js";
import { createSuiReceiptVerifier, type ReceiptVerificationService } from "./services/suiVerifier.js";

const TESTNET_RPC_URL = "https://fullnode.testnet.sui.io:443";
const RD_007_PACKAGE_ID = "0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d";

export function createApp(receiptVerifier?: ReceiptVerificationService) {
  const app = new Hono();
  const listingService = createListingService();
  const applicationService = createApplicationService(listingService, receiptVerifier ?? createDefaultReceiptVerifier());

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "provider-api",
      mode: "local",
    }),
  );

  app.route("/listings", createListingRoutes(listingService));
  app.use("/listings/:id/applications", createAgentKitMiddleware());
  app.route("/", createApplicationRoutes(applicationService));

  return app;
}

export type ProviderApiApp = ReturnType<typeof createApp>;

function createDefaultReceiptVerifier() {
  return createSuiReceiptVerifier(
    createRentDelegateClient({
      network: "testnet",
      rpcUrl: process.env.SUI_RPC_URL ?? TESTNET_RPC_URL,
      packageId: process.env.SUI_PACKAGE_ID ?? RD_007_PACKAGE_ID,
    }),
  );
}
