import { ERROR_CODES, ERROR_HTTP_STATUS } from "@rentdelegate/shared";
import { Hono } from "hono";
import type { AgentContext, ApplicationService } from "../services/applications.js";

type ErrorStatus = 401 | 403 | 404 | 409 | 422;

export function createApplicationRoutes(applicationService: ApplicationService) {
  const routes = new Hono();

  routes.post("/listings/:id/applications", async (c) => {
    const agentContext = readMockAgentContext(c.req.raw.headers);

    if (!agentContext) {
      return c.json({ error: ERROR_CODES.AGENTKIT_UNVERIFIED }, ERROR_HTTP_STATUS.AGENTKIT_UNVERIFIED as ErrorStatus);
    }

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

  return routes;
}

function readMockAgentContext(headers: Headers): AgentContext | null {
  const humanIdHash = headers.get("x-demo-human-id-hash");
  const agentEvmAddress = headers.get("x-demo-agent-evm-address");
  const mandateAgentSuiAddress = headers.get("x-demo-mandate-agent-sui-address");

  if (!humanIdHash || !agentEvmAddress || !mandateAgentSuiAddress) {
    return null;
  }

  return {
    mode: "mock-agentkit",
    humanIdHash,
    agentEvmAddress,
    mandateAgentSuiAddress,
  };
}
