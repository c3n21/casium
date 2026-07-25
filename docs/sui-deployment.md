# Sui Testnet Deployment

RD-007 published `packages/move` to Sui testnet.

## Package

- Package ID: `0x7e0130cdc105d06707f1f3abd4c76aac8211a09a5502692ba454d1b4b758af3d`
- UpgradeCap ID: `0x2250bb6b4e9804285aa42d9dd7f2737ecdd93ed4b03edbf515459fb7223d62af`
- Publisher: `0x371321932fb4c4b79b9b0762ac0878ebfb670cc6f6327ecf9d1d06cd9489243e`
- Publish tx: `GvxTETJej5RH4U3rFD2PNCENW65tG8vynRF1xskTrxP7`
- Config: `packages/contracts-config/testnet.json`

## Smoke Objects

- `RentalMandate`: `0x835478969ce38a0a1d0f981aa1a278a8862f9283de735ebba81c6169d388dbee`
- `OwnerCap`: `0xcdb3924e29345c3be077f3c54de78435144ad141d0458a93f6fb6ae0381a571d`
- `AgentCap`: `0xabeb55d1266102eed4235531c542fb01fd85bb3095c3d579960923f2e1e25c2a`
- `RentalListing`: `0xe7f676b93b9df816c7c44806ca2bbda0c6bf29334802206fb025c12e320ad72a`
- `ApplicationReceipt`: `0xc46d42744b7381447851f9f2adb6cf32322ab4bd6aba243e925597418899ad20`

## Smoke Transactions

- Create mandate: `ANNzWCc4StQWGnbdDKmxkwozYhk2V8CDVDUk4UA1sfDA`
- Create listing: `AqH68Fwb3t61KGxshTn5PbJ7JWTDiQcvbF7rS9URNgZR`
- Submit application: `6vKuZNC3p5uoaSni2N5NifW1eQjqdLDesBAj9gN799Lh`

Smoke objects use the same funded testnet address for renter, agent, provider, and landlord to prove published function execution. Later demo setup should create separate funded role addresses.
