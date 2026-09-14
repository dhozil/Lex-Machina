import { useEffect, useState } from "react";
import { KNOWN_WALLETS, walletAccent, type DiscoveredWallet } from "../lib/client";

interface WalletPickerModalProps {
  open: boolean;
  wallets: DiscoveredWallet[];
  discovering: boolean;
  selectingWalletId: string | null;
  error: string | null;
  onSelect: (wallet: DiscoveredWallet) => void;
  onRefresh: () => void;
  onClose: () => void;
}

function WalletAvatar({ wallet }: { wallet: DiscoveredWallet }) {
  const [iconFailed, setIconFailed] = useState(false);
  const color = walletAccent(wallet.kind, wallet.label);
  const initial = wallet.label.trim().charAt(0).toUpperCase() || "W";

  return (
    <span className="wallet-picker-avatar" style={{ backgroundColor: `${color}22`, color }} aria-hidden="true">
      {wallet.icon?.startsWith("data:image/") && !iconFailed ? (
        <img
          src={wallet.icon}
          alt=""
          loading="lazy"
          onError={() => setIconFailed(true)}
        />
      ) : (
        initial
      )}
    </span>
  );
}

export default function WalletPickerModal({
  open,
  wallets,
  discovering,
  selectingWalletId,
  error,
  onSelect,
  onRefresh,
  onClose,
}: WalletPickerModalProps) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const sorted = [...wallets].sort((a, b) => {
    const rank = (kind: DiscoveredWallet["kind"]) =>
      kind === "metamask" ? 0 : kind === "rabby" ? 1 : 2;
    return rank(a.kind) - rank(b.kind) || a.label.localeCompare(b.label);
  });
  const missingWallets = KNOWN_WALLETS.filter(
    (known) => !sorted.some((wallet) => wallet.kind === known.id),
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal wallet-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a wallet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <div className="mono modal-label">Detected wallets</div>
            <div className="modal-title">Connect wallet</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close wallet choices">
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="wallet-picker-sub">
            Select the installed extension you want to use. Only detected wallets are listed.
          </p>

          {discovering && sorted.length === 0 ? (
            <div className="modal-skeleton" aria-hidden="true">
              <div className="sk sk-line" />
              <div className="sk sk-line" />
              <div className="sk sk-line" />
            </div>
          ) : sorted.length > 0 ? (
            <ul className="wallet-picker-list">
              {sorted.map((wallet) => (
                <li key={wallet.id}>
                  <button
                    type="button"
                    className="wallet-picker-item"
                    disabled={selectingWalletId !== null}
                    onClick={() => onSelect(wallet)}
                  >
                    <WalletAvatar wallet={wallet} />
                    <span className="wallet-picker-text">
                      <span className="wallet-picker-name">{wallet.label}</span>
                      <span className="wallet-picker-status">Detected · Click to connect</span>
                    </span>
                    <span className="wallet-picker-action" aria-hidden="true">
                      {selectingWalletId === wallet.id ? <span className="spinner" /> : "→"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="tx-empty">
              <p>No compatible wallet detected.</p>
              <p className="tx-empty-sub">
                Install and enable an EVM extension, make it the default/site
                wallet if another wallet owns the browser provider, then refresh.
              </p>
            </div>
          )}

          {missingWallets.length > 0 && (
            <div className="wallet-install">
              <p className="mono wallet-install-label">Get a wallet</p>
              <div className="wallet-install-grid">
                {missingWallets.map((wallet) => (
                  <a
                    key={wallet.id}
                    className="wallet-install-item"
                    href={wallet.installUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    <span
                      className="wallet-picker-avatar wallet-install-avatar"
                      style={{ backgroundColor: `${wallet.color}22`, color: wallet.color }}
                      aria-hidden="true"
                    >
                      {wallet.label.charAt(0)}
                    </span>
                    <span className="wallet-picker-text">
                      <span className="wallet-picker-name">{wallet.label}</span>
                      <span className="wallet-picker-status">Install extension</span>
                    </span>
                    <span className="wallet-picker-action" aria-hidden="true">
                      ↗
                    </span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="wallet-picker-foot">
            <button className="btn btn-ghost btn-sm" disabled={discovering} onClick={onRefresh}>
              {discovering ? "Refreshing…" : "Refresh wallets"}
            </button>
          </div>

          {error && (
            <p className="wallet-error" role="status">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
