#!/usr/bin/env node
/*
 * RD-115 lint check: no Sui object ID literal outside packages/contracts-config.
 *
 * A 0x-prefixed 64-lowercase-hex string in application source code is a
 * hardcoded object ID.  The only place these may live is
 * packages/contracts-config/src/index.ts (and testnet.json).  Every other
 * consumer must import from @casium/contracts-config.
 *
 * Exclusions (by path):
 *   packages/contracts-config/   the canonical home
 *   node_modules/                third-party code
 *   dist/                        build output
 *   *.test.ts / *.test.tsx       synthetic test fixtures (0xaaaa..., 0xbbbb...)
 *   *.snap                       vitest/jest snapshots
 *
 * Usage:
 *   node scripts/check-object-ids.mjs
 *   exits 0 if clean, 1 if violations found
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "..", "..");

// ripgrep pattern: 0x followed by exactly 64 lowercase hex chars
const pattern = "0x[0-9a-f]{64}";

// Paths to search (relative to repo root)
const includePaths = ["apps", "packages"];

// File types to check
const includeGlob = "*.{ts,tsx,mts,cts}";

// Exclusion globs passed to rg
const excludeGlobs = [
  "node_modules",
  "dist",
  "*.test.ts",
  "*.test.tsx",
  "*.snap",
];

const rgArgs = [
  `--regexp '${pattern}'`,
  `--glob '${includeGlob}'`,
  ...excludeGlobs.map((g) => `--glob '!${g}'`),
  // Exclude the contracts-config package itself (the canonical home)
  `--glob '!packages/contracts-config/**'`,
  "--color never",
  "--line-number",
  "--with-filename",
  ...includePaths,
].join(" ");

let output = "";
let found = false;

try {
  output = execSync(`rg ${rgArgs}`, { cwd: root, encoding: "utf8" });
  found = output.trim().length > 0;
} catch (err) {
  // rg exits 1 when no matches — that is success for us
  if (err.status === 1) {
    found = false;
  } else {
    // rg exits 2 on error
    console.error("rg failed:", err.message);
    process.exit(2);
  }
}

if (found) {
  console.error("❌ Hardcoded Sui object ID literals found outside packages/contracts-config:\n");
  console.error(output);
  console.error("Fix: import the ID from @casium/contracts-config instead of restating the literal.");
  process.exit(1);
} else {
  console.log("✓ No hardcoded Sui object ID literals found outside packages/contracts-config.");
  process.exit(0);
}
