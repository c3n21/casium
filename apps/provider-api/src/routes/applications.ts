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
    const result = applicationService.reserve(c.req.param("id"), body, agentContext);

    if (!result.ok) {
      return c.json({ error: result.error }, ERROR_HTTP_STATUS[result.error] as ErrorStatus);
    }

    return c.json(result.value, result.replayed ? 200 : 202);
  });

  routes.get("/applications/:id", (c) => {
    const application = applicationService.get(c.req.param("id"));

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

  return routes;
}
