"use client";

/**
 * ApplicationPacketAccess — RD-184 The Landlord Decrypts Their Own Applications
 *
 * Bridges one row of the landlord inbox to `PacketViewer`. The provider's JSON
 * only carries a receipt *summary*; the Seal identity and the policy are both
 * evaluated against the on-chain `ApplicationReceipt`, so this reads the object
 * from testnet and hands `PacketViewer` the same bytes the key servers will see.
 * Never reconstruct the receipt from provider JSON — that is a second source of
 * truth waiting to drift.
 */

import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { createCasiumClient } from "@casium/sui-client";
import { useQuery } from "@tanstack/react-query";
import { PACKAGE_ID, RPC_URL as RPC_URL_TESTNET } from "@casium/contracts-config";
import { PacketViewer } from "@/components/PacketViewer";
import type { ReservedApplication } from "@/components/ApplicationInbox";

type ApplicationPacketAccessProps = {
  application: ReservedApplication;
};

export function ApplicationPacketAccess({ application }: ApplicationPacketAccessProps) {
  const suiClient = useCurrentClient();
  const account = useCurrentAccount();
  const receiptId = application.receipt?.receiptId ?? null;

  // One query per receipt ID; TanStack dedupes across rows and against the
  // evidence panel, which reads the same way.
  const { data: receipt, isLoading, error } = useQuery({
    queryKey: ["receipt", receiptId],
    queryFn: async () => {
      const client = createCasiumClient(
        { network: "testnet", rpcUrl: RPC_URL_TESTNET, packageId: PACKAGE_ID },
        suiClient,
      );
      return client.getReceipt(receiptId as string);
    },
    enabled: receiptId !== null,
  });

  // No receipt yet — the inbox already says the application is awaiting
  // verification. Render nothing rather than a decrypt button that cannot work.
  if (receiptId === null) return null;

  if (isLoading) {
    return (
      <p className="muted mx-0 mt-2 mb-0 text-[0.85rem]" data-testid="packet-access-loading">
        Reading receipt from testnet…
      </p>
    );
  }

  if (error || !receipt) {
    return (
      <p data-testid="packet-access-error" className="mx-0 mt-2 mb-0 text-[0.85rem] text-red">
        Could not read receipt {receiptId.slice(0, 16)}… from testnet:{" "}
        {error instanceof Error ? error.message : "unknown error"}
      </p>
    );
  }

  // Pre-flight hint. The Move policy is the actual gate — this only explains the
  // denial before the landlord spends a signature on it.
  const wrongWallet =
    account !== null && receipt.landlord.toLowerCase() !== account.address.toLowerCase();

  return (
    <>
      {wrongWallet && (
        <p
          role="alert"
          data-testid="packet-access-wrong-wallet"
          className="mx-0 mt-2 mb-0 text-[0.85rem] text-amber"
        >
          This receipt names landlord <code>{receipt.landlord.slice(0, 12)}…</code>, not the
          connected wallet. `seal_approve_packet` will deny with ESEAL_WRONG_SENDER (17).
        </p>
      )}
      <PacketViewer receipt={receipt} />
    </>
  );
}
