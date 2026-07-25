"use client";

import type { PacketDocument } from "@rentdelegate/shared";
import { makeSyntheticPacket } from "@rentdelegate/shared";
import { useState } from "react";
import { useCurrentClient } from "@mysten/dapp-kit-react";
import { ciphertextBytes, decryptPacket, encryptPacket } from "../lib/packet";
import type { EncryptedPacket } from "../lib/packet";
import { createWalrusHttpAdapter } from "@rentdelegate/walrus/http";
import type { WalrusAdapter } from "@rentdelegate/walrus";
import { createSealClient } from "@rentdelegate/seal";
import { PACKAGE_ID } from "@rentdelegate/contracts-config";

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
  providerApiBase?: string; // defaults to NEXT_PUBLIC_PROVIDER_API_URL or localhost:4021
  onComplete?: (result: UploadResult) => void;
};

export function PacketBuilder({
  mandateId,
  listingObjectId,
  providerApiBase,
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
    <section style={{ fontFamily: "system-ui", maxWidth: 640, margin: "1rem 0" }}>
      <div role="alert" style={{ background: "#fef3cd", border: "1px solid #f0c040", borderRadius: 4, padding: "0.75rem 1rem", marginBottom: "1.5rem" }}>
        <strong>Synthetic data only.</strong> No real identity, financial, or tenant-screening data.
      </div>

      <p style={{ color: "#555", marginTop: 0 }}>
        Encryption: <code>{encryptionBadge}</code>
      </p>

      <label>
        Renter name (synthetic)
        <input type="text" value={form.renterName ?? "Alice Demo"} onChange={(e) => setForm((f) => ({ ...f, renterName: e.target.value }))} style={inputStyle} />
      </label>

      <label style={{ display: "block", marginTop: 12 }}>
        Monthly net salary (EUR)
        <input type="number" value={form.payslipMonthlyNetEur ?? 3200} onChange={(e) => setForm((f) => ({ ...f, payslipMonthlyNetEur: Number(e.target.value) }))} style={inputStyle} />
      </label>

      <label style={{ display: "block", marginTop: 12 }}>
        Cover letter
        <textarea value={form.coverLetter ?? "I am a reliable tenant…"} onChange={(e) => setForm((f) => ({ ...f, coverLetter: e.target.value }))} rows={3} style={{ ...inputStyle, fontFamily: "inherit" }} />
      </label>

      <button onClick={handleBuild} disabled={stage.type === "encrypting" || stage.type === "uploading"} style={{ ...buttonStyle, marginTop: 12 }}>
        {stage.type === "encrypting" ? "Encrypting…" : stage.type === "uploading" ? "Uploading…" : "Encrypt and upload packet"}
      </button>

      {stage.type === "error" && <p role="alert" style={{ color: "red", marginTop: 12 }}>Error: {stage.message}</p>}

      {stage.type === "done" && (
        <div style={{ marginTop: 24, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 4, padding: "1rem" }}>
          <strong>Packet uploaded</strong>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <tbody>
              <tr><td style={{ fontWeight: 600, paddingRight: 12, paddingBottom: 6 }}>Walrus blob ID</td><td><code style={{ wordBreak: "break-all" }}>{stage.result.walrusBlobId}</code></td></tr>
              <tr><td style={{ fontWeight: 600, paddingRight: 12, paddingBottom: 6 }}>Packet hash</td><td><code style={{ wordBreak: "break-all" }}>{stage.result.packetHash}</code></td></tr>
              <tr><td style={{ fontWeight: 600, paddingRight: 12 }}>Size</td><td>{stage.result.sizeBytes} bytes</td></tr>
            </tbody>
          </table>
          <p style={{ color: "#166534", marginBottom: 0, marginTop: 8 }}>Only ciphertext was uploaded. Plaintext never sent to provider API.</p>
          {/* Hand off to the agent with this packet's mandate already filled in — the two
              pages must name the same mandate, and copying a 66-char ID by hand is where
              that goes wrong. */}
          <p style={{ marginBottom: 0, marginTop: 12 }}>
            <a href={`/agent?mandateId=${encodeURIComponent(mandateId)}`} style={{ fontWeight: 600 }}>
              Start the agent run on this packet →
            </a>
          </p>
          {stage.encrypted && stage.key && (
            <button onClick={handleVerifyDecrypt} style={{ ...buttonStyle, marginTop: 12, background: "#16a34a" }}>Verify decryption round-trip</button>
          )}
        </div>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = { display: "block", width: "100%", marginTop: 4, padding: "0.5rem", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: "inherit" };
const buttonStyle: React.CSSProperties = { padding: "0.7rem 1.2rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: 4, fontSize: "inherit", cursor: "pointer" };
