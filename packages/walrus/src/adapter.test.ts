import { describe, expect, test } from "vitest";
import {
  accessExpiryFromEpochs,
  blobCoversAccessWindow,
  epochsForAccessWindow,
  WALRUS_EPOCH_DURATION_MS,
} from "./adapter.js";

describe("epoch utilities", () => {
  const NOW = 1_700_000_000_000; // fixed reference time

  describe("epochsForAccessWindow", () => {
    test("rounds up and adds +1 buffer epoch", () => {
      // Exactly 3 days → ceil(3) + 1 = 4
      const accessExpiresAtMs = NOW + 3 * WALRUS_EPOCH_DURATION_MS;
      expect(epochsForAccessWindow(accessExpiresAtMs, NOW)).toBe(4);
    });

    test("fractional days still round up", () => {
      // 1.5 days → ceil(1.5) + 1 = 3
      const accessExpiresAtMs = NOW + 1.5 * WALRUS_EPOCH_DURATION_MS;
      expect(epochsForAccessWindow(accessExpiresAtMs, NOW)).toBe(3);
    });

    test("30-day access window returns 31 epochs", () => {
      const accessExpiresAtMs = NOW + 30 * WALRUS_EPOCH_DURATION_MS;
      expect(epochsForAccessWindow(accessExpiresAtMs, NOW)).toBe(31);
    });

    test("returns at least 1 even for very short windows", () => {
      // Sub-millisecond window: ceil rounds to 1, +1 buffer = 2, max(2, 1) = 2
      const accessExpiresAtMs = NOW + 1; // 1 ms
      expect(epochsForAccessWindow(accessExpiresAtMs, NOW)).toBeGreaterThanOrEqual(1);
    });

    test("throws for expired window (accessExpiresAtMs <= now)", () => {
      expect(() => epochsForAccessWindow(NOW - 1000, NOW)).toThrow("Access window already expired");
    });

    test("throws when accessExpiresAtMs equals now", () => {
      expect(() => epochsForAccessWindow(NOW, NOW)).toThrow("Access window already expired");
    });
  });

  describe("accessExpiryFromEpochs", () => {
    test("subtracts 1 buffer epoch from expiry calculation", () => {
      // 5 epochs → now + (5-1) * epoch = now + 4 days
      const result = accessExpiryFromEpochs(5, NOW);
      expect(result).toBe(NOW + 4 * WALRUS_EPOCH_DURATION_MS);
    });

    test("1 epoch returns now (zero usable coverage after buffer)", () => {
      expect(accessExpiryFromEpochs(1, NOW)).toBe(NOW);
    });

    test("is inverse of epochsForAccessWindow for whole-day windows", () => {
      const targetExpiryMs = NOW + 10 * WALRUS_EPOCH_DURATION_MS;
      const epochs = epochsForAccessWindow(targetExpiryMs, NOW); // 11
      // accessExpiryFromEpochs(11) = now + 10 days ≥ targetExpiryMs
      const derivedExpiry = accessExpiryFromEpochs(epochs, NOW);
      expect(derivedExpiry).toBeGreaterThanOrEqual(targetExpiryMs);
    });
  });

  describe("blobCoversAccessWindow", () => {
    test("returns true when blob expires after access window", () => {
      // 10 epochs → blob expires NOW + 10 days; access window = NOW + 5 days
      const accessExpiresAtMs = NOW + 5 * WALRUS_EPOCH_DURATION_MS;
      expect(blobCoversAccessWindow(10, accessExpiresAtMs, NOW)).toBe(true);
    });

    test("returns true when blob expiry equals access window exactly", () => {
      const accessExpiresAtMs = NOW + 5 * WALRUS_EPOCH_DURATION_MS;
      expect(blobCoversAccessWindow(5, accessExpiresAtMs, NOW)).toBe(true);
    });

    test("returns false when blob expires before access window", () => {
      // 3 epochs → blob expires NOW + 3 days; access window = NOW + 5 days
      const accessExpiresAtMs = NOW + 5 * WALRUS_EPOCH_DURATION_MS;
      expect(blobCoversAccessWindow(3, accessExpiresAtMs, NOW)).toBe(false);
    });

    test("default configured epochs of 5 do NOT cover a 30-day access window", () => {
      const accessExpiresAtMs = NOW + 30 * WALRUS_EPOCH_DURATION_MS;
      expect(blobCoversAccessWindow(5, accessExpiresAtMs, NOW)).toBe(false);
    });

    test("31 epochs cover a 30-day access window", () => {
      const accessExpiresAtMs = NOW + 30 * WALRUS_EPOCH_DURATION_MS;
      expect(blobCoversAccessWindow(31, accessExpiresAtMs, NOW)).toBe(true);
    });
  });
});
