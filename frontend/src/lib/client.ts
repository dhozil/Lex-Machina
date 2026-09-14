import { createClient } from "genlayer-js";
import { getNetwork, isRetiredGovernor, type NetworkKey } from "./chains";
import { isAddressHex } from "./format";

type ClientConfig = NonNullable<Parameters<typeof createClient>[0]>;

export interface WalletProvider {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: {
    (event: "accountsChanged", listener: (accounts: unknown) => void): void;
    (event: "chainChanged", listener: (chainId: unknown) => void): void;
    (event: "disconnect", listener: (error?: unknown) => void): void;
  };
  removeListener?: {
    (event: "accountsChanged", listener: (accounts: unknown) => void): void;
    (event: "chainChanged", listener: (chainId: unknown) => void): void;
    (event: "disconnect", listener: (error?: unknown) => void): void;
  };
  isMetaMask?: boolean;
  isRabby?: boolean;
  providers?: WalletProvider[];
}

declare global {
  interface Window {
    ethereum?: WalletProvider;
  }
}

const NET_KEY = "ap_network";
const GOV_KEY = "ap_gov";
const GOV_KEY_PREFIX = "ap_gov:";
const WALLET_SELECTION_KEY = "ap_wallet_selection";
const LEGACY_ACCOUNT_KEY = "ap_account_key";
const LEGACY_WALLET_KIND_KEY = "ap_wallet_kind";
const LEGACY_WALLET_ADDRESS_KEY = "ap_wallet_address";

const USER_REJECTION = "Request rejected in the wallet. Approve it to continue.";

interface WalletRpcError {
  code?: number | string;
  message?: string;
}

function errorCode(error: unknown): number | string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as WalletRpcError).code;
    if (typeof code === "number" || typeof code === "string") return code;
  }
  return undefined;
}

function friendlyWalletError(error: unknown, fallback: string): string {
  const code = errorCode(error);
  if (code === 4001) return USER_REJECTION;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function normalizeChainId(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return `0x${value.toString(16)}`;
  }
  if (typeof value !== "string") return null;
  const normalized = value.startsWith("0X") ? `0x${value.slice(2)}` : value;
  return /^0x[0-9a-f]+$/i.test(normalized) ? normalized.toLowerCase() : null;
}

function asAddressArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is `0x${string}` => isAddressHex(typeof item === "string" ? item : undefined));
}

function findWalletErrorCode(error: unknown, depth = 0): number | string | undefined {
  if (depth > 4) return undefined;
  const direct = errorCode(error);
  if (direct !== undefined) return direct;
  if (error && typeof error === "object") {
    const nested = error as { cause?: unknown };
    return findWalletErrorCode(nested.cause, depth + 1);
  }
  return undefined;
}

export function formatActionError(error: unknown, action: string): string {
  if (findWalletErrorCode(error) === 4001) {
    return `${action} was cancelled in your wallet before submission. No transaction was sent.`;
  }
  const friendly = formatTransportError(error);
  if (friendly) return `${action} could not reach the network. ${friendly}`;
  if (error instanceof Error) {
    if (/insufficient funds/i.test(error.message)) {
      return `${action} could not be submitted: the connected wallet has insufficient GEN for gas/fees.`;
    }
    if (error.message) return error.message;
  }
  return `${action} could not be submitted. Check the wallet, network, and retry.`;
}

/** Translate low-level transport failures ("Failed to fetch") into actionable guidance. */
export function formatTransportError(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  if (/rate limit|429|too many requests/i.test(error.message)) {
    return "The network rate limit (30 requests/minute, 500/hour) is exhausted. Wait a minute, then press Refresh once. For heavy testing without limits, run a local simulator instead.";
  }
  if (/failed to fetch|networkerror|load failed|timeout/i.test(error.message)) {
    return "The browser could not reach the RPC endpoint. Check your connection, disable ad-blockers for this site, and press Retry.";
  }
  return null;
}

export type WalletKind = "metamask" | "rabby" | "other";

interface DiscoveredWalletInfo {
  uuid?: string;
  name?: string;
  icon?: string;
  rdns?: string;
}

