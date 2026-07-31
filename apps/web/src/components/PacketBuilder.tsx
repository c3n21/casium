"use client";

import type { PacketDocument } from "@casium/shared";
import { makeSyntheticPacket } from "@casium/shared";
import { useState } from "react";
import { useCurrentClient } from "@mysten/dapp-kit-react";
import { ciphertextBytes, decryptPacket, encryptPacket } from "../lib/packet";
import type { EncryptedPacket } from "../lib/packet";
import { createWalrusHttpAdapter } from "@casium/walrus/http";
import type { WalrusAdapter } from "@casium/walrus";
import { createSealClient } from "@casium/seal";
import { PACKAGE_ID } from "@casium/contracts-config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Determine the active Walrus mode from the Next.js public env var.
// This mirrors what getWalrusMode() returns server-side.
function resolveWalrusMode(): "mock" | "http" | "cli" {
  const mode = process.env.NEXT_PUBLIC_WALRUS_MODE;
  if (mode === "http" || mode === "cli") return mode;
  return "mock";
}

// Browser-compatible mock adapter — uses crypto.subtle (no node:crypto).
// Used when NEXT_PUBLIC_WALRUS_MODE=mock (the default for dev).
function createBrowserMockAdapter(): WalrusAdapter {
  const blobs = new Map<string, Uint8Array>();
  return {
    async upload(bytes: Uint8Array) {
      const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.buffer instanceof ArrayBuffer ? bytes.buffer : new Uint8Array(bytes).buffer);
      const hex = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const blobId = `mock:${hex}`;
      blobs.set(blobId, bytes);
      return { blobId, size: bytes.byteLength, storage: "mock" as const };
    },
    async download(blobId: string) {
      const blob = blobs.get(blobId);
      if (!blob) throw new Error(`Mock blob not found: ${blobId}`);
      return Uint8Array.from(blob);
    },
    async status(blobId: string) {
      return { blobId, status: blobs.has(blobId) ? ("stored" as const) : ("not_found" as const) };
    },
  };
}

function createBrowserWalrusAdapter(): WalrusAdapter {
  const mode = resolveWalrusMode();
  if (mode === "http") return createWalrusHttpAdapter();
  // cli mode is not supported in the browser; fall back to mock
  return createBrowserMockAdapter();
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer instanceof ArrayBuffer ? bytes.buffer : new Uint8Array(bytes).buffer,
  );
  return "0x" + Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type UploadResult = { walrusBlobId: string; packetHash: string; sizeBytes: number };

type Stage =
  | { type: "idle" }
  | { type: "encrypting" }
  | { type: "uploading" }
  | { type: "done"; result: UploadResult; encryptionLabel: string; encrypted?: EncryptedPacket; key?: CryptoKey }
  | { type: "error"; message: string };

type PacketBuilderProps = {
  mandateId: string; // required — needed to register the packet with the provider
  listingObjectId?: string; // needed for Seal identity (RD-135)
  providerListingId?: string; // needed for multi-listing packet scoping
  providerApiBase?: string; // defaults to NEXT_PUBLIC_PROVIDER_API_URL or localhost:4021
  showAgentRunLink?: boolean;
  onComplete?: (result: UploadResult) => void;
};

