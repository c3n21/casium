import { ERROR_HTTP_STATUS } from "@rentdelegate/shared";
import { Hono } from "hono";
import type { AgentKitVariables } from "../middleware/agentkit.js";
import type { ApplicationService } from "../services/applications.js";

type ErrorStatus = 401 | 403 | 404 | 409 | 422;

export function createApplicationRoutes(applicationService: ApplicationService) {
  const routes = new Hono<{ Variables: AgentKitVariables }>();

  routes.post("/listings/:id/applications", async (c) => {
    const agentContext = c.get("agentContext");
    const body = await c.req.json().catch(() => null);
    const result = await applicationService.reserve(c.req.param("id"), body, agentContext);

    if (!result.ok) {
      return c.json({ error: result.error }, ERROR_HTTP_STATUS[result.error] as ErrorStatus);
    }

    return c.json(result.value, result.replayed ? 200 : 202);
  });

  routes.get("/applications", async (c) => {
    const listingId = c.req.query("listingId");
    const mandateId = c.req.query("mandateId");
    const status = c.req.query("status");

    const filters: { listingId?: string; mandateId?: string; status?: string } = {};
    if (listingId !== undefined) filters.listingId = listingId;
    if (mandateId !== undefined) filters.mandateId = mandateId;
    if (status !== undefined) filters.status = status;

    const applications = await applicationService.listAll(filters);

    return c.json({ applications });
  });

  routes.get("/applications/:id", async (c) => {
    const application = await applicationService.get(c.req.param("id"));

    if (!application) {
      return c.json({ error: "APPLICATION_NOT_FOUND" }, 404);
    }

    return c.json(application);
  });

  routes.post("/applications/:id/verify", async (c) => {
    const body = await c.req.json().catch(() => null);
    const result = await applicationService.verify(c.req.param("id"), body);

    if (!result.ok) {
      return c.json({ error: result.error }, ERROR_HTTP_STATUS[result.error] as ErrorStatus);
    }

    return c.json(result.value);
  });

  routes.post("/applications/:id/withdraw", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { txDigest, receiptId } = body as { txDigest?: string; receiptId?: string };

    if (!txDigest || !receiptId) {
      return c.json({ error: "RECEIPT_INVALID" }, 422);
    }

    const result = await applicationService.withdraw(c.req.param("id"), { txDigest, receiptId });

    if (!result.ok) {
      return c.json({ error: result.error }, ERROR_HTTP_STATUS[result.error] as ErrorStatus);
    }

    return c.json(result.value);
  });

  routes.post("/applications/:id/access-grants", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const { requesterSuiAddress, expiresAt } = body as {
      requesterSuiAddress?: string;
      expiresAt?: string;
    };

    if (!requesterSuiAddress || !expiresAt) {
      return c.json({ error: "INVALID_INPUT" }, 422);
    }

    const result = await applicationService.createAccessGrant(c.req.param("id"), {
      requesterSuiAddress,
      expiresAt,
    });

    if (!result.ok) {
      return c.json({ error: result.error }, ERROR_HTTP_STATUS[result.error] as ErrorStatus);
    }

    return c.json(result.value, 201);
  });

  routes.get("/applications/:id/access-grants", async (c) => {
    const application = await applicationService.get(c.req.param("id"));

    if (!application) {
      return c.json({ error: "APPLICATION_NOT_FOUND" }, 404);
    }

    const grants = await applicationService.listAccessGrants(c.req.param("id"));
    return c.json({ grants });
  });

  return routes;
}
