import { describe, expect, it } from "vitest";
import { parseWalrusBlobId } from "./cli.js";

describe("Walrus CLI output parsing", () => {
  it("finds blob IDs in common JSON shapes", () => {
    expect(parseWalrusBlobId(JSON.stringify({ blobId: "abc" }))).toBe("abc");
    expect(parseWalrusBlobId(JSON.stringify({ newlyCreated: { blob_id: "def" } }))).toBe("def");
  });
});
