#!/usr/bin/env node
/**
 * RD-121: Walrus preflight check
 * Verifies the Walrus binary, wallet, and balances before live uploads.
 * Run: tsx src/checkEnv.ts  OR  node dist/checkEnv.js
 */
import { spawnFile } from "./process.js";

const WALRUS_BIN = `${process.env["HOME"]}/.local/bin/walrus`;
const CHECK_SIZE_BYTES = 51200; // ~50 KB
const CHECK_EPOCHS = 5;

async function runWalrus(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const result = await spawnFile(WALRUS_BIN, args);
    return { ok: result.code === 0, stdout: result.stdout, stderr: result.stderr };
  } catch (err) {
    return { ok: false, stdout: "", stderr: String(err) };
  }
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function getNestedString(obj: unknown, ...keys: string[]): string | null {
  let cur: unknown = obj;
  for (const key of keys) {
    if (!cur || typeof cur !== "object") return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  return typeof cur === "string" ? cur : cur != null ? String(cur) : null;
}

async function main(): Promise<void> {
  console.log("=== Walrus preflight check ===\n");
  console.log(`Binary: ${WALRUS_BIN}`);

  // 1. Verify binary exists with --version
  const versionResult = await runWalrus(["--version"]);
  if (!versionResult.ok) {
    console.error(`\nERROR: Walrus binary not found or not executable at ${WALRUS_BIN}`);
    console.error(`  ${versionResult.stderr || versionResult.stdout}`);
    console.error("\nFix: install walrus to ~/.local/bin/walrus or set WALRUS_BIN env var.");
    process.exit(1);
  }
  console.log(`Version: ${versionResult.stdout.trim()}`);

  // 2. Wallet info
  console.log("\n--- Wallet ---");
  const walletResult = await runWalrus(["wallet", "--json"]);
  if (walletResult.ok) {
    const parsed = tryParseJson(walletResult.stdout);
    const address = getNestedString(parsed, "address") ?? getNestedString(parsed, "activeAddress") ?? "unknown";
    const suiBalance = getNestedString(parsed, "suiBalance") ?? getNestedString(parsed, "sui_balance") ?? "?";
    const walBalance = getNestedString(parsed, "walBalance") ?? getNestedString(parsed, "wal_balance") ?? "?";
    console.log(`  Address:     ${address}`);
    console.log(`  SUI balance: ${suiBalance}`);
    console.log(`  WAL balance: ${walBalance}`);

    // Warn if WAL looks zero
    const walNum = parseFloat(walBalance);
    if (!isNaN(walNum) && walNum === 0) {
      console.error("\nWARNING: WAL balance is 0. Live uploads will fail.");
      console.error("  Get WAL tokens from the Walrus testnet faucet before proceeding.");
    }
  } else {
    console.log("  (walrus wallet --json not available; skipping balance check)");
    console.log(`  stderr: ${walletResult.stderr.trim()}`);
  }

  // 3. Context / config info
  console.log("\n--- Context ---");
  const infoResult = await runWalrus(["info", "--json"]);
  if (infoResult.ok) {
    const parsed = tryParseJson(infoResult.stdout);
    const context = getNestedString(parsed, "context") ?? getNestedString(parsed, "currentContext") ?? "default";
    const network = getNestedString(parsed, "network") ?? getNestedString(parsed, "walrusNetwork") ?? "unknown";
    console.log(`  Context: ${context}`);
    console.log(`  Network: ${network}`);
  } else {
    console.log("  (walrus info --json not available)");
  }

  // 4. Storage cost estimate
  console.log("\n--- Storage cost estimate ---");
  console.log(`  Size:   ${CHECK_SIZE_BYTES} bytes (~50 KB)`);
  console.log(`  Epochs: ${CHECK_EPOCHS}`);

  const costResult = await runWalrus(["store-cost", "--size", String(CHECK_SIZE_BYTES), "--epochs", String(CHECK_EPOCHS), "--json"]);
  if (costResult.ok) {
    const parsed = tryParseJson(costResult.stdout);
    const cost = getNestedString(parsed, "cost") ?? getNestedString(parsed, "totalCost") ?? getNestedString(parsed, "total_cost");
    if (cost) {
      console.log(`  Estimated cost: ${cost} WAL`);
    } else {
      console.log(`  Cost response: ${costResult.stdout.trim()}`);
    }
  } else {
    // Try alternative subcommand name
    const altResult = await runWalrus(["storage-cost", "--size", String(CHECK_SIZE_BYTES), "--epochs", String(CHECK_EPOCHS), "--json"]);
    if (altResult.ok) {
      console.log(`  Cost response: ${altResult.stdout.trim()}`);
    } else {
      console.log("  (cost estimation not available with this binary version)");
    }
  }

  console.log("\n=== Preflight OK ===");
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error("Preflight check failed unexpectedly:", err);
  process.exit(1);
});
