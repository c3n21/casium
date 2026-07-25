import { makeSyntheticPacket } from "@rentdelegate/shared";
import type { PacketDocument } from "@rentdelegate/shared";
import { createMockWalrusAdapter } from "@rentdelegate/walrus";
import { useState } from "react";
import { ciphertextBytes, decryptPacket, encryptPacket } from "../lib/packet.js";
import type { EncryptedPacket } from "../lib/packet.js";

type UploadResult = {
  walrusBlobId: string;
  packetHash: string;
  sizeBytes: number;
};

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

  const walrus = createMockWalrusAdapter();

  async function handleBuild() {
    try {
      setStage({ type: "encrypting" });

      const packet = makeSyntheticPacket(form);
      const { encrypted, key } = await encryptPacket(packet);

      setStage({ type: "uploading", encrypted, key });

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
    <section style={{ fontFamily: "system-ui", maxWidth: 640, margin: "2rem auto", padding: "1rem" }}>
      <div
        role="alert"
        style={{
          background: "#fef3cd",
          border: "1px solid #f0c040",
          borderRadius: 4,
          padding: "0.75rem 1rem",
          marginBottom: "1.5rem",
        }}
      >
        <strong>Synthetic data only.</strong> This form generates placeholder documents for demo purposes. No real
        identity, financial, or tenant-screening data should be entered.
      </div>

      <h2 style={{ marginTop: 0 }}>Rental Application Packet Builder</h2>
      <p style={{ color: "#555" }}>
        Walrus mode: <code>{walrusMode}</code> — ciphertext is uploaded to{" "}
        {walrusMode === "mock" ? "in-memory mock storage" : "Walrus testnet"}.
      </p>

      <label>
        Renter name (synthetic)
        <input
          type="text"
          value={form.renterName ?? "Alice Demo"}
          onChange={(e) => setForm((f) => ({ ...f, renterName: e.target.value }))}
          style={{ display: "block", width: "100%", marginTop: 4, marginBottom: 12, padding: "0.5rem" }}
        />
      </label>

      <label>
        Monthly net salary (EUR)
        <input
          type="number"
          value={form.payslipMonthlyNetEur ?? 3200}
          onChange={(e) => setForm((f) => ({ ...f, payslipMonthlyNetEur: Number(e.target.value) }))}
          style={{ display: "block", width: "100%", marginTop: 4, marginBottom: 12, padding: "0.5rem" }}
        />
      </label>

      <label>
        Cover letter
        <textarea
          value={
            form.coverLetter ??
            "I am a reliable tenant with stable employment. This is a synthetic demo document — no real identity data is included."
          }
          onChange={(e) => setForm((f) => ({ ...f, coverLetter: e.target.value }))}
          rows={4}
          style={{ display: "block", width: "100%", marginTop: 4, marginBottom: 12, padding: "0.5rem" }}
        />
      </label>

      <button
        onClick={handleBuild}
        disabled={stage.type === "encrypting" || stage.type === "uploading"}
        style={{ padding: "0.7rem 1.2rem", cursor: "pointer" }}
      >
        {stage.type === "encrypting"
          ? "Encrypting…"
          : stage.type === "uploading"
            ? "Uploading…"
            : "Encrypt and upload packet"}
      </button>

      {stage.type === "error" && (
        <p role="alert" style={{ color: "red", marginTop: 12 }}>
          Error: {stage.message}
        </p>
      )}

      {stage.type === "done" && (
        <div
          style={{
            marginTop: 24,
            background: "#f0fdf4",
            border: "1px solid #86efac",
            borderRadius: 4,
            padding: "1rem",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Packet uploaded</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ fontWeight: 600, paddingBottom: 8, paddingRight: 12 }}>Walrus blob ID</td>
                <td>
                  <code style={{ wordBreak: "break-all" }}>{stage.result.walrusBlobId}</code>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600, paddingBottom: 8, paddingRight: 12 }}>Packet hash</td>
                <td>
                  <code style={{ wordBreak: "break-all" }}>{stage.result.packetHash}</code>
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600, paddingBottom: 8, paddingRight: 12 }}>Ciphertext size</td>
                <td>{stage.result.sizeBytes} bytes</td>
              </tr>
            </tbody>
          </table>
          <p style={{ color: "#166534", marginBottom: 0 }}>
            Only encrypted ciphertext was uploaded. Plaintext was never sent to the provider API.
          </p>
          <button onClick={handleVerifyDecrypt} style={{ marginTop: 12, padding: "0.5rem 1rem", cursor: "pointer" }}>
            Verify decryption round-trip
          </button>
        </div>
      )}
    </section>
  );
}
