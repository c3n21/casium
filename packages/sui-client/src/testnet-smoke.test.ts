import { describe, expect, it } from "vitest";
import { createRentDelegateClient } from "./client.js";

describe.skipIf(process.env.RUN_SUI_TESTNET !== "1")("testnet config smoke", () => {
  it("reads the RD-007 smoke listing object", async () => {
    const client = createRentDelegateClient({
      network: "testnet",
      rpcUrl: "https://fullnode.testnet.sui.io:443",
      packageId: "0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d",
    });

    await expect(client.getListing("0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a")).resolves.toMatchObject({
      id: "0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a",
      municipality: 1,
      monthlyRentEur: 1700,
    });
  });
});
