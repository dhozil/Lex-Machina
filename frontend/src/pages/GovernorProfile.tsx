import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Constellation, { type NodeState } from "../components/Constellation";
import StatusPill from "../components/StatusPill";
import WalletControls from "../components/WalletControls";
import { useWallet } from "../hooks/useWallet";
import { NETWORKS, getNetwork, type NetworkKey } from "../lib/chains";
import { formatTransportError, getStoredNetwork, setStoredNetwork } from "../lib/client";
import {
  isHalted,
  readGovernanceState,
  readGovernorProfile,
  readProtocolDescription,
  readProtocolLabel,
  readProtocolState,
  readProtocols,
  readReview,
  type GovernanceState,
  type GovernorProfile,
  type GovernorReview,
  type ProtocolState,
} from "../lib/governor";
import { formatNumber, isAddressHex, shortAddress } from "../lib/format";

function resolveNetwork(raw: string | null): NetworkKey {
  const k = raw as NetworkKey | null;
  return k && NETWORKS.some((n) => n.key === k) ? k : getStoredNetwork();
}

interface ProtoRow {
  addr: string;
  label: string;
  desc: string;
  halted: boolean | null;
  deposits: number | null;
  error?: string;
}

export default function GovernorProfile() {
  const { addr = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/governors");
  };
  const [net, setNet] = useState<NetworkKey>(() => resolveNetwork(searchParams.get("net")));
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
    readClient: client,
  } = useWallet(net);

  const [profile, setProfile] = useState<GovernorProfile | null>(null);
  const [govState, setGovState] = useState<GovernanceState | null>(null);
  const [rows, setRows] = useState<ProtoRow[]>([]);
  const [review, setReview] = useState<GovernorReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inflight = useRef(false);

  const addrValid = isAddressHex(addr);
  const curator = getNetwork(net).curator ?? null;
  const isOwner =
    Boolean(account && govState) &&
    account!.toLowerCase() === govState!.owner.toLowerCase();

  useEffect(() => {
    setStoredNetwork(net);
  }, [net]);

  const load = useCallback(async () => {
    if (!client || !addr) return;
    if (!addrValid) {
      setLoading(false);
      setError("This route is not a valid 42-character 0x governor address.");
      return;
    }
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    setError(null);
    const pace = () => new Promise((r) => setTimeout(r, 700));
    try {
      const gs = await readGovernanceState(client, addr);
      setGovState(gs);
      await pace();
      let prof: GovernorProfile | null = null;
      try {
        prof = await readGovernorProfile(client, addr);
      } catch {
        /* governors deployed before profiles lack the method */
      }
      setProfile(prof);
      await pace();
      const prots = await readProtocols(client, addr);
      await pace();
      const list: ProtoRow[] = [];
      for (const p of prots) {
        try {
          const ps = (await readProtocolState(client, addr, p)) as ProtocolState;
          await pace();
          const halted = await isHalted(client, addr, p);
          await pace();
          let label = "";
          try {
            label = await readProtocolLabel(client, addr, p);
          } catch {
            /* old governors lack the method */
          }
          await pace();
          let desc = "";
          try {
            desc = await readProtocolDescription(client, addr, p);
          } catch {
            /* old governors lack the method */
          }
          list.push({
            addr: p,
            label,
            desc,
            halted,
            deposits: ps?.total_deposits ?? null,
          });
        } catch (e) {
          list.push({ addr: p, label: "", desc: "", halted: null, deposits: null, error: (e as Error).message });
        }
        await pace();
      }
      setRows(list);
      if (curator) {        try {
          const rev = await readReview(client, curator, addr);
          if (rev.score > 0 || rev.listed) setReview(rev);
          else setReview(null);
        } catch {
          setReview(null);
        }
      } else {
        setReview(null);
      }
    } catch (e) {
      setError(formatTransportError(e) ?? (e as Error).message);
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  }, [client, addr, addrValid, curator]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setProfile(null);
    setGovState(null);
    setRows([]);
    setReview(null);
  }, [addr, net]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const nodeState = (r: ProtoRow): NodeState =>
    r.halted ? "halted" : "healthy";

  return (
    <main className="governors">
      <div className="container container--body">
        <div className="back-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={goBack}>
            ← Back
          </button>
        </div>
        <section className="guide-hero">
          <span className="eyebrow">Governor profile</span>
          <h1>{profile?.name || "Governor"}</h1>
          {profile?.description ? (
            <p>{profile.description}</p>
          ) : (
            <p>A self-governing protocol on GenLayer.</p>
          )}
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

        {loading && <p className="loading mono">Reading governor profile…</p>}
        {error && (
          <div className="load-error">
            <strong>Couldn’t read this governor.</strong>
            <p className="mono">{error}</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => load()}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && govState && (
          <>
            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">
                  {shortAddress(addr)}
                  {isOwner && <span className="mono panel-count"> · owner</span>}
                </div>
                <div className="panel-head-actions">
                  {review && (
                    <StatusPill tone={review.score >= 85 ? "teal" : "amber"}>
                      AI {review.score}
                    </StatusPill>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={copyAddress}>
                    {copied ? "Copied ✓" : "Copy address"}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => load()}>
                    Refresh
                  </button>
                </div>
              </div>
              <div className="stat-grid">
                <div className="stat">
                  <div className="stat-label">Protocols</div>
                  <div className="stat-value">{govState.protocol_count}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Risk threshold</div>
                  <div className="stat-value">{formatNumber(govState.risk_threshold)}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Rules version</div>
                  <div className="stat-value">{govState.rule_version}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Auto-tunes</div>
                  <div className="stat-value">{govState.tune_count}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Exploits verified</div>
                  <div className="stat-value">{govState.exploit_count}</div>
                </div>
              </div>
              <div className="gov-profile">
                <div className="panel-title">Rules</div>
                <p className="rules-text">{govState.rules || "—"}</p>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <div className="panel-title">
                  Governed protocols · {rows.length}
                </div>
                <div className="panel-head-actions">
                  <Link
                    to={`/console?gov=${addr}&net=${net}`}
                    className="btn btn-primary btn-sm"
                  >
                    Register protocol on this governor
                  </Link>
                </div>
              </div>
              {rows.length === 0 ? (
                <p className="proto-action-desc">
                  No protocols registered yet. Use the button above to open this
                  governor in the console and register the first one.
                </p>
              ) : (
                <ul className="proto-list">
                  {rows.map((r) => (
                    <li key={r.addr} className="proto-row">
                      <Link
                        to={`/protocol/${r.addr}?gov=${addr}&net=${net}`}
                        className="proto-main"
                      >
                        {r.label && <span className="proto-name">{r.label}</span>}
                        <span className="mono proto-addr">{shortAddress(r.addr)}</span>
                        {r.desc && <span className="proto-desc">{r.desc}</span>}
                        <div className="proto-badges">
                          {r.halted == null ? (
                            <StatusPill tone="amber">Unknown</StatusPill>
                          ) : r.halted ? (
                            <StatusPill tone="ember">Halted</StatusPill>
                          ) : (
                            <StatusPill tone="teal">Healthy</StatusPill>
                          )}
                          {r.deposits != null && (
                            <span className="mono proto-meta">
                              {formatNumber(r.deposits)} deposits
                            </span>
                          )}
                        </div>
                      </Link>
                      <div className="proto-mini" aria-hidden="true">
                        <Constellation
                          nodes={[{ id: r.addr, state: nodeState(r) }]}
                          size={120}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
