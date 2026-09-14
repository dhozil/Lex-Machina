import type { TxRecord } from "../lib/governor";
import { shortHash, timeAgo } from "../lib/format";
import { explorerTxUrl, type NetworkKey } from "../lib/chains";

const STATUS_META = {
  pending: { label: "Pending", tone: "amber" as const, icon: "◌" },
  accepted: { label: "Accepted", tone: "violet" as const, icon: "◍" },
  finalized: { label: "Finalized", tone: "teal" as const, icon: "✓" },
  error: { label: "Failed", tone: "ember" as const, icon: "!" },
};

export default function TxLog({
  txs,
  network,
  onSelect,
}: {
  txs: TxRecord[];
  network: NetworkKey;
  onSelect?: (tx: TxRecord) => void;
}) {
  if (txs.length === 0) {
    return (
      <div className="tx-empty">
        <p>No transactions yet.</p>
        <p className="tx-empty-sub">
          Actions you submit from the console will appear here with their on-chain status.
        </p>
      </div>
    );
  }

  return (
    <ul className="tx-list">
      {txs.map((tx) => {
        const meta = STATUS_META[tx.status];
        const url = explorerTxUrl(network, tx.hash);
        return (
          <li key={tx.id} className="tx-item">
            <button
              type="button"
              className="tx-rowbtn"
              onClick={() => onSelect?.(tx)}
              aria-label={`View details for ${tx.label}`}
            >
              <span className={`tx-icon tx-${tx.status}`} aria-hidden="true">
                {meta.icon}
              </span>
              <div className="tx-body">
                <div className="tx-line">
                  <span className="tx-label">{tx.label}</span>
                  <span className={`pill pill-${meta.tone}`}>{meta.label}</span>
                </div>
                <div className="tx-sub mono">
                  <span>{shortHash(tx.hash)}</span>
                  <span>{timeAgo(tx.createdAt)}</span>
                </div>
                {tx.status === "error" && tx.error && (
                  <div className="tx-error-msg">{tx.error}</div>
                )}
                {url && tx.hash.startsWith("0x") && (
                  <span className="tx-link mono">View details</span>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
