import { Hono } from "hono";
import { createListingRoutes } from "./routes/listings.js";
import { createListingService } from "./services/listings.js";

export function createApp() {
  const app = new Hono();
  const listingService = createListingService();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      service: "provider-api",
      mode: "local",
    }),
  );

  app.route("/listings", createListingRoutes(listingService));

  return app;
}

export type ProviderApiApp = ReturnType<typeof createApp>;
