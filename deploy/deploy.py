"""Deploy the Self-Governing Protocol to a GenLayer network.

Usage (from project root):
    python deploy/deploy.py --network studionet

Requires the `genlayer` CLI (npm install -g genlayer) and a configured account.
StudioNet is gasless, so no funding is needed.
"""

import argparse
import re
import subprocess
import sys

CONTRACTS = "contracts"


def run(*cmd):
    print("$", " ".join(cmd))
    subprocess.run(cmd, check=True)


def deploy(name, *args):
    cmd = ["genlayer", "network", "set", args_network]
    run(*cmd)
    cmd = ["genlayer", "deploy", "--contract", f"{CONTRACTS}/{name}.py"]
    if args:
        cmd += ["--args", *args]
    out = subprocess.run(cmd, capture_output=True, text=True, check=True)
    match = re.search(r"'Contract Address':\s*'(0x[0-9a-fA-F]{40})'", out.stdout)
    if not match:
        print(out.stdout)
        sys.exit(f"Could not parse the {name} contract address from `genlayer deploy` output.")
    return match.group(1)


def main():
    global args_network
    parser = argparse.ArgumentParser()
    parser.add_argument("--network", default="studionet")
    args = parser.parse_args()
    args_network = args.network

    print("Deploying Governor...")
    governor = deploy("Governor", "Rule 1: no unauthorized withdrawals.", "50")
    print(f"  Governor: {governor}")

    print("Deploying ProtocolVault...")
    vault = deploy("ProtocolVault", governor, "1000")
    print(f"  ProtocolVault: {vault}")

    print("Registering ProtocolVault with Governor...")
    run(
        "genlayer",
        "write",
        governor,
        "register_protocol",
        "--args",
        vault,
        "Vault-1",
    )

    print("Deployed. Use `genlayer call <addr> <method>` to inspect.")


if __name__ == "__main__":
    main()