interface AnnouncedWalletDetail {
  info: DiscoveredWalletInfo;
  provider: WalletProvider;
}

export interface DiscoveredWallet {
  id: string;
  kind: WalletKind;
  label: string;
  rdns?: string;
  icon?: string;
  provider: WalletProvider;
}

export const KNOWN_WALLETS = [
  { id: "metamask", label: "MetaMask", color: "#F5841F", installUrl: "https://metamask.io/download/" },
  { id: "rabby", label: "Rabby", color: "#8697FF", installUrl: "https://rabby.io/" },
] as const;

export function walletAccent(kind: WalletKind, label: string): string {
  if (kind === "metamask") return "#F5841F";
  if (kind === "rabby") return "#8697FF";
  let hash = 0;
  for (const character of label) hash = (hash * 31 + character.charCodeAt(0)) % 360;
  return `hsl(${hash} 45% 55%)`;
}

const announcedWallets: AnnouncedWalletDetail[] = [];
let walletDiscoveryListenerInstalled = false;

function normalizedText(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function asDiscoveredWallet(value: unknown): AnnouncedWalletDetail | null {
  if (!value || typeof value !== "object") return null;
  const detail = value as { info?: unknown; provider?: unknown };
  if (!detail.info || typeof detail.info !== "object") return null;
  if (!detail.provider || typeof detail.provider !== "object") return null;
  const provider = detail.provider as WalletProvider;
  if (typeof provider.request !== "function") return null;
  const info = detail.info as Record<string, unknown>;
  return {
    info: {
      uuid: typeof info.uuid === "string" ? info.uuid : undefined,
      name: typeof info.name === "string" ? info.name : undefined,
      icon: typeof info.icon === "string" ? info.icon : undefined,
      rdns: typeof info.rdns === "string" ? info.rdns : undefined,
    },
    provider,
  };
}

function rememberAnnouncedWallet(detail: AnnouncedWalletDetail) {
  const index = announcedWallets.findIndex(
    (existing) =>
      existing.provider === detail.provider ||
      (existing.info.uuid !== undefined && existing.info.uuid === detail.info.uuid),
  );
  if (index >= 0) announcedWallets[index] = detail;
  else announcedWallets.push(detail);
}

function ensureWalletDiscoveryListener() {
  if (typeof window === "undefined" || walletDiscoveryListenerInstalled) return;
  const onAnnounce = (event: Event) => {
    const detail = asDiscoveredWallet((event as CustomEvent).detail);
    if (detail) rememberAnnouncedWallet(detail);
  };
  window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
  walletDiscoveryListenerInstalled = true;
}

export function requestWalletAnnouncements() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  } catch {
    /* discovery is best-effort; legacy provider flags remain available */
  }
}

export async function discoverInjectedWallets(timeoutMs = 750): Promise<AnnouncedWalletDetail[]> {
  ensureWalletDiscoveryListener();
  requestWalletAnnouncements();
  if (timeoutMs > 0) {
    await new Promise((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    });
  }
  return [...announcedWallets];
}

export interface StoredWalletSelection {
  id?: string;
  kind?: WalletKind;
  label?: string;
  rdns?: string;
  address?: string;
}

