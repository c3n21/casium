import { createRentDelegateClient } from "@rentdelegate/sui-client";
import {
  PACKAGE_ID as DEFAULT_PACKAGE_ID,
  RPC_URL as DEFAULT_RPC_URL,
} from "@rentdelegate/contracts-config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb } from "./db/client.js";
import { createAgentKitMiddleware } from "./middleware/agentkit.js";
import { createCorrelationMiddleware } from "./middleware/correlation.js";
import { createApplicationRoutes } from "./routes/applications.js";
import { createListingRoutes } from "./routes/listings.js";
import { createPacketRoutes } from "./routes/packets.js";
import { createApplicationService } from "./services/applications.js";
import { createListingService } from "./services/listings.js";
import { createMandateService } from "./services/mandates.js";
import { createSuiReceiptVerifier, type ReceiptVerificationService } from "./services/suiVerifier.js";

export function createApp(receiptVerifier?: ReceiptVerificationService) {
  const app = new Hono();

  // Determine store mode
  const usePostgres = process.env.PROVIDER_STORE === "postgres";

  let db: ReturnType<typeof createDb> | undefined;
  if (usePostgres) {
    try {
      db = createDb(process.env.DATABASE_URL);
    } catch (err) {
      throw new Error(`Failed to connect to Postgres: ${String(err)}`);
    }
  }

  const listingService = createListingService(undefined, db);
  const applicationService = createApplicationService(
    listingService,
    receiptVerifier ?? createDefaultReceiptVerifier(),
    db,
  );
  const mandateService = createMandateService();

  const store = usePostgres ? "postgres" : "memory";

  // Correlation middleware first
  app.use("*", createCorrelationMiddleware());
  app.use("*", cors({ allowHeaders: ["content-type", "agentkit", "x-correlation-id"] }));

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "provider-api",
      store,
    }),
  );

  app.post("/mandates", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = mandateService.register(body);
    if (!result.ok) {
      return c.json({ error: result.error }, 422);
    }
    return c.json(result.value, 201);
  });

  app.get("/mandates/:id", (c) => {
    const mandate = mandateService.get(c.req.param("id"));
    if (!mandate) {
      return c.json({ error: "MANDATE_NOT_FOUND" }, 404);
    }
    return c.json(mandate);
  });

  app.route("/listings", createListingRoutes(listingService));
  app.use("/listings/:id/applications", createAgentKitMiddleware());
  app.route("/", createApplicationRoutes(applicationService));
  app.route("/packets", createPacketRoutes(db));

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
