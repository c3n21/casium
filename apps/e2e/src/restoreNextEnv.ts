/**
 * Playwright globalTeardown.
 *
 * `next build` rewrites the tracked apps/web/next-env.d.ts to reference the
 * active distDir. Because the E2E build sets NEXT_DIST_DIR=.next-e2e, every run
 * would otherwise leave that file pointing at a directory that does not exist
 * in a clean clone — which breaks `pnpm --filter @casium/web typecheck`
 * if it is ever committed.
 *
 * Point it back at `.next` afterwards. Only rewrites when the file actually
 * references the E2E dist dir, so it can never clobber an unrelated edit.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const NEXT_ENV = fileURLToPath(new URL("../../web/next-env.d.ts", import.meta.url));

export default async function restoreNextEnv() {
  try {
    const contents = await readFile(NEXT_ENV, "utf8");
    if (!contents.includes(".next-e2e/types/routes.d.ts")) return;
    await writeFile(
      NEXT_ENV,
      contents.replace(".next-e2e/types/routes.d.ts", ".next/types/routes.d.ts"),
      "utf8",
    );
  } catch {
    // The file is generated; if it is missing there is nothing to restore.
  }
}