function slugifyName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function describeProvider(
  detail: AnnouncedWalletDetail,
  index: number,
): Omit<DiscoveredWallet, "provider"> {
  const rdns = normalizedText(detail.info.rdns);
  const name = typeof detail.info.name === "string" ? detail.info.name.trim() : "";
  const provider = detail.provider;
  const icon = detail.info.icon;

  if (rdns === "io.metamask") {
    return { id: detail.info.uuid ?? "eip6963:io.metamask", kind: "metamask", label: "MetaMask", rdns: "io.metamask", icon };
  }
  if (rdns === "io.rabby") {
    return { id: detail.info.uuid ?? "eip6963:io.rabby", kind: "rabby", label: "Rabby", rdns: "io.rabby", icon };
  }
  if (name.toLowerCase().includes("metamask")) {
    return { id: detail.info.uuid ?? `eip6963:${slugifyName(name) || "metamask"}`, kind: "metamask", label: name, icon };
  }
  if (name.toLowerCase().includes("rabby")) {
    return { id: detail.info.uuid ?? `eip6963:${slugifyName(name) || "rabby"}`, kind: "rabby", label: name, icon };
  }
  const isRabby = provider.isRabby === true;
  const isMetaMask = provider.isMetaMask === true;
  if (isRabby) {
    return { id: detail.info.uuid ?? "legacy:rabby", kind: "rabby", label: name || "Rabby", rdns: "io.rabby", icon };
  }
  if (isMetaMask && !isRabby) {
    return { id: detail.info.uuid ?? "legacy:metamask", kind: "metamask", label: name || "MetaMask", rdns: "io.metamask", icon };
  }
  return {
    id: detail.info.uuid ?? `wallet:${slugifyName(name || `browser-${index + 1}`)}`,
    kind: "other",
    label: name || `Browser wallet ${index + 1}`,
    icon,
  };
}

function legacyInjectedProviders(): WalletProvider[] {
  if (typeof window === "undefined") return [];
  const ethereum = window.ethereum;
  if (!ethereum) return [];
  if (Array.isArray(ethereum.providers) && ethereum.providers.length > 0) {
    return ethereum.providers as WalletProvider[];
  }
  return [ethereum];
}

function legacyFallbackOptions(): DiscoveredWallet[] {
  return legacyInjectedProviders().map((provider, index) => {
    const identity = describeProvider({ info: {}, provider }, index);
    return { ...identity, provider };
  });
}

export function walletLabel(kind: WalletKind): string {
  if (kind === "rabby") return "Rabby";
  if (kind === "metamask") return "MetaMask";
  return "Browser wallet";
}

export function clearDiscoveredWallets() {
  announcedWallets.length = 0;
}

export async function discoverWalletOptions(timeoutMs = 750): Promise<DiscoveredWallet[]> {
  const announced = await discoverInjectedWallets(timeoutMs);
  if (announced.length > 0) {
    return announced.map((detail, index) => {
      const identity = describeProvider(detail, index);
      return { ...identity, provider: detail.provider };
    });
  }
  return legacyFallbackOptions().map((option, index) => ({
    ...option,
    id: option.id === "wallet:browser-1" ? `legacy:browser-${index + 1}` : option.id,
  }));
}

export async function refreshWalletOptions(timeoutMs = 750): Promise<DiscoveredWallet[]> {
  clearDiscoveredWallets();
  return discoverWalletOptions(timeoutMs);
}

export function matchStoredWallet(
  options: DiscoveredWallet[],
  selection: StoredWalletSelection | null,
): DiscoveredWallet | null {
  if (!selection) return null;
  if (selection.id) {
    const exact = options.find((option) => option.id === selection.id);
    if (exact) return exact;
  }
  if (selection.rdns) {
    const byRdns = options.find((option) => option.rdns === selection.rdns);
    if (byRdns) return byRdns;
  }
  if (selection.kind && selection.kind !== "other") {
    const matches = options.filter((option) => option.kind === selection.kind);
    if (matches.length === 1) return matches[0];
  }
  if (selection.label) {
    const byLabel = options.find((option) => option.label === selection.label);
    if (byLabel) return byLabel;
  }
  return null;
}

export function hasAnyInjectedWallet(): boolean {
  if (typeof window === "undefined") return false;
  return announcedWallets.length > 0 || legacyInjectedProviders().length > 0;
}

export function missingProviderMessage(label = "The selected wallet"): string {
  if (hasAnyInjectedWallet()) {
    return (
      `${label} did not announce itself. If another wallet is controlling the browser provider, ` +
      `make the intended wallet the default/site wallet, reload, then connect again.`
    );
  }
  return `${label} was not detected in this browser. Install and enable an EVM wallet extension, then connect again.`;
}

export function expectedChainHex(network: NetworkKey): string {
  return `0x${getNetwork(network).chain.id.toString(16)}`;
}

