import { createAgentKitVerifier } from "@casium/agentkit";
import { ERROR_CODES, ERROR_HTTP_STATUS } from "@casium/shared";
import { createMiddleware } from "hono/factory";
import type { AgentKitContext, AgentKitVerifier } from "@casium/agentkit";

type Variables = {
  agentContext: AgentKitContext;
};

export function createAgentKitMiddleware(verifier: AgentKitVerifier = createAgentKitVerifier()) {
  return createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const result = await verifier.verify(c.req.raw, c.req.url);

    if (!result.ok) {
      return c.json({ error: ERROR_CODES.AGENTKIT_UNVERIFIED }, ERROR_HTTP_STATUS.AGENTKIT_UNVERIFIED as 401);
    }

    c.set("agentContext", result.context);
    await next();
  });
}

export type AgentKitVariables = Variables;
