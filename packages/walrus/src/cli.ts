import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnFile } from "./process.js";
import type { WalrusAdapter, WalrusBlobStatus } from "./adapter.js";

export type WalrusCliAdapterOptions = {
  walrusBin?: string;
  epochs?: number;
  context?: string;
  configPath?: string;
  walletPath?: string;
};

export function createWalrusCliAdapter(options: WalrusCliAdapterOptions = {}): WalrusAdapter {
  // Bare "walrus" relies on execvp/PATH lookup (spawnFile uses child_process.spawn
  // without shell: true) — put it on PATH yourself, e.g. via `nix develop` or
  // `PATH="$HOME/.local/bin:$PATH"`. No automatic ~/.local/bin discovery.
  const walrusBin = options.walrusBin ?? "walrus";
  const epochs = options.epochs ?? Number(process.env.WALRUS_EPOCHS ?? 1);

  return {
    async upload(bytes) {
      const dir = await mkdtemp(join(tmpdir(), "casium-walrus-"));
      const file = join(dir, "packet.bin");

      try {
        await writeFile(file, bytes);
        const output = await spawnWalrus(walrusBin, [...baseArgs(options), "store", "--epochs", String(epochs), "--json", file]);
        const parsed = parseJsonOutput(output);
        const blobId = findStringField(parsed, ["blobId", "blob_id", "id"]);
        if (!blobId) throw new Error(`Walrus store did not return a blob ID: ${output}`);
        return { blobId, size: bytes.byteLength, storage: "walrus" };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    async download(blobId) {
      const dir = await mkdtemp(join(tmpdir(), "casium-walrus-"));
      const file = join(dir, "packet.bin");

      try {
        await spawnWalrus(walrusBin, [...baseArgs(options), "read", "--out", file, blobId]);
        return new Uint8Array(await readFile(file));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    async status(blobId) {
      const output = await spawnWalrus(walrusBin, [...baseArgs(options), "blob-status", "--blob-id", blobId, "--json"]);
      const raw = parseJsonOutput(output);
      return { blobId, status: normalizeStatus(raw), raw };
    },
  };
}

export function parseWalrusBlobId(output: string): string | null {
  return findStringField(parseJsonOutput(output), ["blobId", "blob_id", "id"]);
}

function baseArgs(options: WalrusCliAdapterOptions) {
  return [
    ...(options.configPath ? ["--config", options.configPath] : []),
    ...(options.context ? ["--context", options.context] : []),
    ...(options.walletPath ? ["--wallet", options.walletPath] : []),
  ];
}

async function spawnWalrus(walrusBin: string, args: string[]) {
  const result = await spawnFile(walrusBin, args);
  if (result.code !== 0) throw new Error(`walrus ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

function parseJsonOutput(output: string): unknown {
  return JSON.parse(output);
}

function findStringField(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  for (const key of keys) {
    if (typeof record[key] === "string") return record[key];
  }

  for (const nested of Object.values(record)) {
    const found = Array.isArray(nested)
      ? nested.map((item) => findStringField(item, keys)).find((item): item is string => Boolean(item))
      : findStringField(nested, keys);
    if (found) return found;
  }

  return null;
}

function normalizeStatus(raw: unknown): WalrusBlobStatus {
  const serialized = JSON.stringify(raw).toLowerCase();
  if (serialized.includes("certified") || serialized.includes("stored") || serialized.includes("available")) return "stored";
  if (serialized.includes("not") && serialized.includes("found")) return "not_found";
  return "unknown";
}
