import { makeSyntheticPacket } from "@rentdelegate/shared";
import { describe, expect, it } from "vitest";
import { ciphertextBytes, decryptPacket, encryptPacket } from "../lib/packet.js";

describe("packet encryption", () => {
  it("round-trips a synthetic packet with AES-GCM", async () => {
    const packet = makeSyntheticPacket();

    const { encrypted, key } = await encryptPacket(packet);

    expect(encrypted.packetHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(encrypted.ciphertextBase64.length).toBeGreaterThan(0);
    expect(encrypted.packetSizeBytes).toBeGreaterThan(0);

    const decrypted = await decryptPacket(encrypted, key);
    expect(decrypted.renterName).toBe(packet.renterName);
    expect(decrypted.synthetic).toBe(true);
    expect(decrypted.type).toBe("rental_application_packet");
  });

  it("ciphertext changes every call (fresh IV)", async () => {
    const packet = makeSyntheticPacket();
    const { encrypted: a } = await encryptPacket(packet);
    const { encrypted: b } = await encryptPacket(packet);

    expect(a.ciphertextBase64).not.toBe(b.ciphertextBase64);
    expect(a.ivBase64).not.toBe(b.ivBase64);
  });

  it("ciphertextBytes returns correct byte length", async () => {
    const packet = makeSyntheticPacket();
    const { encrypted } = await encryptPacket(packet);
    const bytes = ciphertextBytes(encrypted);
    expect(bytes.byteLength).toBe(encrypted.packetSizeBytes);
  });
});