export function PacketBuilder({
  mandateId,
  listingObjectId,
  providerListingId,
  providerApiBase,
  showAgentRunLink = true,
  onComplete,
}: PacketBuilderProps) {
  const suiClient = useCurrentClient();
  const [form, setForm] = useState<Partial<PacketDocument>>({});
  const [stage, setStage] = useState<Stage>({ type: "idle" });

  const apiBase =
    providerApiBase ??
    process.env.NEXT_PUBLIC_PROVIDER_API_URL ??
    "http://localhost:4021";

  // Encryption mode is driven by env var, never by a prop default.
  const encryptionMode = process.env.NEXT_PUBLIC_ENCRYPTION_MODE ?? "mock";

  async function handleBuild() {
    try {
      setStage({ type: "encrypting" });

      if (encryptionMode === "seal" && listingObjectId) {
        // -----------------------------------------------------------------------
        // Seal encryption path (RD-135)
        // -----------------------------------------------------------------------
        // The Seal namespace must be the *original* (v1) package ID. @mysten/seal
        // rejects any other version ("Package … is not the first version"), and
        // resolves the latest version itself when dry-running seal_approve_packet.
        // Only the PTB move-call target uses LATEST_PACKAGE_ID — see PacketViewer.
        const sealClientWrapper = createSealClient({
          suiClient,
          packageId: PACKAGE_ID,
          threshold: 2,
        });

        const packetJson = JSON.stringify(makeSyntheticPacket(form));
        const packetBytes = new TextEncoder().encode(packetJson);

        // encryptPacket discards the backup symmetric key — no key retained in state
        const encryptedBytes = await sealClientWrapper.encryptPacket(packetBytes, {
          mandateId,
          listingObjectId,
        });

        const packetHash = await sha256Hex(encryptedBytes);

        setStage({ type: "uploading" });
        const walrus = createBrowserWalrusAdapter();
        const { blobId } = await walrus.upload(encryptedBytes);

        // Register with provider API
        const providerResponse = await fetch(`${apiBase}/packets`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mandateId,
            ...(providerListingId ? { providerListingId } : {}),
            walrusBlobId: blobId,
            packetHash,
            sizeBytes: encryptedBytes.byteLength,
            encryptionMode: "seal",
          }),
        });

        if (!providerResponse.ok) {
          const err = (await providerResponse.json().catch(() => ({}))) as { error?: string };
          throw new Error(`Packet registration failed: ${err.error ?? providerResponse.status}`);
        }

        const result: UploadResult = {
          walrusBlobId: blobId,
          packetHash,
          sizeBytes: encryptedBytes.byteLength,
        };
        setStage({ type: "done", result, encryptionLabel: "seal" });
        onComplete?.(result);
      } else {
        // -----------------------------------------------------------------------
        // AES-GCM mock path (default for offline dev)
        // -----------------------------------------------------------------------
        const packet = makeSyntheticPacket(form);
        const { encrypted, key } = await encryptPacket(packet);

        setStage({ type: "uploading" });
        const walrus = createBrowserWalrusAdapter();
        const bytes = ciphertextBytes(encrypted);
        const { blobId } = await walrus.upload(bytes);

        const activeEncMode: "aes-gcm" | "mock" =
          blobId.startsWith("mock:") ? "mock" : "aes-gcm";

        // Register the packet record with the provider API
        const providerResponse = await fetch(`${apiBase}/packets`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mandateId,
            ...(providerListingId ? { providerListingId } : {}),
            walrusBlobId: blobId,
            packetHash: encrypted.packetHash,
            sizeBytes: encrypted.packetSizeBytes,
            encryptionMode: activeEncMode,
          }),
        });

        if (!providerResponse.ok) {
          const err = (await providerResponse.json().catch(() => ({}))) as { error?: string };
          throw new Error(`Packet registration failed: ${err.error ?? providerResponse.status}`);
        }

        const result: UploadResult = {
          walrusBlobId: blobId,
          packetHash: encrypted.packetHash,
          sizeBytes: encrypted.packetSizeBytes,
        };
        setStage({ type: "done", result, encryptionLabel: activeEncMode, encrypted, key });
        onComplete?.(result);
      }
    } catch (error) {
      setStage({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleVerifyDecrypt() {
    if (stage.type !== "done" || !stage.encrypted || !stage.key) return;
    try {
      const plaintext = await decryptPacket(stage.encrypted, stage.key);
      alert(`Decryption round-trip OK.\nName: ${plaintext.renterName}\nSynthetic: ${String(plaintext.synthetic)}`);
    } catch {
      alert("Decryption failed.");
    }
  }

  // Derive encryption mode label for display
  function getEncryptionModeLabel(): string {
    if (stage.type === "done") return stage.encryptionLabel;
    return encryptionMode === "seal" && listingObjectId ? "seal" : resolveWalrusMode() === "http" ? "aes-gcm" : "mock";
  }

  const activeLabel = getEncryptionModeLabel();

  // Human-readable encryption mode indicator
  const encryptionBadge =
    activeLabel === "seal"
      ? "[Seal encryption — policy-controlled, key in key servers]"
      : "[MOCK encryption — AES-GCM, key in browser only]";

  return (
    <section className="stack my-4 max-w-[640px]">
      <div role="alert" className="alert warn" data-testid="synthetic-data-badge">
        <strong>Synthetic data only.</strong> No real identity, financial, or tenant-screening data.
      </div>

      <p className="muted mt-0" data-testid="encryption-mode-badge">
        Encryption: <code>{encryptionBadge}</code>
      </p>

      <label>
        Renter name (synthetic)
        <Input data-testid="renter-name-input" type="text" value={form.renterName ?? "Alice Demo"} onChange={(e) => setForm((f) => ({ ...f, renterName: e.target.value }))} />
      </label>

      <label className="mt-3 block">
        Monthly net salary (EUR)
        <Input data-testid="salary-input" type="number" value={form.payslipMonthlyNetEur ?? 3200} onChange={(e) => setForm((f) => ({ ...f, payslipMonthlyNetEur: Number(e.target.value) }))} />
      </label>

      <label className="mt-3 block">
        Cover letter
        <Textarea data-testid="cover-letter-input" value={form.coverLetter ?? "I am a reliable tenant…"} onChange={(e) => setForm((f) => ({ ...f, coverLetter: e.target.value }))} rows={3} />
      </label>

      <Button data-testid={providerListingId ? `upload-packet-button-${providerListingId}` : "packet-upload-button"} className="mt-3" onClick={handleBuild} disabled={stage.type === "encrypting" || stage.type === "uploading"}>
        {stage.type === "encrypting" ? "Encrypting…" : stage.type === "uploading" ? "Uploading…" : "Encrypt and upload packet"}
      </Button>

      {stage.type === "error" && <p role="alert" className="mt-3 text-red">Error: {stage.message}</p>}

      {stage.type === "done" && (
        <div className="alert success mt-6" data-testid={providerListingId ? `packet-uploaded-${providerListingId}` : "packet-uploaded"}>
          <strong>Packet uploaded</strong>
          <table className="mt-2">
            <tbody>
              <tr><td className="pr-3 pb-1.5 font-semibold">Walrus blob ID</td><td><code className="break-all">{stage.result.walrusBlobId}</code></td></tr>
              <tr><td className="pr-3 pb-1.5 font-semibold">Packet hash</td><td><code className="break-all">{stage.result.packetHash}</code></td></tr>
              <tr><td className="pr-3 font-semibold">Size</td><td>{stage.result.sizeBytes} bytes</td></tr>
            </tbody>
          </table>
          <p data-testid="privacy-confirmation" className="mt-2 mb-0">Only ciphertext was uploaded. Plaintext never sent to provider API.</p>
          {/* Hand off to the agent with this packet's mandate already filled in — the two
              pages must name the same mandate, and copying a 66-char ID by hand is where
              that goes wrong. */}
          {showAgentRunLink && (
            <p className="mt-3 mb-0">
              <a href={`/agent?mandateId=${encodeURIComponent(mandateId)}`} data-testid="start-agent-run-link" className="font-semibold">
                Start the agent run on this packet →
              </a>
            </p>
          )}
          {stage.encrypted && stage.key && (
            <Button className="mt-3 bg-mint hover:bg-mint/90" onClick={handleVerifyDecrypt}>Verify decryption round-trip</Button>
          )}
        </div>
      )}
    </section>
  );
}
