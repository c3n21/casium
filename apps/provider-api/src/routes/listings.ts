import { Hono } from "hono";
import type { ListingService } from "../services/listings.js";

export function createListingRoutes(listingService: ListingService) {
  const routes = new Hono();

  routes.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = listingService.create(body);

    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    return c.json(result.value, 201);
  });

  routes.get("/", (c) => c.json({ listings: listingService.list() }));

  routes.get("/:id", (c) => {
    const listing = listingService.get(c.req.param("id"));

    if (!listing) {
      return c.json({ error: "LISTING_NOT_FOUND" }, 404);
    }

    return c.json(listing);
  });

  return routes;
}
