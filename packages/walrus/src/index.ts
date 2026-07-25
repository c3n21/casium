export * from "./adapter.js";
export * from "./cli.js";
export * from "./httpAdapter.js";
export * from "./mock.js";

import { createWalrusCliAdapter } from "./cli.js";
import { createWalrusHttpAdapter } from "./httpAdapter.js";
import { createMockWalrusAdapter } from "./mock.js";
import type { WalrusAdapter, WalrusAdapterMode } from "./adapter.js";

export function createWalrusAdapter(mode?: WalrusAdapterMode): WalrusAdapter {
  const resolvedMode: WalrusAdapterMode =
    mode ??
    (process.env["WALRUS_MODE"] as WalrusAdapterMode | undefined) ??
    (process.env["NEXT_PUBLIC_WALRUS_MODE"] as WalrusAdapterMode | undefined) ??
    "mock";

  switch (resolvedMode) {
    case "real":
    case "http":
      return createWalrusHttpAdapter();
    case "cli":
      return createWalrusCliAdapter();
    default:
      return createMockWalrusAdapter();
  }
}

export function getWalrusMode(): WalrusAdapterMode {
  return (
    (process.env["WALRUS_MODE"] as WalrusAdapterMode | undefined) ??
    (process.env["NEXT_PUBLIC_WALRUS_MODE"] as WalrusAdapterMode | undefined) ??
    "mock"
  );
}
