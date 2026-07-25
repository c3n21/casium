import { createMiddleware } from "hono/factory";

export type CorrelationVariables = {
  correlationId: string;
};

export function createCorrelationMiddleware() {
  return createMiddleware<{ Variables: CorrelationVariables }>(async (c, next) => {
    const correlationId = c.req.header("x-correlation-id") ?? crypto.randomUUID();
    c.set("correlationId", correlationId);
    await next();
    c.res.headers.set("x-correlation-id", correlationId);
  });
}
