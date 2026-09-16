import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import StatusPill from "../components/StatusPill";
import TxLog from "../components/TxLog";
import TxDetailModal from "../components/TxDetailModal";
import { formatActionError, formatTransportError, getStoredGov, getStoredNetwork, setStoredGov, setStoredNetwork } from "../lib/client";
import WalletControls from "../components/WalletControls";
import { useWallet } from "../hooks/useWallet";
import { NETWORKS, getNetwork, type NetworkKey } from "../lib/chains";
import {
  approveListing,
  getTxDetail,
  isHalted,
  monitorAndTune,
  proposeHalt,
  proveSafe,
  readGovernanceState,
  readGovernorProfile,
  readListingRequests,
  readProtocolLabel,
  readProtocols,
  readProtocolState,
  registerProtocol,
  rejectListing,
  cancelListing,
  requestListing,
  resetRpcBreaker,
  setGovernorProfile,
  setProtocolDescription,
  waitForTx,
  type Client,
  type GovernanceState,
  type GovernorProfile,
  type ListingRequest,
  type ProtocolState,
  type TxDetail,
  type TxRecord,
} from "../lib/governor";
import { formatNumber, isAddressHex, shortAddress } from "../lib/format";
import { loadStoredTxs, saveStoredTxs } from "../lib/txStore";

interface ProtocolDetail {
  state?: ProtocolState;
  halted?: boolean;
  label?: string;
  error?: string;
}

function resolveInitialNetwork(searchParams: URLSearchParams): NetworkKey {
  const raw = searchParams.get("net") as NetworkKey | null;
  if (raw && NETWORKS.some((network) => network.key === raw)) return raw;
  return getStoredNetwork();
}

function resolveInitialGov(searchParams: URLSearchParams, network: NetworkKey): string {
  const explicit = searchParams.get("gov")?.trim();
  if (explicit) return explicit;
  return getStoredGov(network) ?? getNetwork(network).defaultGovernor ?? "";
}

