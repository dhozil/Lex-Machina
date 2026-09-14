import { shortAddress } from "../lib/format";
import WalletPickerModal from "./WalletPickerModal";
import type { DiscoveredWallet } from "../lib/client";

interface WalletControlsProps {
  account: string | null;
  selectedLabel: string | null;
  switching: boolean;
  walletChainId: string | null;
  expectedChainId: string;
  expectedNetworkLabel: string;
  expectedRpcUrl: string;
  chainIdShared: boolean;
  networkOk: boolean;
  walletError: string | null;
  pickerOpen: boolean;
  walletOptions: DiscoveredWallet[];
  discoveringWallets: boolean;
  selectingWalletId: string | null;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onRefreshPicker: () => void;
  onSelectWallet: (wallet: DiscoveredWallet) => void;
  onDisconnect: () => void;
  onSwitchNetwork: () => void;
}

export default function WalletControls({
  account,
  selectedLabel,
  switching,
  walletChainId,
  expectedChainId,
  expectedNetworkLabel,
  expectedRpcUrl,
  chainIdShared,
  networkOk,
  walletError,
  pickerOpen,
  walletOptions,
  discoveringWallets,
  selectingWalletId,
  onOpenPicker,
  onClosePicker,
  onRefreshPicker,
  onSelectWallet,
  onDisconnect,
  onSwitchNetwork,
}: WalletControlsProps) {
  if (!account) {
    return (
      <div className="wallet-controls">
        <div className="wallet-buttons">
          <button className="btn btn-primary btn-sm" onClick={onOpenPicker}>
            Connect wallet
          </button>
        </div>
        <p className="wallet-hint">
          Uses a detected MetaMask, Rabby, or EVM extension. This app never asks for or stores a private key.
        </p>
        {walletError && (
          <p className="wallet-error" role="status">
            {walletError}
          </p>
        )}
        <WalletPickerModal
          open={pickerOpen}
          wallets={walletOptions}
          discovering={discoveringWallets}
          selectingWalletId={selectingWalletId}
          error={walletError}
          onSelect={onSelectWallet}
          onRefresh={onRefreshPicker}
          onClose={onClosePicker}
        />
      </div>
    );
  }

  return (
    <div className="wallet-controls">
      <div className="acct">
        <span className="pill pill-teal">
          <span className="dot" />
          {selectedLabel ?? "Connected wallet"} · {shortAddress(account)}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
      {!networkOk ? (
        <p className="wallet-error" role="status">
          Wallet is on {walletChainId ?? "an unknown chain"}. Switch it to {expectedNetworkLabel} ({expectedChainId})
          before submitting transactions.{" "}
          <button className="btn btn-ghost btn-sm" disabled={switching} onClick={() => void onSwitchNetwork()}>
            {switching ? "Switching…" : "Switch network"}
          </button>
        </p>
      ) : (
        walletError && (
          <p className="wallet-error" role="status">
            {walletError}
          </p>
        )
      )}
      {networkOk && chainIdShared && (
        <p className="wallet-hint">
          {expectedNetworkLabel} shares chain ID {expectedChainId} with another network. Confirm your
          wallet’s RPC is <span className="mono">{expectedRpcUrl}</span> before submitting.
        </p>
      )}
      <WalletPickerModal
        open={pickerOpen}
        wallets={walletOptions}
        discovering={discoveringWallets}
        selectingWalletId={selectingWalletId}
        error={walletError}
        onSelect={onSelectWallet}
        onRefresh={onRefreshPicker}
        onClose={onClosePicker}
      />
    </div>
  );
}
