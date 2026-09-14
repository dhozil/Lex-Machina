import { useCallback, useEffect, useMemo, useState } from "react";
import { NETWORKS, getNetwork, type NetworkKey } from "../lib/chains";
import {
  clearLegacyLocalWallet,
  clearStoredWallet,
  connectedWalletAccounts,
  discoverWalletOptions,
  ensureConnectedAccount,
  ensureWalletNetwork,
  expectedChainHex,
  getStoredWalletSelection,
  makeClient,
  matchStoredWallet,
  refreshWalletOptions,
  requestWalletAccounts,
  requestWalletChainId,
  setStoredWalletSelection,
  subscribeWallet,
  type DiscoveredWallet,
  type StoredWalletSelection,
  type WalletProvider,
} from "../lib/client";
import type { Client as GovernorClient } from "../lib/governor";

export function useWallet(network: NetworkKey) {
  const [selection, setSelection] = useState<StoredWalletSelection | null>(() => getStoredWalletSelection());
  const [account, setAccount] = useState<string | null>(() => getStoredWalletSelection()?.address ?? null);
  const [provider, setProvider] = useState<WalletProvider | null>(null);
  const [walletChainId, setWalletChainId] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [walletOptions, setWalletOptions] = useState<DiscoveredWallet[]>([]);
  const [discoveringWallets, setDiscoveringWallets] = useState(false);

  const readClient = useMemo(() => makeClient(network), [network]);
  const expectedChainId = useMemo(() => expectedChainHex(network).toLowerCase(), [network]);
  const expectedRpcUrl = useMemo(
    () => getNetwork(network).chain.rpcUrls.default.http[0] ?? "",
    [network],
  );
  const chainIdShared = useMemo(
    () =>
      NETWORKS.some(
        (entry) => entry.key !== network && getNetwork(entry.key).chain.id === getNetwork(network).chain.id,
      ),
    [network],
  );
  const networkOk = !(provider && account && walletChainId) || walletChainId === expectedChainId;

  useEffect(() => {
    clearLegacyLocalWallet();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = getStoredWalletSelection();
      if (!stored) return;
      const options = await discoverWalletOptions(650);
      if (cancelled) return;
      const matched = matchStoredWallet(options, stored);
      if (!matched) {
        setProvider(null);
        setAccount(null);
        setWalletChainId(null);
        setWalletError(
          `${stored.label ?? "The saved wallet"} did not announce itself. Open the wallet picker and reconnect.`,
        );
        return;
      }
      setProvider(matched.provider);
      try {
        const [authorized, chainId] = await Promise.all([
          connectedWalletAccounts(matched.provider),
          requestWalletChainId(matched.provider),
        ]);
        if (cancelled) return;
        if (authorized[0]) {
          setAccount(authorized[0]);
          const next = { ...stored, ...optionIdentity(matched), address: authorized[0] };
          setSelection(next);
          setStoredWalletSelection(next);
        } else {
          setAccount(null);
          setWalletError(`Select an account in ${matched.label} to unlock this console.`);
        }
        setWalletChainId(chainId);
      } catch (error) {
        if (!cancelled) setWalletError((error as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!provider) return undefined;
    return subscribeWallet(provider, {
      onAccountsChanged: (accounts) => {
        if (accounts.length === 0) {
          setProvider(null);
          setAccount(null);
          setWalletChainId(null);
          setSelection(null);
          clearStoredWallet();
          setWalletError("The wallet disconnected its accounts. Connect again to continue.");
          return;
        }
        setAccount(accounts[0]);
        setSelection((previous) => {
          const next = { ...previous, address: accounts[0] };
          setStoredWalletSelection(next);
          return next;
        });
      },
      onChainChanged: (chainId) => {
        setWalletChainId(chainId);
      },
      onDisconnect: () => {
        setProvider(null);
        setAccount(null);
        setWalletChainId(null);
        setSelection(null);
        clearStoredWallet();
        setWalletError("The wallet disconnected. Connect again to continue.");
      },
    });
  }, [provider]);

  const openWalletPicker = useCallback(async () => {
    setPickerOpen(true);
    setDiscoveringWallets(true);
    setWalletError(null);
    try {
      setWalletOptions(await refreshWalletOptions());
    } catch (error) {
      setWalletError((error as Error).message);
    } finally {
      setDiscoveringWallets(false);
    }
  }, []);

  const closeWalletPicker = useCallback(() => {
    setPickerOpen(false);
    if (!connectingWalletId) return;
    setConnectingWalletId(null);
  }, [connectingWalletId]);

  const connectWalletOption = useCallback(
    async (option: DiscoveredWallet) => {
      setConnectingWalletId(option.id);
      setWalletError(null);
      try {
        const approved = await requestWalletAccounts(option.provider);
        await ensureWalletNetwork(option.provider, network);
        const chainId = await requestWalletChainId(option.provider);
        const next: StoredWalletSelection = {
          id: option.id,
          kind: option.kind,
          label: option.label,
          rdns: option.rdns,
          address: approved[0],
        };
        setProvider(option.provider);
        setSelection(next);
        setStoredWalletSelection(next);
        setAccount(approved[0]);
        setWalletChainId(chainId);
        setPickerOpen(false);
      } catch (error) {
        setWalletError((error as Error).message);
      } finally {
        setConnectingWalletId(null);
      }
    },
    [network],
  );

  const disconnectWallet = useCallback(() => {
    setProvider(null);
    setAccount(null);
    setSelection(null);
    setWalletChainId(null);
    setWalletError(null);
    setPickerOpen(false);
    clearStoredWallet();
  }, []);

  const switchWalletNetwork = useCallback(async (): Promise<void> => {
    if (!provider || !account) {
      setWalletError("Connect a wallet before submitting an onchain transaction.");
      return;
    }
    setSwitching(true);
    setWalletError(null);
    try {
      const chainId = await ensureWalletNetwork(provider, network);
      setWalletChainId(chainId);
      const current = await ensureConnectedAccount(provider, account);
      if (current !== account) {
        setAccount(current);
        setSelection((previous) => {
          const next = { ...previous, address: current };
          setStoredWalletSelection(next);
          return next;
        });
      }
    } catch (error) {
      setWalletError((error as Error).message);
    } finally {
      setSwitching(false);
    }
  }, [provider, account, network]);

  const ensureWriteClient = useCallback(async (): Promise<GovernorClient> => {
    if (!provider || !account) {
      throw new Error("Connect a wallet before submitting an onchain transaction.");
    }
    setWalletError(null);
    try {
      await ensureWalletNetwork(provider, network);
      const current = await ensureConnectedAccount(provider, account);
      if (current !== account) {
        setAccount(current);
        setSelection((previous) => {
          const next = { ...previous, address: current };
          setStoredWalletSelection(next);
          return next;
        });
      }
      setWalletChainId(await requestWalletChainId(provider));
      return makeClient(network, { account: current, provider });
    } catch (error) {
      setWalletError((error as Error).message);
      throw error;
    }
  }, [provider, account, network]);

  return {
    account,
    provider,
    selectedLabel: selection?.label ?? null,
    connectingWalletId,
    selectingWalletId: connectingWalletId,
    switching,
    walletChainId,
    expectedChainId,
    expectedNetworkLabel: getNetwork(network).label,
    expectedRpcUrl,
    chainIdShared,
    networkOk,
    walletError,
    pickerOpen,
    walletOptions,
    discoveringWallets,
    openWalletPicker,
    closeWalletPicker,
    refreshWalletOptions: async () => {
      setDiscoveringWallets(true);
      try {
        setWalletOptions(await refreshWalletOptions());
      } catch (error) {
        setWalletError((error as Error).message);
      } finally {
        setDiscoveringWallets(false);
      }
    },
    connectWalletOption,
    disconnectWallet,
    switchWalletNetwork,
    ensureWriteClient,
    readClient,
  };
}

function optionIdentity(option: DiscoveredWallet): StoredWalletSelection {
  return { id: option.id, kind: option.kind, label: option.label, rdns: option.rdns };
}
