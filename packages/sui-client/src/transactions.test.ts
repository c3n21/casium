import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRentDelegateClient } from "./client.js";
import type { RentDelegateConfig } from "./types.js";

const config: RentDelegateConfig = {
  network: "testnet",
  rpcUrl: "https://fullnode.testnet.sui.io:443",
  packageId: "0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d",
};

describe("RentDelegate Sui transactions", () => {
  it("builds create mandate PTBs with the published rental target", async () => {
    const tx = createRentDelegateClient(config).buildCreateMandateTx({
      agentSuiAddress: "0x371321932fb4c4b79b9b0762ac0878ebfb670cc6f6327ecf9d1d06cd9489243e",
      agentEvmAddressBytes: [49, 49, 49],
      maxMonthlyRentEur: 1800,
      allowedMunicipalities: [1, 2, 3],
      minBedrooms: 1,
      expiresAtMs: 1_790_000_000_000,
      remainingApplications: 2,
      permittedActions: 1,
    });

    const json = JSON.parse(await tx.toJSON());
    expect(json.commands[0].MoveCall).toMatchObject({
      package: config.packageId,
      module: "rental",
      function: "create_mandate",
    });
  });

  it("builds submit application PTBs without signer custody", async () => {
    const tx = createRentDelegateClient(config).buildSubmitApplicationTx({
      mandateId: "0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee",
      listingObjectId: "0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a",
      agentCapId: "0xabeb55d1266102eed4235531c542fb01fd85bb3095c3d579960923f2e1e25c2a",
      walrusBlobIdBytes: [109, 111, 99, 107],
      packetHashBytes: [104, 97, 115, 104],
      accessExpiresAtMs: 1_790_000_000_000,
      worldRefHashBytes: [119, 111, 114, 108, 100],
    });

    const json = JSON.parse(await tx.toJSON());
    expect(json.commands[0].MoveCall).toMatchObject({
      package: config.packageId,
      module: "rental",
      function: "submit_application",
    });
  });

  it("reads package config shape from RD-007 deployment output", () => {
    const deployment = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../../contracts-config/testnet.json"), "utf8"),
    );

    expect(deployment.packageId).toBe(config.packageId);
    expect(deployment.smoke.listingObjectId).toBe("0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a");
  });
});
