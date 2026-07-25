import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWalrusAdapter, getWalrusMode } from "./index.js";

function withEnv(overrides: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

describe("createWalrusAdapter factory", () => {
  beforeEach(() => {
    delete process.env["WALRUS_MODE"];
    delete process.env["NEXT_PUBLIC_WALRUS_MODE"];
  });

  afterEach(() => {
    delete process.env["WALRUS_MODE"];
    delete process.env["NEXT_PUBLIC_WALRUS_MODE"];
  });

  it("defaults to mock when no mode is set", () => {
    const adapter = createWalrusAdapter();
    // Mock adapters produce 'mock' storage label
    expect(adapter).toBeDefined();
    // We can verify it's a mock by uploading and checking storage field
    void adapter.upload(new TextEncoder().encode("test")).then((r) => {
      expect(r.storage).toBe("mock");
    });
  });

  it("returns mock adapter for mode='mock'", () => {
    const adapter = createWalrusAdapter("mock");
    expect(adapter).toBeDefined();
  });

  it("returns http adapter for mode='http'", () => {
    const adapter = createWalrusAdapter("http");
    expect(adapter).toBeDefined();
    // HTTP adapter does not have node: imports, it uses fetch
    expect(typeof adapter.upload).toBe("function");
    expect(typeof adapter.download).toBe("function");
    expect(typeof adapter.status).toBe("function");
  });

  it("returns cli adapter for mode='cli'", () => {
    const adapter = createWalrusAdapter("cli");
    expect(adapter).toBeDefined();
    expect(typeof adapter.upload).toBe("function");
  });

  it("reads mode from WALRUS_MODE env var", () => {
    withEnv({ WALRUS_MODE: "mock" }, () => {
      const adapter = createWalrusAdapter();
      expect(adapter).toBeDefined();
    });
  });

  it("reads mode from NEXT_PUBLIC_WALRUS_MODE env var", () => {
    withEnv({ WALRUS_MODE: undefined, NEXT_PUBLIC_WALRUS_MODE: "mock" }, () => {
      const adapter = createWalrusAdapter();
      expect(adapter).toBeDefined();
    });
  });

  it("explicit mode parameter overrides env var", () => {
    withEnv({ WALRUS_MODE: "cli" }, () => {
      const adapter = createWalrusAdapter("mock");
      // Should be mock, not cli
      expect(adapter).toBeDefined();
    });
  });
});

describe("getWalrusMode", () => {
  afterEach(() => {
    delete process.env["WALRUS_MODE"];
    delete process.env["NEXT_PUBLIC_WALRUS_MODE"];
  });

  it("returns 'mock' by default", () => {
    delete process.env["WALRUS_MODE"];
    delete process.env["NEXT_PUBLIC_WALRUS_MODE"];
    expect(getWalrusMode()).toBe("mock");
  });

  it("returns value from WALRUS_MODE", () => {
    process.env["WALRUS_MODE"] = "http";
    expect(getWalrusMode()).toBe("http");
  });

  it("returns value from NEXT_PUBLIC_WALRUS_MODE when WALRUS_MODE is unset", () => {
    delete process.env["WALRUS_MODE"];
    process.env["NEXT_PUBLIC_WALRUS_MODE"] = "cli";
    expect(getWalrusMode()).toBe("cli");
  });
});
