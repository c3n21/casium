import { serve } from "@hono/node-server";
import { createApp, createDefaultSuiClient } from "./app.js";
import { createSuiReceiptVerifier } from "./services/suiVerifier.js";

const port = Number(process.env.PORT ?? 4021);

// Build the Sui client once and share it between the receipt verifier and the
// mandate reader so no duplicate connections are created (RD-164).
const suiClient = createDefaultSuiClient();

serve(
  {
    fetch: createApp(createSuiReceiptVerifier(suiClient), suiClient).fetch,
    port,
  },
  (info) => {
    console.log(`provider-api listening on http://localhost:${info.port}`);
  },
);
