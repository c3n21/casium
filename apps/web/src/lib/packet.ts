import type { PacketDocument } from "@rentdelegate/shared";

export type EncryptedPacket = {
  ciphertextBase64: string;
  ivBase64: string;
  packetHash: string;
  packetSizeBytes: number;
  encryptedKeyBase64: string;
};

/**
 * Serialize, encrypt with AES-GCM, and hash a PacketDocument.
 *
 * Returns an exportable key for demo/audit purposes only.
 * In production, key management would be delegated to Seal.
 *
 * WARNING: synthetic documents only. Never pass real identity data.
 */
export async function encryptPacket(packet: PacketDocument): Promise<{ encrypted: EncryptedPacket; key: CryptoKey }> {
  const plaintext = new TextEncoder().encode(JSON.stringify(packet));

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );

  const hashBuffer = await crypto.subtle.digest("SHA-256", ciphertext);
  const packetHash = `0x${Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

  const rawKey = await crypto.subtle.exportKey("raw", key);
  const encryptedKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)));
  const ciphertextBase64 = btoa(String.fromCharCode(...ciphertext));
  const ivBase64 = btoa(String.fromCharCode(...iv));

  return {
    encrypted: {
      ciphertextBase64,
      ivBase64,
      packetHash,
      packetSizeBytes: ciphertext.byteLength,
      encryptedKeyBase64,
    },
    key,
  };
}

export async function decryptPacket(encrypted: EncryptedPacket, key: CryptoKey): Promise<PacketDocument> {
  const iv = Uint8Array.from(atob(encrypted.ivBase64), (c) => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertextBase64), (c) => c.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext)) as PacketDocument;
}

export function ciphertextBytes(encrypted: Pick<EncryptedPacket, "ciphertextBase64">): Uint8Array {
  return Uint8Array.from(atob(encrypted.ciphertextBase64), (c) => c.charCodeAt(0));
}
