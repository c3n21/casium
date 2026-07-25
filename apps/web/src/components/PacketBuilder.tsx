"use client";

import type { PacketDocument } from "@rentdelegate/shared";
import { makeSyntheticPacket } from "@rentdelegate/shared";
import { useState } from "react";
import { ciphertextBytes, decryptPacket, encryptPacket } from "../lib/packet";
import type { EncryptedPacket } from "../lib/packet";

// Browser-only mock Walrus adapter — avoids importing Node.js-only walrus CLI adapter
function createBrowserMockWalrus() {
  const blobs = new Map<string, Uint8Array>();
  return {
    async upload(bytes: Uint8Array) {
      const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
      const hex = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const blobId = `mock:${hex}`;
      blobs.set(blobId, bytes);
      return { blobId, size: bytes.byteLength };
    },
  };
}

type UploadResult = { walrusBlobId: string; packetHash: string; sizeBytes: number };

type Stage =
  | { type: "idle" }
  | { type: "encrypting" }
  | { type: "uploading"; encrypted: EncryptedPacket; key: CryptoKey }
  | { type: "done"; result: UploadResult; encrypted: EncryptedPacket; key: CryptoKey }
  | { type: "error"; message: string };

type PacketBuilderProps = {
  walrusMode?: "mock" | "real";
  onComplete?: (result: UploadResult) => void;
};

export function PacketBuilder({ walrusMode = "mock", onComplete }: PacketBuilderProps) {
  const [form, setForm] = useState<Partial<PacketDocument>>({});
  const [stage, setStage] = useState<Stage>({ type: "idle" });

  async function handleBuild() {
    try {
      setStage({ type: "encrypting" });
      const packet = makeSyntheticPacket(form);
      const { encrypted, key } = await encryptPacket(packet);

      setStage({ type: "uploading", encrypted, key });
      const walrus = createBrowserMockWalrus();
      const bytes = ciphertextBytes(encrypted);
      const { blobId } = await walrus.upload(bytes);

      const result: UploadResult = {
        walrusBlobId: blobId,
        packetHash: encrypted.packetHash,
        sizeBytes: encrypted.packetSizeBytes,
      };
      setStage({ type: "done", result, encrypted, key });
      onComplete?.(result);
    } catch (error) {
      setStage({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  async function handleVerifyDecrypt() {
    if (stage.type !== "done") return;
    try {
      const plaintext = await decryptPacket(stage.encrypted, stage.key);
      alert(`Decryption round-trip OK.\nName: ${plaintext.renterName}\nSynthetic: ${String(plaintext.synthetic)}`);
    } catch {
      alert("Decryption failed.");
    }
  }

  return (
    <section style={{ fontFamily: "system-ui", maxWidth: 640, margin: "1rem 0" }}>
      <div role="alert" style={{ background: "#fef3cd", border: "1px solid #f0c040", borderRadius: 4, padding: "0.75rem 1rem", marginBottom: "1.5rem" }}>
        <strong>Synthetic data only.</strong> No real identity, financial, or tenant-screening data.
      </div>

      <p style={{ color: "#555", marginTop: 0 }}>
        Walrus mode: <code>{walrusMode}</code> — only encrypted ciphertext is uploaded.
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
          <button onClick={handleVerifyDecrypt} style={{ ...buttonStyle, marginTop: 12, background: "#16a34a" }}>Verify decryption round-trip</button>
        </div>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = { display: "block", width: "100%", marginTop: 4, padding: "0.5rem", border: "1px solid #cbd5e1", borderRadius: 4, fontSize: "inherit" };
const buttonStyle: React.CSSProperties = { padding: "0.7rem 1.2rem", background: "#2563eb", color: "#fff", border: "none", borderRadius: 4, fontSize: "inherit", cursor: "pointer" };
