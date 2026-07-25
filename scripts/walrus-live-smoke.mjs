#!/usr/bin/env node
/**
 * RD-123 — Live Walrus Upload Smoke Test
 *
 * Uploads a synthetic packet via the Walrus testnet HTTP publisher,
 * downloads it via the aggregator, and verifies byte equality.
 *
 * Must be run explicitly — never in CI:
 *   WALRUS_LIVE_SMOKE=1 node scripts/walrus-live-smoke.mjs
 */

if (!process.env.WALRUS_LIVE_SMOKE) {
  console.error("Set WALRUS_LIVE_SMOKE=1 to run this script (it spends real storage resources).");
  process.exit(1);
}

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const PUBLISHER = process.env.WALRUS_PUBLISHER_URL ?? "https://publisher.walrus-testnet.walrus.space";
const AGGREGATOR = process.env.WALRUS_AGGREGATOR_URL ?? "https://aggregator.walrus-testnet.walrus.space";
const EPOCHS = Number(process.env.WALRUS_EPOCHS ?? 5);

async function hashBytes(bytes) {
  const hash = createHash("sha256").update(bytes).digest("hex");
  return `0x${hash}`;
}

function extractBlobId(result) {
  // newlyCreated: { blobObject: { blobId } } | { blobId }
  const nc = result?.newlyCreated;
  if (nc) {
    if (nc.blobObject?.blobId) return nc.blobObject.blobId;
    if (typeof nc.blobId === "string") return nc.blobId;
  }
  // alreadyCertified: { blobId }
  const ac = result?.alreadyCertified;
  if (ac?.blobId) return ac.blobId;
  // direct
  if (typeof result?.blobId === "string") return result.blobId;
  return null;
}

async function uploadToWalrus(bytes) {
  console.log(`  Uploading ${bytes.byteLength} bytes via ${PUBLISHER} (epochs=${EPOCHS})…`);
  const res = await fetch(`${PUBLISHER}/v1/blobs?epochs=${EPOCHS}`, {
    method: "PUT",
    body: bytes,
    headers: { "Content-Type": "application/octet-stream" },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Walrus upload failed: ${res.status} ${text}`);
  }
  const json = await res.json();
  const blobId = extractBlobId(json);
  if (!blobId) throw new Error(`Walrus upload: no blobId in response: ${JSON.stringify(json)}`);
  return { blobId, raw: json };
}

async function downloadFromWalrus(blobId) {
  console.log(`  Downloading blob ${blobId} via ${AGGREGATOR}…`);
  const res = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`);
  if (!res.ok) throw new Error(`Walrus download failed: ${res.status}`);
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

async function run() {
  console.log("=== RD-123: Live Walrus Upload Smoke ===");
  console.log(`Publisher:  ${PUBLISHER}`);
  console.log(`Aggregator: ${AGGREGATOR}`);
  console.log(`Epochs:     ${EPOCHS}`);
  console.log();

  // Create a synthetic packet for storage proof only — no real data.
  const synthetic = {
    renterName: "Alice Smoke Test",
    payslipMonthlyNetEur: 3200,
    coverLetter: "Live Walrus smoke test — RD-123",
    synthetic: true,
    smokeTimestamp: new Date().toISOString(),
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(synthetic));

  // In the real app path, Seal/AES-GCM encrypts before upload. This standalone
  // storage smoke proves Walrus byte availability only, using synthetic JSON bytes.
  const packetBytes = plaintext;
  const packetHash = await hashBytes(packetBytes);
  console.log(`[1] Synthetic packet prepared`);
  console.log(`    Size:        ${packetBytes.byteLength} bytes`);
  console.log(`    Packet hash: ${packetHash}`);
  console.log();

  // Upload via HTTP adapter
  console.log("[2] Uploading via HTTP adapter…");
  let blobId, uploadRaw;
  try {
    const result = await uploadToWalrus(packetBytes);
    blobId = result.blobId;
    uploadRaw = result.raw;
    console.log(`    Blob ID: ${blobId}`);
    console.log(`    Response shape: ${Object.keys(uploadRaw).join(", ")}`);
  } catch (err) {
    console.error(`\n  Upload failed: ${err.message}`);
    console.error("  (The Walrus testnet publisher may be temporarily unavailable — this is expected occasionally)");
    process.exit(1);
  }
  console.log();

  // Download and verify
  console.log("[3] Downloading and verifying…");
  let downloaded;
  try {
    downloaded = await downloadFromWalrus(blobId);
  } catch (err) {
    console.error(`  Download failed: ${err.message}`);
    process.exit(1);
  }

  if (downloaded.byteLength !== packetBytes.byteLength) {
    throw new Error(`Size mismatch: uploaded ${packetBytes.byteLength}, downloaded ${downloaded.byteLength}`);
  }
  for (let i = 0; i < packetBytes.byteLength; i++) {
    if (packetBytes[i] !== downloaded[i]) {
      throw new Error(`Byte mismatch at offset ${i}`);
    }
  }
  const downloadHash = await hashBytes(downloaded);
  if (downloadHash !== packetHash) {
    throw new Error(`Hash mismatch: ${packetHash} vs ${downloadHash}`);
  }
  console.log(`    ✓ Byte-identical. Hash matches: ${packetHash}`);
  console.log();

  // Record in testnet.json
  const testnetJsonPath = join(ROOT, "packages/contracts-config/testnet.json");
  const testnetJson = JSON.parse(readFileSync(testnetJsonPath, "utf-8"));

  testnetJson.walrus = {
    ticket: "RD-123",
    ranAtMs: Date.now(),
    note: "Live Walrus upload smoke. HTTP adapter only (walrus CLI not configured). Synthetic bytes verified byte-identical.",
    httpAdapter: {
      blobId,
      packetHash,
      sizeBytes: packetBytes.byteLength,
      epochs: EPOCHS,
      publisherUrl: PUBLISHER,
      aggregatorUrl: AGGREGATOR,
    },
    explorer: {
      blob: `https://walruscan.com/testnet/blob/${blobId}`,
    },
  };

  writeFileSync(testnetJsonPath, JSON.stringify(testnetJson, null, 2) + "\n");
  console.log("[4] Recorded in packages/contracts-config/testnet.json");
  console.log();

  console.log("=== RD-123 Complete ===");
  console.log(`Blob ID:     ${blobId}`);
  console.log(`Packet hash: ${packetHash}`);
  console.log(`Explorer:    https://walruscan.com/testnet/blob/${blobId}`);
}

run().catch((err) => {
  console.error("Smoke failed:", err);
  process.exit(1);
});