export async function requestWalletChainId(provider: WalletProvider): Promise<string> {
  const chainId = normalizeChainId(await provider.request({ method: "eth_chainId" }));
  if (!chainId) throw new Error("The wallet did not return a usable chain ID.");
  return chainId;
}

export async function requestWalletAccounts(provider: WalletProvider): Promise<string[]> {
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const list = asAddressArray(accounts);
  if (list.length === 0) throw new Error("No wallet account was approved. Select an account and try again.");
  return list;
}

export async function connectedWalletAccounts(provider: WalletProvider): Promise<string[]> {
  const accounts = await provider.request({ method: "eth_accounts" });
  return asAddressArray(accounts);
}

export async function ensureWalletNetwork(provider: WalletProvider, network: NetworkKey): Promise<string> {
  const expected = expectedChainHex(network).toLowerCase();
  const current = await requestWalletChainId(provider);
  if (current === expected) return current;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: expected }],
    });
  } catch (error) {
    if (errorCode(error) === 4902) {
      const preset = getNetwork(network);
      const rpcUrls = [...preset.chain.rpcUrls.default.http].filter((url) => url.startsWith("http"));
      if (rpcUrls.length === 0) {
        throw new Error(`The configured ${preset.label} RPC endpoint is missing.`);
      }
      const params: Record<string, unknown> = {
        chainId: expected,
        chainName: preset.chain.name,
        rpcUrls,
        nativeCurrency: { ...preset.chain.nativeCurrency },
      };
      if (preset.explorer) params.blockExplorerUrls = [preset.explorer];
      await provider.request({ method: "wallet_addEthereumChain", params: [params] });
    } else {
      throw new Error(friendlyWalletError(error, `Approve the network switch to ${getNetwork(network).label}.`));
    }
  }

  const verified = await requestWalletChainId(provider);
  if (verified !== expected) {
    throw new Error(`Switch the wallet to ${getNetwork(network).label} (${expected}).`);
  }
  return verified;
}

export async function ensureConnectedAccount(
  provider: WalletProvider,
  desiredAccount?: string | null,
): Promise<string> {
  const connected = await connectedWalletAccounts(provider);
  if (desiredAccount && connected[0]?.toLowerCase() === desiredAccount.toLowerCase()) {
    return connected[0];
  }
  const requested = await requestWalletAccounts(provider);
  if (desiredAccount && requested[0].toLowerCase() !== desiredAccount.toLowerCase()) {
    return requested[0];
  }
  return requested[0];
}

export interface WalletEventHandlers {
  onAccountsChanged?: (accounts: string[]) => void;
  onChainChanged?: (chainId: string) => void;
  onDisconnect?: () => void;
}

export function subscribeWallet(provider: WalletProvider, handlers: WalletEventHandlers): () => void {
  const cleanups: Array<() => void> = [];

  const onAccountsChanged = (accounts: unknown) => {
    handlers.onAccountsChanged?.(asAddressArray(accounts));
  };
  const onChainChanged = (chainId: unknown) => {
    const normalized = normalizeChainId(chainId);
    if (normalized) handlers.onChainChanged?.(normalized);
  };
  const onDisconnect = () => handlers.onDisconnect?.();

  try {
    provider.on?.("accountsChanged", onAccountsChanged);
    cleanups.push(() => {
      try {
        provider.removeListener?.("accountsChanged", onAccountsChanged);
      } catch {
        /* ignore listener cleanup errors */
      }
    });
    provider.on?.("chainChanged", onChainChanged);
    cleanups.push(() => {
      try {
        provider.removeListener?.("chainChanged", onChainChanged);
      } catch {
        /* ignore listener cleanup errors */
      }
    });
    provider.on?.("disconnect", onDisconnect);
    cleanups.push(() => {
      try {
        provider.removeListener?.("disconnect", onDisconnect);
      } catch {
        /* ignore listener cleanup errors */
      }
    });
  } catch {
    /* wallets without an event API still work for explicit actions */
  }

  return () => cleanups.forEach((cleanup) => cleanup());
}

