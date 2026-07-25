"use client";

import { createDAppKit, DAppKitProvider } from "@mysten/dapp-kit-react";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

declare module "@mysten/dapp-kit-react" {
  // dAppKit is typed loosely here; the full type is not needed for hook inference in this app.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Register { dAppKit: any }
}

const GRPC_URLS: Record<string, string> = {
  testnet: "https://fullnode.testnet.sui.io:443",
  mainnet: "https://fullnode.mainnet.sui.io:443",
};

const dAppKit = createDAppKit({
  networks: ["testnet", "mainnet"] as const,
  defaultNetwork: "testnet",
  createClient: (network: string) =>
    new SuiGrpcClient({ network, baseUrl: GRPC_URLS[network] ?? GRPC_URLS.testnet }),
});

const queryClient = new QueryClient();

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DAppKitProvider dAppKit={dAppKit}>{children}</DAppKitProvider>
    </QueryClientProvider>
  );
}
