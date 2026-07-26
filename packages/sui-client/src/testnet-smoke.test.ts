import { describe, expect, it } from "vitest";
import { createCasiumClient } from "./client.js";

describe.skipIf(process.env.RUN_SUI_TESTNET !== "1")("testnet config smoke", () => {
  const client = createCasiumClient({
    network: "testnet",
    rpcUrl: "https://fullnode.testnet.sui.io:443",
    packageId: "0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d",
  });

  it("reads the RD-007 smoke listing object", async () => {
    await expect(client.getListing("0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a")).resolves.toMatchObject({
      id: "0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a",
      municipality: 1,
      monthlyRentEur: 1700,
    });
  });

  it("reads the RD-007 smoke application receipt object", async () => {
    await expect(client.getReceipt("0xc46d42744b7381447851f9f2adb6cf32322ab4bd6aba243e925597418899ad20")).resolves.toMatchObject({
      id: "0xc46d42744b7381447851f9f2adb6cf32322ab4bd6aba243e925597418899ad20",
      mandateId: "0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee",
      listingId: "0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a",
      status: 1,
    });
  });
});
