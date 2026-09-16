#!/usr/bin/env node
/**
 * Deploy the Self-Governing Protocol and print a deep-link that auto-fills the
 * Governor address in the console.
 *
 * Usage (from repo root, after `npm install` in frontend/):
 *   DEPLOYER_PRIVATE_KEY=0x... node deploy/deploy-frontend.mjs [network]
 *
 * network: studio_next (default) | studionet | localnet | testnet_bradbury | testnet_asimov
 *
 * Studio Next (chain 61997) runs the fee-based GenVM v0.3 stack, so it uses
 * the matching RC SDK + contracts_next/ + fee estimation. Stable networks
 * keep the 1.x SDK + contracts/ (v0.2).
 *
 * Provide DEPLOYER_PRIVATE_KEY through the environment only. Do not paste it
 * into source control, chat, or shell history if the shell records history.
 * The console reads ?gov=...&net=... from the URL, so opening the printed link
 * connects you to the freshly deployed Governor with no copy/paste.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const network = process.argv[2] || "studio_next";
const isNext = network === "studio_next";
// Studio Next runs the GenVM v0.3 stack: deploy the ported contracts_next/
// there; stable networks keep using contracts/ (v0.2).
const contractsDir = path.join(__dirname, "..", isNext ? "contracts_next" : "contracts");
const CONSOLE_URL = process.env.CONSOLE_URL || "http://localhost:5173";

const operatorKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!operatorKey || !/^0x[0-9a-fA-F]{64}$/.test(operatorKey)) {
  console.error("Set DEPLOYER_PRIVATE_KEY to the funded 0x-prefixed operator private key before running this script.");
  process.exit(1);
}

let createClient, createAccount, chain;
if (isNext) {
  ({ createClient, createAccount } = await import("genlayer-js-rc"));
  const { studioDevnet } = await import("genlayer-js-rc/chains");
  chain = studioDevnet;
} else {
  ({ createClient, createAccount } = await import("genlayer-js"));
  const chains = await import("genlayer-js/chains");
  const presets = {
    studionet: chains.studionet,
    localnet: chains.localnet,
    testnet_bradbury: chains.testnetBradbury,
    testnet_asimov: chains.testnetAsimov,
  };
  chain = presets[network];
  if (!chain) {
    console.error(`Unknown network "${network}". Use one of: studio_next, ${Object.keys(presets).join(", ")}`);
    process.exit(1);
  }
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

function leaderOf(receipt) {
  const raw = receipt.consensus_data?.leader_receipt;
  return Array.isArray(raw) ? raw[0] : raw;
}

/** Fee estimation for Studio Next (plain transactions without emits). */
async function nextFees() {
  const est = await client.estimateTransactionFees();
  return {
    distribution: est.distribution,
    messageAllocations: est.messageAllocations,
    feeValue: est.feeValue,
  };
}

async function deploy(name, args) {
  const code = readFileSync(path.join(contractsDir, `${name}.py`), "utf8");
  const params = { code, args, account };
  const wait = isNext
    ? { waitUntil: "finalized", interval: 5000, retries: 200 }
    : { status: "FINALIZED" };
  if (isNext) params.fees = await nextFees();
  const hash = await client.deployContract(params);
  const receipt = await client.waitForTransactionReceipt({ hash, ...wait });
  const leader = leaderOf(receipt);
  if (leader?.execution_result === "ERROR") {
    throw new Error(`${name} deploy failed: ${leader.error ?? JSON.stringify(leader.result)?.slice(0, 300)}`);
  }
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
  let curator = null;
  if (isNext) {
    curator = await deploy("Curator", [70]);
  }

  console.log("\nRegistering the vault with the Governor…");
  const regParams = {
    address: governor,
    functionName: "register_protocol",
    args: [vault, "Vault-1"],
    value: 0n,
    account,
  };
  const regWait = isNext
    ? { waitUntil: "finalized", interval: 5000, retries: 200 }
    : { status: "FINALIZED" };
  if (isNext) regParams.fees = await nextFees();
  const regHash = await client.writeContract(regParams);
  const regReceipt = await client.waitForTransactionReceipt({ hash: regHash, ...regWait });
  const leader = leaderOf(regReceipt);
  if (leader?.execution_result === "ERROR") {
    console.warn(`  Registration returned ${leader.execution_result}: ${leader.error ?? "unknown"}`);
  } else {
    console.log("  Vault registered.\n");
  }

  if (curator) console.log(`  Curator: ${curator}\n`);

  console.log("──────────────────────────────────────────────────────");
  console.log("Open the console with the Governor pre-filled:\n");
  console.log(`  ${CONSOLE_URL}/#/console?gov=${governor}&net=${network}\n`);
  console.log("──────────────────────────────────────────────────────");
}

main().catch((e) => {
  console.error("\nDeploy failed:", e.message);
  console.error("Fund the account first (Studio 💧 faucet, or the testnet faucet for testnets).");
  process.exit(1);
});
