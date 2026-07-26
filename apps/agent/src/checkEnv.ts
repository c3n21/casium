import { SuiGrpcClient } from "@mysten/sui/grpc";
import { keypairFromPrivateKey } from "./suiSubmit.js";

const TESTNET_RPC_URL = "https://fullnode.testnet.sui.io:443";
const MIST_PER_SUI = 1_000_000_000n;

async function main() {
  const rpcUrl = process.env.SUI_RPC_URL ?? TESTNET_RPC_URL;
  const configuredAddress = process.env.AGENT_SUI_ADDRESS;
  const privateKey = process.env.AGENT_SUI_PRIVATE_KEY ?? process.env.AGENT_SUI_PRIVATE_KEY_BASE64;

  if (!configuredAddress && !privateKey) {
    throw new Error("Set AGENT_SUI_ADDRESS or AGENT_SUI_PRIVATE_KEY before running this check.");
  }

  const derivedAddress = privateKey ? keypairFromPrivateKey(privateKey).toSuiAddress() : null;
  const addressToCheck = derivedAddress ?? configuredAddress;

  if (!addressToCheck) {
    throw new Error("Could not determine agent Sui address.");
  }

  console.log("=== Casium Agent Env Check ===");
  console.log(`RPC URL:              ${rpcUrl}`);
  console.log(`AGENT_SUI_ADDRESS:    ${configuredAddress ?? "(not set)"}`);
  console.log(`Derived key address:  ${derivedAddress ?? "(private key not set)"}`);

  if (configuredAddress && derivedAddress && normalize(configuredAddress) !== normalize(derivedAddress)) {
    throw new Error(`AGENT_SUI_ADDRESS mismatch: configured ${configuredAddress}, derived ${derivedAddress}`);
  }

  const client = new SuiGrpcClient({ network: "testnet", baseUrl: rpcUrl });
  const balance = await client.core.getBalance({ owner: addressToCheck });
  const addressBalanceMist = BigInt(balance.balance.addressBalance);
  const coinBalanceMist = BigInt(balance.balance.balance);
  const mist = addressBalanceMist > 0n ? addressBalanceMist : coinBalanceMist;

  console.log(`SUI balance:          ${formatSui(mist)} SUI (${mist} MIST)`);

  if (mist === 0n) {
    console.log("");
    console.log("No SUI gas found for the agent signer.");
    console.log(`Fund this testnet address: ${addressToCheck}`);
    console.log("Use https://faucet.sui.io or the Sui Discord testnet faucet.");
    process.exitCode = 1;
    return;
  }

  console.log("Agent signer has SUI gas.");
}

function normalize(address: string) {
  return address.toLowerCase();
}

function formatSui(mist: bigint) {
  const whole = mist / MIST_PER_SUI;
  const fractional = (mist % MIST_PER_SUI).toString().padStart(9, "0").replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole.toString();
}

main().catch((error) => {
  console.error("Agent env check failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
