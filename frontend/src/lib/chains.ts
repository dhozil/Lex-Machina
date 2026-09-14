import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";

export type NetworkKey = "localnet" | "studionet" | "testnet_bradbury" | "testnet_asimov";

export interface NetworkPreset {
  key: NetworkKey;
  label: string;
  chain: typeof localnet;
  explorer: string | null;
  defaultGovernor?: string | null;
  curator?: string | null;
}

export const NETWORKS: NetworkPreset[] = [
  { key: "localnet", label: "Localnet", chain: localnet, explorer: "http://localhost:8080" },
  {
    key: "studionet",
    label: "Studionet",
    chain: studionet,
    explorer: "https://explorer-studio.genlayer.com",
    defaultGovernor: "0x3d0d407Ce907032fa3A48E37cd528b6DD2066ca0",
    curator: "0x4bc6BCaeDA073602ec3fEd2DD78162077dB333f9",
  },
  {
    key: "testnet_bradbury",
    label: "Bradbury testnet",
    chain: testnetBradbury,
    explorer: "https://explorer-bradbury.genlayer.com",
  },
  {
    key: "testnet_asimov",
    label: "Asimov testnet",
    chain: testnetAsimov,
    explorer: "https://explorer-asimov.genlayer.com",
  },
];

export function getNetwork(key: NetworkKey): NetworkPreset {
  return NETWORKS.find((n) => n.key === key) ?? NETWORKS[0];
}

/** Superseded deployments: never used as an automatic default again.
 * They stay reachable via an explicit ?gov= address or manual override. */
export const RETIRED_GOVERNORS: string[] = [
  "0x3f0fa6d222ca4d2396a60a2320eafcb5bc72a16a",
  "0x98b6c644f8649917566e778d908baea304529014",
  "0xe869dd5035da1229e4e4a8139677584dc015cb08",
  "0xe1d5ebddb51fdf173583cab80a54d58fa3bb6e0b",
];

export function isRetiredGovernor(address: string): boolean {
  return RETIRED_GOVERNORS.includes(address.trim().toLowerCase());
}

/** Build an explorer URL for a transaction hash on a given network. */
export function explorerTxUrl(key: NetworkKey, txHash: string): string | null {
  const net = getNetwork(key);
  if (!net.explorer) return null;
  return `${net.explorer}/tx/${txHash}`;
}
