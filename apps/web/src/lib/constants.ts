export const PACKAGE_ID = "0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d";

export const EXPLORER_TX = (digest: string) =>
  `https://suivision.xyz/txblock/${digest}?network=testnet`;

export const EXPLORER_OBJECT = (id: string) =>
  `https://suivision.xyz/object/${id}?network=testnet`;

export const RPC_URL_TESTNET = "https://fullnode.testnet.sui.io:443";
