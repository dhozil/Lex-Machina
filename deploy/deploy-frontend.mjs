#!/usr/bin/env node
/**
 * Deploy the Self-Governing Protocol and print a deep-link that auto-fills the
 * Governor address in the console.
 *
 * Usage (from repo root):
 *   DEPLOYER_PRIVATE_KEY=0x... node deploy/deploy-frontend.mjs [network]
 *
 * network: studionet (default) | localnet | testnet_bradbury | testnet_asimov
 *
 * Provide DEPLOYER_PRIVATE_KEY through the environment only. Do not paste it
 * into source control, chat, or shell history if the shell records history.
 * The console reads ?gov=...&net=... from the URL, so opening the printed link
 * connects you to the freshly deployed Governor with no copy/paste.
 */

import { createClient, createAccount } from "genlayer-js";
import {
  studionet,
  localnet,
  testnetBradbury,
  testnetAsimov,
} from "genlayer-js/chains";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsDir = path.join(__dirname, "..", "contracts");
const CONSOLE_URL = process.env.CONSOLE_URL || "http://localhost:5173";

const chains = {
  studionet,
  localnet,
  testnet_bradbury: testnetBradbury,
  testnet_asimov: testnetAsimov,
};

const network = process.argv[2] || "studionet";
const chain = chains[network];
if (!chain) {
  console.error(`Unknown network "${network}". Use one of: ${Object.keys(chains).join(", ")}`);
  process.exit(1);
}

const operatorKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!operatorKey || !/^0x[0-9a-fA-F]{64}$/.test(operatorKey)) {
  console.error("Set DEPLOYER_PRIVATE_KEY to the funded 0x-prefixed operator private key before running this script.");
  process.exit(1);
}
const account = createAccount(operatorKey);
const client = createClient({ chain, account });

function extractAddress(receipt) {
  return (
    receipt.txDataDecoded?.contractAddress ??
    receipt.data?.contract_address ??
    receipt.to_address ??
    receipt.recipient
  );
}

async function deploy(name, args) {
  const code = readFileSync(path.join(contractsDir, `${name}.py`), "utf8");
  const hash = await client.deployContract({ code, args, account });
  const receipt = await client.waitForTransactionReceipt({ hash, status: "FINALIZED" });
  const addr = extractAddress(receipt);
  if (!addr) {
    throw new Error(`Could not determine ${name} address from receipt.`);
  }
  console.log(`  ${name.padEnd(14)} ${addr}   (tx ${hash})`);
  return addr;
}

async function main() {
  console.log(`Deploying to ${chain.name} (id ${chain.id})…`);
  console.log(`  Account: ${account.address}\n`);

  const governor = await deploy("Governor", ["Rule 1: no unauthorized withdrawals.", 50]);
  const vault = await deploy("ProtocolVault", [governor, 1000]);

  console.log("\nRegistering the vault with the Governor…");
  const regHash = await client.writeContract({
    address: governor,
    functionName: "register_protocol",
    args: [vault, "Vault-1"],
    value: 0n,
    account,
  });
  const regReceipt = await client.waitForTransactionReceipt({ hash: regHash, status: "FINALIZED" });
  const leader = Array.isArray(regReceipt.consensus_data?.leader_receipt)
    ? regReceipt.consensus_data.leader_receipt[0]
    : regReceipt.consensus_data?.leader_receipt;
  if (leader?.execution_result === "ERROR") {
    console.warn(`  Registration returned ${leader.execution_result}: ${leader.error ?? "unknown"}`);
  } else {
    console.log("  Vault registered.\n");
  }

  console.log("──────────────────────────────────────────────────────");
  console.log("Open the console with the Governor pre-filled:\n");
  console.log(`  ${CONSOLE_URL}/#/console?gov=${governor}&net=${network}\n`);
  console.log("──────────────────────────────────────────────────────");
}

main().catch((e) => {
  console.error("\nDeploy failed:", e.message);
  console.error("On Studionet you may need to fund the account first (use the 💧 faucet in Studio).");
  process.exit(1);
});
