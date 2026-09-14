import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import StatusPill from "../components/StatusPill";
import WalletControls from "../components/WalletControls";
import { useWallet } from "../hooks/useWallet";
import { NETWORKS, getNetwork, type NetworkKey } from "../lib/chains";
import { formatActionError, formatTransportError, getStoredNetwork, setStoredNetwork } from "../lib/client";
import {
  readCuratorState,
  readGovernorProfile,
  readListedGovernors,
  readReview,
  requestGovernorReReview,
  submitGovernorForReview,
  waitForTx,
  type CuratorState,
  type GovernorReview,
  type ListedGovernor,
} from "../lib/governor";
import { formatNumber, isAddressHex, shortAddress } from "../lib/format";

function scoreTone(score: number): "teal" | "amber" {
  return score >= 85 ? "teal" : "amber";
}

const SUB_KEY = "lex-machina-submissions";

function loadSubs(net: NetworkKey): string[] {
  try {
    const raw = localStorage.getItem(SUB_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    return Array.isArray(all[net]) ? all[net] : [];
  } catch {
    return [];
  }
}

function saveSub(net: NetworkKey, addr: string): string[] {
  const next = [...loadSubs(net)];
  const key = addr.toLowerCase();
  if (!next.some((a) => a.toLowerCase() === key)) next.push(addr);
  try {
    const raw = localStorage.getItem(SUB_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    all[net] = next;
    localStorage.setItem(SUB_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  return next;
}

function dropSub(net: NetworkKey, addr: string): string[] {
  const next = loadSubs(net).filter((a) => a.toLowerCase() !== addr.toLowerCase());
  try {
    const raw = localStorage.getItem(SUB_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    all[net] = next;
    localStorage.setItem(SUB_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
  return next;
}

function GovCard({
  g,
  net,
  account,
  reReviewing,
  onReReview,
}: {
  g: ListedGovernor;
  net: NetworkKey;
  account: string | null;
  reReviewing: string | null;
  onReReview: (governor: string) => void;
}) {
  return (
    <article className="gov-card">
      <div className="gov-card-top">
        <StatusPill tone={scoreTone(g.score)}>AI {g.score}</StatusPill>
        <span className="mono proto-meta">
          {formatNumber(g.protocol_count)} protocols
        </span>
      </div>
      <h3>
        <Link to={`/governor/${g.address}?net=${net}`} className="gov-card-title">
          {g.name || "Unnamed governor"}
        </Link>
      </h3>
      {g.description && <p>{g.description}</p>}
      <div className="mono gov-card-addr">{shortAddress(g.address)}</div>
      <div className="gov-card-actions">
        <Link to={`/governor/${g.address}?net=${net}`} className="btn btn-primary btn-sm">
          View profile
        </Link>
        <Link to={`/console?gov=${g.address}&net=${net}`} className="btn btn-ghost btn-sm">
          Open console →
        </Link>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={!account || reReviewing === g.address}
          title={
            !account
              ? "Connect a wallet to submit this transaction"
              : "Only the governor owner can trigger a re-review"
          }
          onClick={() => onReReview(g.address)}
        >
          {reReviewing === g.address ? "Reviewing…" : "Re-review"}
        </button>
      </div>
    </article>
  );
}

export default function Governors() {
  const [net, setNet] = useState<NetworkKey>(() => getStoredNetwork());
  const {
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
    openWalletPicker,
    closeWalletPicker,
    refreshWalletOptions,
    connectWalletOption,
    disconnectWallet,
    switchWalletNetwork,
    ensureWriteClient,
    readClient: client,
  } = useWallet(net);

  const [listed, setListed] = useState<ListedGovernor[]>([]);
  const [curatorState, setCuratorState] = useState<CuratorState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitAddr, setSubmitAddr] = useState("");
  const [busy, setBusy] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<GovernorReview | null>(null);
  const [reReviewing, setReReviewing] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [subs, setSubs] = useState<string[]>(() => loadSubs(getStoredNetwork()));
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [subReviews, setSubReviews] = useState<Record<string, GovernorReview>>({});
  const inflight = useRef(false);

  const curator = getNetwork(net).curator ?? null;

  useEffect(() => {
    setStoredNetwork(net);
    setSubs(loadSubs(net));
    setReviewResult(null);
  }, [net]);

  const load = useCallback(async () => {
    if (!client || !curator) {
      setListed([]);
      setCuratorState(null);
      return;
    }
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    setError(null);
    try {
      const st = await readCuratorState(client, curator);
      await new Promise((r) => setTimeout(r, 700));
      const governors = await readListedGovernors(client, curator);
      setCuratorState(st);
      setListed(governors);
    } catch (e) {
      setError(formatTransportError(e) ?? (e as Error).message);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [client, curator]);

  useEffect(() => {
    load();
  }, [load]);

  // Mine tab: verify ownership on-chain (paced) and refresh pending submissions.
  useEffect(() => {
    if (tab !== "mine" || !client || !curator) return;
    let cancelled = false;
    (async () => {
      const map: Record<string, string> = {};
      for (const g of listed) {
        try {
          const p = await readGovernorProfile(client, g.address);
          if (cancelled) return;
          map[g.address.toLowerCase()] = (p.owner ?? "").toLowerCase();
        } catch {
          /* old governors lack profiles */
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      if (cancelled) return;
      setOwners(map);
      const revs: Record<string, GovernorReview> = {};
      for (const a of loadSubs(net)) {
        try {
          const rev = await readReview(client, curator, a);
          if (cancelled) return;
          if (rev.score > 0 || rev.listed) revs[a.toLowerCase()] = rev;
        } catch {
          /* still scoring or unreadable */
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      if (!cancelled) setSubReviews(revs);
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, client, curator, listed, net]);

  const submitValid = isAddressHex(submitAddr.trim());

  const onSubmit = async () => {
    if (!curator || !submitValid) return;
    const addr = submitAddr.trim();
    setBusy(true);
    setSubmitMsg(null);
    setReviewResult(null);
    try {
      const writeClient = await ensureWriteClient();
      const hash = await submitGovernorForReview(writeClient, curator, addr);
      setSubs(saveSub(net, addr));
      setBusy(false);
      setScoring(true);
      setSubmitMsg("Finalized. AI validators are scoring it now…");
      const res = await waitForTx(client, hash);
      if (res.status === "error") {
        setSubmitMsg(`Submission failed: ${res.error ?? "execution error"}`);
        setScoring(false);
        load();
        return;
      }
      // Bounded poll for the recorded review (1 read / 10s, max ~2 min).
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 10000));
        try {
          const rev = await readReview(client, curator, addr);
          if (rev.score > 0 || rev.listed) {
            setReviewResult(rev);
            setSubs(dropSub(net, addr));
            setSubmitAddr("");
            setSubmitMsg(
              rev.listed
                ? `Approved! AI score ${rev.score}.`
                : `Not listed (score ${rev.score}). ${rev.reasoning}`,
            );
            setScoring(false);
            load();
            return;
          }
        } catch {
          /* keep polling */
        }
      }
      setSubmitMsg("Still scoring — reviews finalize through consensus. Check back in a few minutes.");
      setScoring(false);
      load();
    } catch (e) {
      setSubmitMsg(formatActionError(e, "Submit for review"));
      setBusy(false);
      setScoring(false);
    }
  };

  const onReReview = async (governor: string) => {
    if (!curator) return;
    setReReviewing(governor);
    setSubmitMsg(null);
    try {
      const writeClient = await ensureWriteClient();
      const hash = await requestGovernorReReview(writeClient, curator, governor);
      setSubmitMsg(`Re-review submitted: ${hash}. New score lands after consensus.`);
      waitForTx(client, hash).then(() => load());
    } catch (e) {
      setSubmitMsg(formatActionError(e, "Request re-review"));
    } finally {
      setReReviewing(null);
    }
  };

  const mineOwned = listed.filter(
    (g) => account && owners[g.address.toLowerCase()] === account.toLowerCase(),
  );
  const minePending = subs.filter((a) => {
    const key = a.toLowerCase();
    const rev = subReviews[key];
    if (rev && (rev.score > 0 || rev.listed)) return false;
    if (listed.some((g) => g.address.toLowerCase() === key)) return false;
    return true;
  });

  return (
    <main className="governors">
      <div className="container container--body">
        <section className="guide-hero">
          <span className="eyebrow">Directory</span>
          <h1>Governors, judged by AI.</h1>
          <p>
            Any governor owner can put their deployment forward. Independent
            LLM validators score it against a public rubric — only governors at
            or above the bar earn a place here, with their AI score as a trust
            badge. No human gatekeeper decides what gets promoted.
          </p>
          <div className="network-tabs" role="tablist" aria-label="Network">
            {NETWORKS.map((n) => (
              <button
                key={n.key}
                type="button"
                role="tab"
                aria-selected={net === n.key}
                className={`network-tab${net === n.key ? " active" : ""}`}
                onClick={() => setNet(n.key)}
              >
                {n.label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <WalletControls
            account={account}
            selectedLabel={selectedLabel}
            switching={switching}
            walletChainId={walletChainId}
            expectedChainId={expectedChainId}
            expectedNetworkLabel={expectedNetworkLabel}
            expectedRpcUrl={expectedRpcUrl}
            chainIdShared={chainIdShared}
            networkOk={networkOk}
            walletError={walletError}
            pickerOpen={pickerOpen}
            walletOptions={walletOptions}
            discoveringWallets={discoveringWallets}
            selectingWalletId={selectingWalletId}
            onOpenPicker={openWalletPicker}
            onClosePicker={closeWalletPicker}
            onRefreshPicker={refreshWalletOptions}
            onSelectWallet={connectWalletOption}
            onDisconnect={disconnectWallet}
            onSwitchNetwork={switchWalletNetwork}
          />
        </section>

        {!curator ? (
          <section className="panel">
            <div className="panel-title">No curator on this network</div>
            <p className="proto-action-desc">
              {getNetwork(net).label} has no AI curator deployed yet. Switch to
              Studionet to browse verified governors.
            </p>
          </section>
        ) : (
          <>
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">
                  AI-verified governors
                  {curatorState && (
                    <span className="mono panel-count">
                      {" "}· bar {curatorState.min_score} · {listed.length} listed
                    </span>
                  )}
                </div>
                <div className="panel-head-actions">
                  <div className="network-tabs" role="tablist" aria-label="Directory view" style={{ marginTop: 0 }}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === "all"}
                      className={`network-tab${tab === "all" ? " active" : ""}`}
                      onClick={() => setTab("all")}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={tab === "mine"}
                      className={`network-tab${tab === "mine" ? " active" : ""}`}
                      onClick={() => setTab("mine")}
                    >
                      My governors
                    </button>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={loading}
                    onClick={() => load()}
                  >
                    {loading ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>
              {loading && <p className="loading mono">Reading the on-chain directory…</p>}
              {error && (
                <div className="load-error">
                  <strong>Couldn’t read the directory.</strong>
                  <p className="mono">{error}</p>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => load()}>
                    Retry
                  </button>
                </div>
              )}
              {tab === "all" && !loading && !error && listed.length === 0 && (
                <p className="proto-action-desc">
                  No governors verified yet. Be the first — submit yours below.
                </p>
              )}
              {tab === "all" && (
                <div className="gov-cards">
                  {listed.map((g) => (
                    <GovCard
                      key={g.address}
                      g={g}
                      net={net}
                      account={account}
                      reReviewing={reReviewing}
                      onReReview={onReReview}
                    />
                  ))}
                </div>
              )}
              {tab === "mine" && (
                <>
                  {!account ? (
                    <p className="proto-action-desc">
                      Connect a wallet to see the governors you own.
                    </p>
                  ) : (
                    <>
                      {mineOwned.length === 0 && minePending.length === 0 && (
                        <p className="proto-action-desc">
                          None of the verified governors belong to this wallet, and
                          nothing you submitted is still scoring. Submit yours below.
                        </p>
                      )}
                      {mineOwned.length > 0 && (
                        <div className="gov-cards">
                          {mineOwned.map((g) => (
                            <GovCard
                              key={g.address}
                              g={g}
                              net={net}
                              account={account}
                              reReviewing={reReviewing}
                              onReReview={onReReview}
                            />
                          ))}
                        </div>
                      )}
                      {minePending.map((a) => {
                        const rev = subReviews[a.toLowerCase()];
                        return (
                          <div key={a} className="proto-row">
                            <div className="proto-main">
                              <span className="mono proto-addr">{shortAddress(a)}</span>
                              <span className="mono proto-meta">
                                {rev
                                  ? rev.listed
                                    ? `scored ${rev.score} — listed`
                                    : `scored ${rev.score} — not listed`
                                  : "scoring… reviews finalize through consensus"}
                              </span>
                            </div>
                            <div className="proto-actions">
                              <Link
                                to={`/console?gov=${a}&net=${net}`}
                                className="btn btn-ghost btn-sm"
                              >
                                Open console →
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              )}
            </section>

            <section className="panel">
              <div className="panel-title">Submit your governor</div>
              <p className="proto-action-desc">
                Only the governor’s owner wallet can submit it. The button waits
                for consensus, then shows the verdict: approved with its AI
                score, or rejected with the reason.
              </p>
              <div className="register-grid">
                <input
                  className="input mono-input"
                  placeholder="Governor address 0x…"
                  value={submitAddr}
                  onChange={(e) => setSubmitAddr(e.target.value)}
                />
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!account || !submitValid || busy || scoring}
                  title={
                    !account
                      ? "Connect a wallet to submit this transaction"
                      : !submitValid
                        ? "Enter a valid 42-character 0x governor address"
                        : undefined
                  }
                  onClick={onSubmit}
                >
                  {busy ? "Submitting…" : scoring ? "Scoring…" : "Submit for AI review"}
                </button>
              </div>
              {reviewResult && (
                <div className="duplicate-result">
                  <StatusPill tone={reviewResult.listed ? scoreTone(reviewResult.score) : "ember"}>
                    {reviewResult.listed ? `AI ${reviewResult.score}` : "Not listed"}
                  </StatusPill>
                  <span>
                    {reviewResult.listed
                      ? `Approved with score ${reviewResult.score}.`
                      : `Score ${reviewResult.score}. ${reviewResult.reasoning}`}
                  </span>
                </div>
              )}
              {submitMsg && (
                <p className="mono rules-note" style={{ marginTop: 12 }}>
                  {submitMsg}
                </p>
              )}
            </section>

            <section className="guide-legend">
              <div className="panel-title">How curation works</div>
              <div className="legend-grid">
                <div className="legend-item">
                  <strong>Submit</strong>
                  <p>The governor owner puts their deployment forward. Anything else reverts.</p>
                </div>
                <div className="legend-item">
                  <strong>AI review</strong>
                  <p>Validators independently score identity, rules, threshold, and live protocols 0–100.</p>
                </div>
                <div className="legend-item">
                  <strong>Listed with badge</strong>
                  <p>Scores at or above the bar earn a directory place with the AI score shown.</p>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
