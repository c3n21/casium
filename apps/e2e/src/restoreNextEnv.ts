/**
 * Playwright globalTeardown.
 *
 * `next build` rewrites the tracked apps/web/next-env.d.ts to reference the
 * active distDir. Because the E2E build sets NEXT_DIST_DIR (`.next-e2e` for the
 * stubbed tier, `.next-e2e-live` for the live one), every run would otherwise
 * leave that file pointing at a directory that does not exist in a clean clone
 * — which breaks `pnpm --filter @casium/web typecheck` if it is ever committed.
 *
 * Point it back at `.next` afterwards. Only rewrites when the file actually
 * references an E2E dist dir, so it can never clobber an unrelated edit.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const NEXT_ENV = fileURLToPath(new URL("../../web/next-env.d.ts", import.meta.url));
// Not a global regex: `test()` on one would advance `lastIndex` and make a
// second call lie about the same string.
const E2E_DIST_REFERENCE = /\.next-e2e[\w-]*\/types\/routes\.d\.ts/;

export default async function restoreNextEnv() {
  try {
    const contents = await readFile(NEXT_ENV, "utf8");
    if (!E2E_DIST_REFERENCE.test(contents)) return;
    await writeFile(
      NEXT_ENV,
      contents.replace(new RegExp(E2E_DIST_REFERENCE, "g"), ".next/types/routes.d.ts"),
      "utf8",
    );
  } catch {
    // The file is generated; if it is missing there is nothing to restore.
  }
}
