import type { TxDetail } from "../lib/governor";
import { shortHash, shortAddress, formatNumber } from "../lib/format";
import { explorerTxUrl, type NetworkKey } from "../lib/chains";

const STATUS_META = {
  pending: { label: "Pending", tone: "amber" as const },
  accepted: { label: "Accepted", tone: "violet" as const },
  finalized: { label: "Finalized", tone: "teal" as const },
  error: { label: "Failed", tone: "ember" as const },
};

const LIFECYCLE = ["Pending", "Accepted", "Finalized"];

function statusIndex(status: TxDetail["status"]) {
  if (status === "pending") return 0;
  if (status === "accepted") return 1;
  if (status === "finalized") return 2;
  return -1; // error
}

export default function TxDetailModal({
  detail,
  label,
  network,
  loading = false,
  onClose,
}: {
  detail: TxDetail;
  label: string;
  network: NetworkKey;
  loading?: boolean;
  onClose: () => void;
}) {
  const meta = STATUS_META[detail.status];
  const url = explorerTxUrl(network, detail.hash);
  const votes = detail.votes ?? {};
  const voteValues = Object.values(votes);
  const agree = voteValues.filter((v) => v === "agree").length;
  const disagree = voteValues.filter((v) => v !== "agree").length;
  const idx = statusIndex(detail.status);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Transaction details"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <div className="mono modal-label">Transaction detail</div>
            <div className="modal-title">{label}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {loading ? (
          <div className="modal-skeleton" aria-hidden="true">
            <div className="sk sk-line" />
            <div className="sk sk-line" />
            <div className="sk sk-line" />
            <div className="sk sk-block" />
          </div>
        ) : (
          <div className="modal-body">
            <div className="tx-detail-row">
              <span className="tx-detail-key mono">Hash</span>
              <span className="mono">{shortHash(detail.hash)}</span>
            </div>
            <div className="tx-detail-row">
              <span className="tx-detail-key mono">Status</span>
              <span className={`pill pill-${meta.tone}`}>
                <span className="dot" />
                {meta.label}
              </span>
            </div>

            {/* lifecycle timeline */}
            {idx >= 0 && (
              <div className="tx-timeline" aria-hidden="true">
                {LIFECYCLE.map((step, i) => (
                  <div key={step} className={`tx-timeline-step${i <= idx ? " done" : ""}`}>
                    <span className="tx-timeline-dot" />
                    <span className="tx-timeline-label mono">{step}</span>
                  </div>
                ))}
              </div>
            )}

            {detail.executionResult && (
              <div className="tx-detail-row">
                <span className="tx-detail-key mono">Execution</span>
                <span className={detail.executionResult === "SUCCESS" ? "ok-text" : "err-text"}>
                  {detail.executionResult}
                </span>
              </div>
            )}
            {typeof detail.gasUsed === "number" && (
              <div className="tx-detail-row">
                <span className="tx-detail-key mono">Gas used</span>
                <span className="mono">{formatNumber(detail.gasUsed)}</span>
              </div>
            )}
            {detail.validatorCount !== undefined && (
              <div className="tx-detail-row">
                <span className="tx-detail-key mono">Validators</span>
                <span className="mono">{detail.validatorCount}</span>
              </div>
            )}
            {voteValues.length > 0 && (
              <div className="tx-detail-row">
                <span className="tx-detail-key mono">Consensus votes</span>
                <span className="mono">
                  <span className="ok-text">{agree} agree</span>
                  {disagree > 0 && (
                    <span className="err-text">
                      {" "}
                      · {disagree} disagree
                    </span>
                  )}
                </span>
              </div>
            )}

            {detail.triggered.length > 0 && (
              <div className="tx-detail-block">
                <div className="tx-detail-key mono">Triggered child transactions</div>
                <ul className="tx-triggered">
                  {detail.triggered.map((t) => (
                    <li key={t} className="mono">
                      {shortAddress(t)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.stdout && (
              <div className="tx-detail-block">
                <div className="tx-detail-key mono">stdout</div>
                <pre className="tx-detail-pre">{detail.stdout}</pre>
              </div>
            )}
            {detail.stderr && (
              <div className="tx-detail-block">
                <div className="tx-detail-key mono">stderr</div>
                <pre className="tx-detail-pre">{detail.stderr}</pre>
              </div>
            )}

            {detail.error && (
              <div className="tx-detail-error">
                <strong>Execution failed</strong>
                <p className="mono">{detail.error}</p>
              </div>
            )}

            {url && (
              <a className="btn btn-ghost btn-sm tx-detail-link" href={url} target="_blank" rel="noreferrer noopener">
                View on explorer ↗
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