export function getStoredNetwork(): NetworkKey {
  const v = localStorage.getItem(NET_KEY) as NetworkKey | null;
  return v ?? "studionet";
}

export function setStoredNetwork(k: NetworkKey) {
  localStorage.setItem(NET_KEY, k);
}

function readWalletSelection(value: unknown): StoredWalletSelection | null {
  if (!value || typeof value !== "object") return null;
  const selection = value as Record<string, unknown>;
  const id = typeof selection.id === "string" ? selection.id : undefined;
  const kind =
    selection.kind === "metamask" || selection.kind === "rabby" || selection.kind === "other"
      ? selection.kind
      : undefined;
  const label = typeof selection.label === "string" ? selection.label : undefined;
  const rdns = typeof selection.rdns === "string" ? selection.rdns : undefined;
  const rawAddress = typeof selection.address === "string" ? selection.address : undefined;
  const address = isAddressHex(rawAddress) ? rawAddress : undefined;
  if (!id && !rdns && !kind && !label && !address) return null;
  return { id, kind, label, rdns, address };
}

export function getStoredWalletSelection(): StoredWalletSelection | null {
  try {
    const stored = readWalletSelection(JSON.parse(localStorage.getItem(WALLET_SELECTION_KEY) ?? "null"));
    if (stored) return stored;
  } catch {
    /* fall through to the previous selection format */
  }
  const kind = localStorage.getItem(LEGACY_WALLET_KIND_KEY);
  const address = localStorage.getItem(LEGACY_WALLET_ADDRESS_KEY);
  if ((kind === "metamask" || kind === "rabby") && isAddressHex(address)) {
    return { id: `legacy:${kind}`, kind, label: kind === "rabby" ? "Rabby" : "MetaMask", address };
  }
  return null;
}

export function setStoredWalletSelection(selection: StoredWalletSelection) {
  localStorage.setItem(WALLET_SELECTION_KEY, JSON.stringify(selection));
  localStorage.removeItem(LEGACY_WALLET_KIND_KEY);
  localStorage.removeItem(LEGACY_WALLET_ADDRESS_KEY);
}

export function clearStoredWallet() {
  localStorage.removeItem(WALLET_SELECTION_KEY);
  localStorage.removeItem(LEGACY_WALLET_KIND_KEY);
  localStorage.removeItem(LEGACY_WALLET_ADDRESS_KEY);
}

export function clearLegacyLocalWallet() {
  localStorage.removeItem(LEGACY_ACCOUNT_KEY);
}

export function getStoredGov(network?: NetworkKey): string | null {
  const pick = (value: string | null) => {
    if (!value) return null;
    // Migrate away from superseded deployments: fall through to the default.
    if (isRetiredGovernor(value)) return null;
    return value;
  };
  if (network) {
    const namespaced = pick(localStorage.getItem(`${GOV_KEY_PREFIX}${network}`));
    if (namespaced) return namespaced;
  }
  return pick(localStorage.getItem(GOV_KEY));
}

export function setStoredGov(gov: string, network?: NetworkKey) {
  if (network) {
    localStorage.setItem(`${GOV_KEY_PREFIX}${network}`, gov);
    return;
  }
  localStorage.setItem(GOV_KEY, gov);
}

export function makeClient(
  net: NetworkKey,
  opts?: { account?: string; provider?: WalletProvider },
) {
  const network = getNetwork(net);
  // Route RPC through the same-origin /rpc/* proxy (see vite.config.ts):
  // the GenLayer endpoints send no CORS headers for browser origins.
  // Clone the chain: genlayer-js overwrites chain.rpcUrls with `endpoint`,
  // and the shared preset must keep its absolute URLs for the wallet.
  const endpoint = `/rpc/${net}`;
  const chain = {
    ...network.chain,
    rpcUrls: { default: { http: [endpoint] } },
  };
  const config: ClientConfig = { chain, endpoint };
  if (opts?.account) {
    config.account = opts.account as ClientConfig["account"];
  }
  if (opts?.provider) {
    config.provider = opts.provider as NonNullable<ClientConfig["provider"]>;
  }
  return createClient(config);
}
