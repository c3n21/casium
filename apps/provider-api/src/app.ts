import { createRentDelegateClient } from "@rentdelegate/sui-client";
import {
  PACKAGE_ID as DEFAULT_PACKAGE_ID,
  RPC_URL as DEFAULT_RPC_URL,
} from "@rentdelegate/contracts-config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createAgentKitMiddleware } from "./middleware/agentkit.js";
import { createApplicationRoutes } from "./routes/applications.js";
import { createListingRoutes } from "./routes/listings.js";
import { createApplicationService } from "./services/applications.js";
import { createListingService } from "./services/listings.js";
import { createSuiReceiptVerifier, type ReceiptVerificationService } from "./services/suiVerifier.js";

export function createApp(receiptVerifier?: ReceiptVerificationService) {
  const app = new Hono();
  const listingService = createListingService();
  const applicationService = createApplicationService(listingService, receiptVerifier ?? createDefaultReceiptVerifier());

  app.use("*", cors({ allowHeaders: ["content-type", "agentkit"] }));

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
      rpcUrl: process.env.SUI_RPC_URL ?? DEFAULT_RPC_URL,
      packageId: process.env.SUI_PACKAGE_ID ?? DEFAULT_PACKAGE_ID,
    }),
  );
}
