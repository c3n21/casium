import { Hono } from "hono";
import { createAgentKitMiddleware } from "./middleware/agentkit.js";
import { createApplicationRoutes } from "./routes/applications.js";
import { createListingRoutes } from "./routes/listings.js";
import { createApplicationService } from "./services/applications.js";
import { createListingService } from "./services/listings.js";

export function createApp() {
  const app = new Hono();
  const listingService = createListingService();
  const applicationService = createApplicationService(listingService);

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