export default function Console() {
  const [searchParams] = useSearchParams();
  const [network, setNetwork] = useState<NetworkKey>(() => resolveInitialNetwork(searchParams));
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
  } = useWallet(network);

  const [govInput, setGovInput] = useState(() => resolveInitialGov(searchParams, network));
  const [gov, setGov] = useState(() => resolveInitialGov(searchParams, network));
  const [state, setState] = useState<GovernanceState | null>(null);
  const [protocols, setProtocols] = useState<string[]>([]);
  const [details, setDetails] = useState<Record<string, ProtocolDetail>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [txs, setTxs] = useState<TxRecord[]>(() => loadStoredTxs());

  const [regAddr, setRegAddr] = useState("");
  const [regLabel, setRegLabel] = useState("");
  const [regDesc, setRegDesc] = useState("");
  const [profile, setProfile] = useState<GovernorProfile | null>(null);
  const [requests, setRequests] = useState<ListingRequest[]>([]);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileDesc, setProfileDesc] = useState("");
  const [reqAddr, setReqAddr] = useState("");
  const [reqLabel, setReqLabel] = useState("");
  const [reqDesc, setReqDesc] = useState("");
  const [watchAddr, setWatchAddr] = useState<string | null>(null);
  const watchSeenPending = useRef(false);
  const [haltAddr, setHaltAddr] = useState("");
  const [claim, setClaim] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const failStreak = useRef(0);
  const inflight = useRef(false);

  useEffect(() => {
    watchSeenPending.current = false;
  }, [watchAddr]);

  // Track a freshly registered/requested protocol until it resolves.
  // Derived from already-loaded state: zero extra RPC calls.
  let watchStatus: "pending" | "approved" | "closed" | null = null;
  if (watchAddr) {
    const lower = watchAddr.toLowerCase();
    if (protocols.some((p) => p.toLowerCase() === lower)) {
      watchStatus = "approved";
    } else if (requests.some((r) => r.address.toLowerCase() === lower)) {
      watchStatus = "pending";
      watchSeenPending.current = true;
    } else if (watchSeenPending.current) {
      watchStatus = "closed";
    } else {
      watchStatus = "pending";
    }
  }
  const [selectedTx, setSelectedTx] = useState<TxRecord | null>(null);
  const [txDetail, setTxDetail] = useState<TxDetail | null>(null);
  const [txDetailLoading, setTxDetailLoading] = useState(false);

  // Persist the selected network and the active Governor for this network.
  useEffect(() => {
    setStoredNetwork(network);
  }, [network]);

  useEffect(() => {
    if (gov) setStoredGov(gov, network);
  }, [gov, network]);

  const activeDefaultGovernor = getNetwork(network).defaultGovernor ?? null;
  const usingDefaultGovernor =
    Boolean(gov) &&
    Boolean(activeDefaultGovernor) &&
    gov.trim().toLowerCase() === (activeDefaultGovernor as string).toLowerCase();

  const resetGovData = useCallback(() => {
    setState(null);
    setProtocols([]);
    setDetails({});
    setProfile(null);
    setRequests([]);
    setLoadError(null);
  }, []);

  const resetQuotaGuards = useCallback(() => {
    resetRpcBreaker();
    failStreak.current = 0;
    setRateLimited(false);
    setAutoRefresh(false);
  }, []);

  const changeNetwork = (next: NetworkKey) => {
    const nextGov = getStoredGov(next) ?? getNetwork(next).defaultGovernor ?? "";
    setNetwork(next);
    setGovInput(nextGov);
    setGov(nextGov);
    resetGovData();
    // A different network means a different RPC endpoint — and its own quota.
    resetQuotaGuards();
  };

  const useDefaultGovernor = () => {
    if (!activeDefaultGovernor) return;
    activateGovernor(activeDefaultGovernor);
  };

  const govInputValid = isAddressHex(govInput.trim());
  const isOwner = Boolean(
    account && state && account.toLowerCase() === state.owner.toLowerCase(),
  );
  // A profile save in flight: derived from the tx log so it auto-clears on
  // finalize/error and survives reloads.
  const profileTxPending = txs.some(
    (t) => t.label === "Set governor profile" && t.status === "pending",
  );
  const registerTxPending = txs.some(
    (t) => t.label === "Register protocol" && t.status === "pending",
  );
  const regAddrValid = isAddressHex(regAddr.trim());
  const haltAddrValid = isAddressHex(haltAddr.trim());

  const loadAll = useCallback(async (silent = false, govOverride?: string) => {
    const g = govOverride ?? gov;
    if (!client || !g || !account) return;
    if (inflight.current) return;
    if (!isAddressHex(g)) {
      setState(null);
      setProtocols([]);
      setDetails({});
      setProfile(null);
      setRequests([]);
      setLoadError("Enter a valid 42-character 0x Governor address before loading state.");
      return;
    }
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    inflight.current = true;
    // Paced sequential reads: Studionet allows ~500 req/hour, and bursts
    // of parallel reads trip the limiter faster than spaced calls.
    const pace = () => new Promise((r) => setTimeout(r, 700));
    try {
      const st = await readGovernanceState(client, g);
      await pace();
      const prots = await readProtocols(client, g);
      setState(st);
      setProtocols(prots);
      let prof: GovernorProfile | null = null;
      try {
        prof = await readGovernorProfile(client, g);
      } catch {
        /* governors deployed before profiles lack the method */
      }
      setProfile(prof);
      await pace();
      let reqs: ListingRequest[] = [];
      try {
        reqs = await readListingRequests(client, g);
      } catch {
        /* governors deployed before listing queues lack the method */
      }
      setRequests(reqs);
      await pace();
      const d: Record<string, ProtocolDetail> = {};
      for (const p of prots) {
        try {
          const ps = await readProtocolState(client, g, p);
          await pace();
          const halted = await isHalted(client, g, p);
          await pace();
          let label = "";
          try {
            label = await readProtocolLabel(client, g, p);
          } catch {
            /* governors deployed before get_protocol_label lack the method */
          }
          d[p] = { state: ps, halted, label };
        } catch (e) {
          d[p] = { error: (e as Error).message };
        }
        await pace();
      }
      setDetails(d);
      failStreak.current = 0;
      setRateLimited(false);
    } catch (e) {
      const msg = (e as Error).message;
      setLoadError(formatTransportError(e) ?? msg);
      if (/rate limit|429|too many requests/i.test(msg)) {
        // Stop polling: every poll burns quota while limited.
        setRateLimited(true);
        setAutoRefresh(false);
      } else if (silent) {
        failStreak.current += 1;
        if (failStreak.current >= 3) setAutoRefresh(false);
      }
    } finally {
      inflight.current = false;
      if (!silent) setLoading(false);
    }
  }, [client, gov, account]);

  // Explicit user action: clear stale state, reset quota guards, and force a
  // fresh load even when the address equals the current one.
  const activateGovernor = useCallback(
    (v: string) => {
      resetGovData();
      resetQuotaGuards();
      setGovInput(v);
      setGov(v);
      setAutoRefresh(true);
      loadAll(false, v);
    },
    [resetGovData, resetQuotaGuards, loadAll],
  );

  useEffect(() => {
    if (gov && account) loadAll();
  }, [gov, client, account, loadAll]);

  // Auto-refresh the live governance state silently so the loading
  // indicator does not flash on every poll. Polls every 60s (a full poll
  // costs 2 + 2×protocols reads against a ~500 req/hour quota), skips
  // hidden tabs, and pauses itself after repeated failures.
  useEffect(() => {
    if (!gov || !account || !autoRefresh) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      loadAll(true);
    }, 60000);
    return () => clearInterval(id);
  }, [gov, account, autoRefresh, loadAll]);

  // Persist transaction history across reloads.
  useEffect(() => {
    saveStoredTxs(txs);
  }, [txs]);

  const pushTx = useCallback(
    (label: string, hash: string, ref?: string, after?: () => void) => {
      const rec: TxRecord = {
        id: `${hash}-${Date.now()}`,
        label,
        hash,
        status: "pending",
        createdAt: Date.now(),
        network,
        ref,
      };
      setTxs((prev) => [rec, ...prev]);
      waitForTx(client, hash).then(async (res) => {
        setTxs((prev) => prev.map((t) => (t.id === rec.id ? { ...t, ...res } : t)));
        if (res.status === "finalized" || res.status === "error") {
          if (network === "studio_next" && res.status === "finalized") {
            // Studio Next reads can lag finalization by seconds; a refresh
            // fired too early flashes stale state (e.g. "Unnamed governor").
            await new Promise((r) => setTimeout(r, 10000));
          }
          loadAll();
        }
        if (res.status === "finalized" && after) after();
      });
    },
    [client, network, loadAll],
  );

  const runAction = useCallback(
    async (key: string, label: string, fn: (c: Client) => Promise<string>, ref?: string, after?: () => void) => {
      if (!gov) return;
      setBusy(key);
      try {
        const writeClient = await ensureWriteClient();
        const hash = await fn(writeClient);
        pushTx(label, hash, ref, after);
      } catch (e) {
        setTxs((prev) => [
          {
            id: `${label}-${Date.now()}`,
            label,
            hash: "",
            status: "error",
            error: formatActionError(e, label),
            createdAt: Date.now(),
            network,
            ref,
          },
          ...prev,
        ]);
      } finally {
        setBusy(null);
      }
    },
    [ensureWriteClient, gov, pushTx, network],
  );

  const openTxDetail = useCallback(
    async (tx: TxRecord) => {
      if (!tx.hash.startsWith("0x")) return;
      setSelectedTx(tx);
      setTxDetailLoading(true);
      try {
        setTxDetail(await getTxDetail(client, tx.hash));
      } catch {
        setTxDetail(null);
      } finally {
        setTxDetailLoading(false);
      }
    },
    [client],
  );

  return (
    <main className="console">
      <div className="container container--body">
        {/* Connection bar */}
        <section className="conn-bar panel">
          <div className="conn-left">
            <div className="field">
              <label htmlFor="net">Network</label>
              <select
                id="net"
                className="input"
                value={network}
                onChange={(e) => changeNetwork(e.target.value as NetworkKey)}
              >
                {NETWORKS.map((n) => (
                  <option key={n.key} value={n.key}>
                    {n.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field conn-gov">
              <label htmlFor="gov">Governor contract</label>
              <div className="gov-row">
                <input
                  id="gov"
                  className="input mono-input"
                  placeholder="0x…"
                  value={govInput}
                  onChange={(e) => setGovInput(e.target.value)}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={!account || !govInputValid || loading}
                  title={
                    !account
                      ? "Connect a wallet before loading a Governor"
                      : !govInputValid
                        ? "Enter a valid 42-character 0x Governor address"
                        : undefined
                  }
                  onClick={() => govInput.trim() && activateGovernor(govInput.trim())}
                >
                  {loading ? "Loading…" : "Load"}
                </button>
                {activeDefaultGovernor && !usingDefaultGovernor && (
                  <button className="btn btn-ghost btn-sm" onClick={useDefaultGovernor}>
                    Use built-in
                  </button>
                )}
              </div>
              <p className="conn-note mono">
                {usingDefaultGovernor
                  ? `Built-in ${getNetwork(network).label} Governor active.`
                  : activeDefaultGovernor
                    ? "Built-in Governor available; paste another address to override it."
                    : "Paste the Governor deployed on this network."}
              </p>
            </div>
          </div>
          <div className="conn-right">
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
          </div>
        </section>

        {!account ? (
          <section className="empty panel">
            <h2>Connect a wallet to unlock the console</h2>
            <p>
              Select one of the detected EVM wallets above. Governor state, governed
              protocols, actions, and transaction details stay locked until a wallet
              is connected.
            </p>
            <button className="btn btn-primary btn-sm" onClick={openWalletPicker}>
              Connect wallet
            </button>
          </section>
        ) : (
          <>
            {!gov && (
          <section className="empty panel">
            <h2>Connect a Governor</h2>
            <p>
              Paste your deployed <span className="mono">Governor</span> contract
              address to inspect its governance state and drive its actions. Deploy
              it first with the CLI or Studio, then copy the address here.
            </p>
            <div className="empty-note mono">
              Deploy: <code>DEPLOYER_PRIVATE_KEY=0x... node deploy/deploy-frontend.mjs studio_next</code>
            </div>
          </section>
        )}

        {gov && (
          <>
            {/* Governance state */}
            <section className="gov-state">
              <div className="panel-head">
                <div className="panel-title">
                  Governance state
                  {account && state && (
                    <span className={`mono panel-count ${isOwner ? "ok-text" : ""}`}>
                      {" "}· {isOwner ? "owner" : "viewer"} {shortAddress(account)}
                    </span>
                  )}
                </div>
                <div className="panel-head-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={!account || loading}
                    onClick={() => loadAll()}
                  >
                    {loading ? "Refreshing…" : "Refresh"}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={!account || busy === "tune"}
                    title={
                      !account
                        ? "Connect a wallet to submit this transaction"
                        : "Anyone can trigger a tune; validators decide the outcome"
                    }
                    onClick={() => runAction("tune", "Monitor & tune", (c) => monitorAndTune(c, gov))}
                  >
                    {busy === "tune" ? "Tuning…" : "Monitor & tune"}
                  </button>
                </div>
              </div>
              {loading && <p className="loading mono">Reading on-chain state…</p>}
              {loadError && (
                <div className="load-error">
                  <strong>Couldn’t read the Governor.</strong>
                  <p className="mono">{loadError}</p>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadAll()}>
                    Retry
                  </button>
                </div>
              )}
              {rateLimited && !loadError && (
                <div className="load-error">
                  <strong>Live updates paused (rate limit).</strong>
                  <p className="mono">Wait a few minutes for quota to recover, then resume.</p>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setRateLimited(false);
                      failStreak.current = 0;
                      setAutoRefresh(true);
                      loadAll();
                    }}
                  >
                    Resume live updates
                  </button>
                </div>
              )}
              {state && !loading && (
                <div className="stat-grid">
                  <div className="stat">
                    <div className="stat-label">Risk threshold</div>
                    <div className="stat-value">{formatNumber(state.risk_threshold)}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Rules version</div>
                    <div className="stat-value">{state.rule_version}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Auto-tunes</div>
                    <div className="stat-value">{state.tune_count}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Exploits verified</div>
                    <div className="stat-value">{state.exploit_count}</div>
                  </div>
                  <div className="stat">
                    <div className="stat-label">Protocols</div>
                    <div className="stat-value">{state.protocol_count}</div>
                  </div>
                </div>
              )}
              {(profile || isOwner) && (
                <div className="gov-profile">
                  {profileTxPending ? (
                    <strong className="gov-profile-name muted">
                      Saving on-chain…{" "}
                      <span
                        className="spinner"
                        aria-hidden="true"
                        style={{ display: "inline-block", verticalAlign: "-3px" }}
                      />
                    </strong>
                  ) : profile?.name ? (
                    <strong className="gov-profile-name">{profile.name}</strong>
                  ) : (
                    <strong className="gov-profile-name muted">Unnamed governor</strong>
                  )}
                  {profile?.description && (
                    <p className="gov-profile-desc">{profile.description}</p>
                  )}
                  {isOwner && !editingProfile && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setProfileName(profile?.name ?? "");
                        setProfileDesc(profile?.description ?? "");
                        setEditingProfile(true);
                      }}
                    >
                      {profile?.name ? "Edit profile" : "Set profile"}
                    </button>
                  )}
                  {isOwner && editingProfile && (
                    <div className="proto-desc-edit">
                      <input
                        className="input"
                        placeholder="Governor name (e.g. Lex Machina)"
                        value={profileName}
                        maxLength={80}
                        onChange={(e) => setProfileName(e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="What does this governor oversee? (one line)"
                        value={profileDesc}
                        maxLength={280}
                        onChange={(e) => setProfileDesc(e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={!profileName.trim() || busy === "profile"}
                        onClick={() => {
                          // Optimistic update: the on-chain refresh lags on
                          // Studio Next, so show the new values immediately.
                          const name = profileName.trim();
                          const desc = profileDesc.trim();
                          setProfile({ name, description: desc, owner: account ?? profile?.owner ?? "" });
                          runAction("profile", "Set governor profile", (c) =>
                            setGovernorProfile(c, gov, name, desc),
                          );
                          setEditingProfile(false);
                        }}
                      >
                        {busy === "profile" ? "Saving…" : "Save on-chain"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditingProfile(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>

            <div className="console-grid">
              {/* Left column */}
              <div className="console-main">
                <section className="panel">
                  <div className="panel-title">Governed protocols</div>
                  {protocols.length === 0 ? (
                    <div className="sub-empty">
                      <p>No protocols registered yet.</p>
                      <p className="sub-empty-sub">
                        Register a governed protocol below, then the Governor can
                        verify exploits and auto-tune across them.
                      </p>
                    </div>
                  ) : (
                    <ul className="proto-list">
                      {protocols.map((p) => {
                        const d = details[p];
                        const halted = d?.halted;
                        const paused = d?.state?.paused;
                        return (
                          <li key={p} className="proto-row">
                            <Link to={`/protocol/${p}?gov=${gov}&net=${network}`} className="proto-main">
                              {d?.label && (
                                <span className="proto-name">{d.label}</span>
                              )}
                              <span className="mono proto-addr">{shortAddress(p)}</span>
                              <div className="proto-badges">
                                {halted ? (
                                  <StatusPill tone="ember">Halted</StatusPill>
                                ) : paused ? (
                                  <StatusPill tone="amber">Paused</StatusPill>
                                ) : (
                                  <StatusPill tone="teal">Healthy</StatusPill>
                                )}
                                {d?.state && (
                                  <span className="mono proto-meta">
                                    {formatNumber(d.state.total_deposits)} deposits
                                  </span>
                                )}
                              </div>
                            </Link>
                            <div className="proto-actions">
                              {halted && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  disabled={!account || busy === `resume-${p}`}
                                  title={!account ? "Connect a wallet to submit this transaction" : undefined}
                                  onClick={() =>
                                    runAction(`resume-${p}`, "Prove safe", (c) =>
                                      proveSafe(c, gov, p, "Fix deployed"),
                                    )
                                  }
                                >
                                  {busy === `resume-${p}` ? "Verifying…" : "Prove safe"}
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  {/* Register protocol */}
                  <div className="register">
                    <div className="panel-title">Register a protocol</div>
                    <div className="register-grid">
                      <input
                        className="input mono-input"
                        placeholder="Protocol address 0x…"
                        value={regAddr}
                        onChange={(e) => setRegAddr(e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Label (e.g. Vault)"
                        value={regLabel}
                        onChange={(e) => setRegLabel(e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Description (optional, stored on-chain)"
                        value={regDesc}
                        maxLength={280}
                        onChange={(e) => setRegDesc(e.target.value)}
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={
                          !account ||
                          !isOwner ||
                          !regAddrValid ||
                          busy === "register" ||
                          registerTxPending
                        }
                        title={
                          !account
                            ? "Connect a wallet to submit this transaction"
                            : !isOwner
                              ? "Only the Governor owner wallet can register protocols"
                              : !regAddrValid
                                ? "Enter a valid 42-character 0x protocol address"
                                : registerTxPending
                                  ? "Registration in flight — watch its status below"
                                  : undefined
                        }
                        onClick={() => {
                          const addr = regAddr.trim();
                          const label = regLabel.trim() || "Protocol";
                          const desc = regDesc.trim();
                          runAction(
                            "register",
                            "Register protocol",
                            (c) => registerProtocol(c, gov, addr, label),
                            addr,
                            () => {
                              setWatchAddr(addr);
                              if (desc) {
                                runAction(
                                  "desc",
                                  "Set protocol description",
                                  (c) => setProtocolDescription(c, gov, addr, desc),
                                  addr,
                                );
                              }
                            },
                          );
                        }}
                      >
                        {busy === "register" || registerTxPending ? "Registering…" : "Register"}
                      </button>
                    </div>
                    {account && state && !isOwner && (
                      <p className="wallet-hint">
                        Connected wallet is not the Governor owner. Registration, approval,
                        and duplication are unavailable; listing requests, exploit reports,
                        and tuning remain permissionless.
                      </p>
                    )}
                  </div>
                </section>

                {/* Listing requests */}
                <section className="panel">
                  <div className="panel-title">Listing requests</div>
                  <p className="panel-desc">
                    Anyone can request a listing for a compatible protocol; the
                    Governor owner approves or rejects. Approved protocols are
                    registered with their requested label and description.
                  </p>
                  {watchStatus && watchAddr && (
                    <div className="duplicate-result">
                      <StatusPill
                        tone={
                          watchStatus === "approved"
                            ? "teal"
                            : watchStatus === "closed"
                              ? "ember"
                              : "amber"
                        }
                      >
                        {watchStatus === "approved"
                          ? "Registered"
                          : watchStatus === "closed"
                            ? "Not listed"
                            : "Pending approval"}
                      </StatusPill>
                      <span className="mono">{shortAddress(watchAddr)}</span>
                      <span>
                        {watchStatus === "approved"
                          ? "The owner approved — the protocol is now governed."
                          : watchStatus === "closed"
                            ? "The request is no longer pending (rejected or cancelled)."
                            : "Waiting for the owner’s decision…"}
                      </span>
                      {watchStatus === "approved" && (
                        <Link
                          to={`/protocol/${watchAddr}?gov=${gov}&net=${network}`}
                          className="mono ok-text"
                        >
                          Open protocol →
                        </Link>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setWatchAddr(null)}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                  {requests.length === 0 ? (
                    <p className="proto-action-desc">No pending requests.</p>
                  ) : (
                    <ul className="proto-list">
                      {requests.map((r) => (
                        <li key={r.address} className="proto-row">
                          <div className="proto-main">
                            {r.label && <span className="proto-name">{r.label}</span>}
                            <span className="mono proto-addr">{shortAddress(r.address)}</span>
                            {r.description && (
                              <span className="proto-desc">{r.description}</span>
                            )}
                            <span className="mono proto-meta">
                              requested by {shortAddress(r.requester)}
                            </span>
                          </div>
                          {isOwner && (
                            <div className="proto-actions">
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={!account || busy === `approve-${r.address}`}
                                onClick={() =>
                                  runAction(`approve-${r.address}`, "Approve listing", (c) =>
                                    approveListing(c, gov, r.address),
                                  )
                                }
                              >
                                {busy === `approve-${r.address}` ? "Approving…" : "Approve"}
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                disabled={!account || busy === `reject-${r.address}`}
                                onClick={() =>
                                  runAction(`reject-${r.address}`, "Reject listing", (c) =>
                                    rejectListing(c, gov, r.address),
                                  )
                                }
                              >
                                {busy === `reject-${r.address}` ? "Rejecting…" : "Reject"}
                              </button>
                            </div>
                          )}
                          {!isOwner &&
                            account &&
                            r.requester.toLowerCase() === account.toLowerCase() && (
                              <div className="proto-actions">
                                <button
                                  className="btn btn-ghost btn-sm"
                                  disabled={busy === `cancel-${r.address}`}
                                  onClick={() =>
                                    runAction(`cancel-${r.address}`, "Cancel listing request", (c) =>
                                      cancelListing(c, gov, r.address),
                                    )
                                  }
                                >
                                  {busy === `cancel-${r.address}` ? "Cancelling…" : "Cancel request"}
                                </button>
                              </div>
                            )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="register">
                    <div className="panel-title">Request a listing</div>
                    <div className="register-grid">
                      <input
                        className="input mono-input"
                        placeholder="Protocol address 0x…"
                        value={reqAddr}
                        onChange={(e) => setReqAddr(e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Label (e.g. Vault)"
                        value={reqLabel}
                        onChange={(e) => setReqLabel(e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Description (optional)"
                        value={reqDesc}
                        maxLength={280}
                        onChange={(e) => setReqDesc(e.target.value)}
                      />
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={
                          !account ||
                          !isAddressHex(reqAddr.trim()) ||
                          !reqLabel.trim() ||
                          busy === "request"
                        }
                        title={
                          !account
                            ? "Connect a wallet to submit this transaction"
                            : !isAddressHex(reqAddr.trim())
                              ? "Enter a valid 42-character 0x protocol address"
                              : !reqLabel.trim()
                                ? "Enter a label for the protocol"
                                : "The protocol must declare this Governor and stay pending until approved"
                        }
                        onClick={() => {
                          const addr = reqAddr.trim();
                          runAction(
                            "request",
                            "Request listing",
                            (c) =>
                              requestListing(c, gov, addr, reqLabel.trim(), reqDesc.trim()),
                            addr,
                            () => setWatchAddr(addr),
                          );
                          setReqAddr("");
                          setReqLabel("");
                          setReqDesc("");
                        }}
                      >
                        {busy === "request" ? "Requesting…" : "Request listing"}
                      </button>
                    </div>
                  </div>
                </section>

                {/* Report exploit */}
                <section className="panel">
                  <div className="panel-title">Report an exploit</div>
                  <p className="panel-desc">
                    Anyone can submit an exploit claim. Validators independently
                    judge the evidence — if consensus confirms an active exploit, the
                    protocol is paused.
                  </p>
                  <div className="report-grid">
                    <input
                      className="input mono-input"
                      placeholder="Protocol address 0x…"
                      value={haltAddr}
                      onChange={(e) => setHaltAddr(e.target.value)}
                    />
                    <textarea
                      className="input report-claim"
                      placeholder="What is the exploit? (the claim)"
                      value={claim}
                      maxLength={2000}
                      onChange={(e) => setClaim(e.target.value)}
                    />
                    <textarea
                      className="input report-claim"
                      placeholder="Supporting evidence"
                      value={evidence}
                      maxLength={4000}
                      onChange={(e) => setEvidence(e.target.value)}
                    />
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={
                        !account || !haltAddrValid || !claim.trim() || !evidence.trim() || busy === "halt"
                      }
                      title={
                        !account
                          ? "Connect a wallet to submit this transaction"
                          : !haltAddrValid
                            ? "Enter a valid 42-character 0x protocol address"
                            : "Claim and evidence are both required"
                      }
                      onClick={() =>
                        runAction(
                          "halt",
                          "Propose halt",
                          (c) =>
                            proposeHalt(c, gov, haltAddr.trim(), claim.trim(), evidence.trim()),
                          haltAddr.trim(),
                        )
                      }
                      >
                        {busy === "halt" ? "Submitting…" : "Submit report & halt"}
                      </button>
                    </div>
                </section>

                {/* Rules */}
                <section className="panel rules-panel">
                  <div className="panel-title">Current rules</div>
                  <p className="rules-text">{state?.rules ?? "—"}</p>
                  <p className="mono rules-note">
                    The Governor rewrites these rules itself when it tunes.
                  </p>
                </section>
              </div>

              {/* Right column */}
              <aside className="console-side">
                <section className="panel tx-panel">
                  <div className="panel-head">
                    <div className="panel-title">Transactions</div>
                    <div className="panel-head-actions">
                      <label className="auto-refresh">
                        <input
                          type="checkbox"
                          checked={autoRefresh}
                          onChange={(e) => setAutoRefresh(e.target.checked)}
                        />
                        Live
                      </label>
                      {txs.length > 0 && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setTxs([])}>
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <TxLog txs={txs} network={network} onSelect={openTxDetail} />
                </section>
              </aside>
            </div>
          </>
          )}
          </>
        )}

        <div className="console-foot">
          <Link to="/" className="btn btn-ghost btn-sm">
            ← Back to overview
          </Link>
        </div>
      </div>

      {selectedTx && (txDetail || txDetailLoading) && (
        <TxDetailModal
          detail={txDetail ?? { hash: selectedTx.hash, status: selectedTx.status, triggered: [] }}
          label={selectedTx.label}
          network={network}
          loading={txDetailLoading}
          onClose={() => {
            setSelectedTx(null);
            setTxDetail(null);
          }}
        />
      )}
    </main>
  );
}
