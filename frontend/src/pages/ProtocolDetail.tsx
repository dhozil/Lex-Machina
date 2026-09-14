import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import TxLog from "../components/TxLog";
import Constellation from "../components/Constellation";
import WalletControls from "../components/WalletControls";
import { formatActionError, formatTransportError, getStoredGov, getStoredNetwork, setStoredGov } from "../lib/client";
import { useWallet } from "../hooks/useWallet";
import { NETWORKS, getNetwork, type NetworkKey } from "../lib/chains";
import {
  duplicateProtocol,
  isHalted,
  proposeHalt,
  proveSafe,
  readGovernanceState,
  readGovernorProfile,
  readProtocolDescription,
  readProtocolLabel,
  readProtocolState,
  setProtocolDescription,
  waitForTx,
  type Client,
  type GovernorProfile,
  type ProtocolState,
  type TxRecord,
} from "../lib/governor";
import { formatNumber, isAddressHex, shortAddress } from "../lib/format";
import { loadStoredTxs, saveStoredTxs } from "../lib/txStore";
import { addCopy, getCopies } from "../lib/copies";

function resolveNetwork(raw: string | null): NetworkKey {
  const k = raw as NetworkKey | null;
  return k && NETWORKS.some((n) => n.key === k) ? k : getStoredNetwork();
}

export default function ProtocolDetail() {
  const { addr = "" } = useParams();
  const [searchParams] = useSearchParams();

  const [net] = useState<NetworkKey>(() => resolveNetwork(searchParams.get("net")));
  const [gov] = useState<string>(() => {
    const explicit = searchParams.get("gov")?.trim();
    if (explicit) return explicit;
    const fallbackNetwork = resolveNetwork(searchParams.get("net"));
    return getStoredGov(fallbackNetwork) ?? getNetwork(fallbackNetwork).defaultGovernor ?? "";
  });
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

  const [state, setState] = useState<ProtocolState | null>(null);
  const [halted, setHalted] = useState<boolean | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [claim, setClaim] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [newProtocol, setNewProtocol] = useState<string | null>(null);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [onchainLabel, setOnchainLabel] = useState("");
  const [onchainDesc, setOnchainDesc] = useState("");
  const [govProfile, setGovProfile] = useState<GovernorProfile | null>(null);
  const [copies, setCopies] = useState<string[]>(() => getCopies(addr));

  const [txs, setTxs] = useState<TxRecord[]>(() => loadStoredTxs());

  useEffect(() => {
    if (gov) setStoredGov(gov, net);
  }, [gov, net]);

  useEffect(() => {
    setCopies(getCopies(addr));
    setNewProtocol(null);
    setOnchainLabel("");
    setOnchainDesc("");
    setGovProfile(null);
    setEditingDesc(false);
  }, [addr]);

  const addrValid = isAddressHex(addr);
  const govValid = isAddressHex(gov);
  const isOwner = Boolean(
    account && owner && account.toLowerCase() === owner.toLowerCase(),
  );

  const load = useCallback(async () => {
    if (!client || !addr || !account) return;
    if (!gov) {
      setState(null);
      setHalted(null);
      setOwner(null);
      setLoading(false);
      setError("A Governor address is needed before this protocol can be inspected.");
      return;
    }
    if (!addrValid) {
      setState(null);
      setHalted(null);
      setOwner(null);
      setLoading(false);
      setError("This route is not a valid 42-character 0x protocol address.");
      return;
    }
    if (!govValid) {
      setState(null);
      setHalted(null);
      setOwner(null);
      setLoading(false);
      setError("The connected Governor address is not a valid 42-character 0x address.");
      return;
    }
    setLoading(true);
    setError(null);
    // Paced sequential reads: Studionet allows ~500 req/hour.
    const pace = () => new Promise((r) => setTimeout(r, 700));
    try {
      const st = await readProtocolState(client, gov, addr);
      await pace();
      const h = await isHalted(client, gov, addr);
      await pace();
      const gs = await readGovernanceState(client, gov);
      await pace();
      let onchainLabel = "";
      try {
        onchainLabel = await readProtocolLabel(client, gov, addr);
      } catch {
        /* governors deployed before get_protocol_label lack the method */
      }
      await pace();
      let onchainDesc = "";
      try {
        onchainDesc = await readProtocolDescription(client, gov, addr);
      } catch {
        /* governors deployed before get_protocol_description lack the method */
      }
      setState(st);
      setHalted(h);
      setOwner(gs.owner);
      setOnchainLabel(onchainLabel);
      setOnchainDesc(onchainDesc);
      await pace();
      try {
        setGovProfile(await readGovernorProfile(client, gov));
      } catch {
        setGovProfile(null);
      }
    } catch (e) {
      setError(formatTransportError(e) ?? (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [client, gov, addr, account, addrValid, govValid]);

  useEffect(() => {
    if (account) load();
  }, [account, load]);

  const pushTx = useCallback(
    (label: string, hash: string) => {
      const rec: TxRecord = {
        id: `${hash}-${Date.now()}`,
        label,
        hash,
        status: "pending",
        createdAt: Date.now(),
        network: net,
        ref: addr,
      };
      setTxs((prev) => [rec, ...prev]);
      waitForTx(client, hash).then((res) => {
        setTxs((prev) => prev.map((t) => (t.id === rec.id ? { ...t, ...res } : t)));
        if (res.status === "finalized" || res.status === "error") load();
      });
    },
    [client, net, addr, load],
  );

  const runAction = useCallback(
    async (key: string, label: string, fn: (c: Client) => Promise<string>) => {
      if (!gov) return;
      setBusy(key);
      try {
        const writeClient = await ensureWriteClient();
        const hash = await fn(writeClient);
        pushTx(label, hash);
      } catch (e) {
        setTxs((prev) => [
          {
            id: `${label}-${Date.now()}`,
            label,
            hash: "",
            status: "error",
            error: formatActionError(e, label),
            createdAt: Date.now(),
            network: net,
            ref: addr,
          },
          ...prev,
        ]);
      } finally {
        setBusy(null);
      }
    },
    [ensureWriteClient, gov, net, addr, pushTx],
  );

  useEffect(() => {
    saveStoredTxs(txs);
  }, [txs]);

  const onDuplicate = useCallback(async () => {
    if (!gov) return;
    setBusy("duplicate");
    setNewProtocol(null);
    try {
      const writeClient = await ensureWriteClient();
      const { deployHash, newAddress, registerHash } = await duplicateProtocol(
        writeClient,
        gov,
        addr,
        `Copy of ${shortAddress(addr)}`,
      );
      const base = Date.now();
      const mk = (hash: string, label: string, off = 0): TxRecord => ({
        id: `${hash}-${base + off}`,
        label,
        hash,
        status: "pending",
        createdAt: base,
        network: net,
        ref: newAddress,
      });
      setTxs((prev) => [mk(deployHash, "Deploy copy"), mk(registerHash, "Register copy"), ...prev]);
      const [dRes, rRes] = await Promise.all([
        waitForTx(client, deployHash),
        waitForTx(client, registerHash),
      ]);
      setTxs((prev) =>
        prev.map((t) => {
          if (t.hash === deployHash) return { ...t, ...dRes };
          if (t.hash === registerHash) return { ...t, ...rRes };
          return t;
        }),
      );
      if (rRes.status === "finalized") {
        setNewProtocol(newAddress);
        addCopy(addr, newAddress);
        setCopies(getCopies(addr));
        load();
      }
    } catch (e) {
      setTxs((prev) => [
        {
          id: `duplicate-${Date.now()}`,
          label: "Duplicate instance",
          hash: "",
          status: "error",
          error: formatActionError(e, "Duplicate instance"),
          createdAt: Date.now(),
          network: net,
          ref: addr,
        },
        ...prev,
      ]);
    } finally {
      setBusy(null);
    }
  }, [ensureWriteClient, gov, net, addr, load]);

  const related = useMemo(() => txs.filter((t) => t.ref === addr).slice(0, 12), [txs, addr]);

  const status = loading || error ? "unknown" : halted ? "halted" : state?.paused ? "paused" : "healthy";
  const statusMeta = {
    unknown: {
      tone: "muted" as const,
      label: "Unknown",
      desc: "Reading the protocol state from the Governor…",
    },
    healthy: { tone: "teal" as const, label: "Healthy", desc: "The protocol is live and not paused or halted." },
    paused: { tone: "amber" as const, label: "Paused", desc: "A halt was requested; operations are blocked until the Governor resumes it." },
    halted: { tone: "ember" as const, label: "Halted", desc: "Validators verified an active exploit. The protocol is frozen and can only resume via “Prove safe”." },
  }[status];

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const shareLink = `${window.location.origin}/#/protocol/${addr}?gov=${gov}&net=${net}`;
  const nodeState = status === "paused" ? "pending" : status === "unknown" ? "idle" : status;

  return (
    <main className="proto-detail">
      <div className="container container--body">
        <div className="proto-detail-top">
          <Link to="/console" className="btn btn-ghost btn-sm">
            ← Back to console
          </Link>
        </div>

        <section className="panel">
          <div className="panel-title">Wallet</div>
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

        {!account ? (
          <section className="empty panel">
            <h2>Connect a wallet to inspect this protocol</h2>
            <p>
              Select one of the detected EVM wallets above. Live state, actions,
              copies, and transaction history stay locked until a wallet is connected.
            </p>
            <button className="btn btn-primary btn-sm" onClick={openWalletPicker}>
              Connect wallet
            </button>
          </section>
        ) : (
          <>

        {/* Header */}
        <section className="proto-hero panel">
          <div className="proto-hero-left">
            <div className="proto-hero-title-row">
              <div className="proto-mini" aria-hidden="true">
                <Constellation nodes={[{ id: addr, state: nodeState }]} size={196} />
              </div>
              <div className="proto-title-col">
                <h1 className="proto-hero-title">
                  {onchainLabel || "Governed protocol"}
                </h1>
                <div className="proto-title-pills">
                  <span className={`pill pill-${statusMeta.tone}`}>
                    <span className="dot" />
                    {statusMeta.label}
                  </span>
                  {copies.length > 0 && (
                    <span className="pill pill-violet">
                      <span className="dot" />
                      Duplicated {copies.length}×
                    </span>
                  )}
                </div>
                {editingDesc ? (
                  <div className="proto-desc-edit">
                    <input
                      className="input"
                      placeholder="What does this protocol do? (one line, stored on-chain)"
                      value={descDraft}
                      maxLength={280}
                      onChange={(e) => setDescDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy === "desc"}
                      onClick={() => {
                        runAction("desc", "Set protocol description", (c) =>
                          setProtocolDescription(c, gov, addr, descDraft.trim()),
                        );
                        setEditingDesc(false);
                      }}
                    >
                      {busy === "desc" ? "Saving…" : "Save on-chain"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditingDesc(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="proto-desc-row">
                    {txs.some(
                      (t) => t.label === "Set protocol description" && t.status === "pending",
                    ) ? (
                      <p className="proto-desc muted">
                        Saving on-chain…{" "}
                        <span
                          className="spinner"
                          aria-hidden="true"
                          style={{ display: "inline-block", verticalAlign: "-3px" }}
                        />
                      </p>
                    ) : (
                      onchainDesc && <p className="proto-desc">{onchainDesc}</p>
                    )}
                    {isOwner && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setDescDraft(onchainDesc);
                          setEditingDesc(true);
                        }}
                      >
                        {onchainDesc ? "Edit description" : "Add description"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="proto-addr-line">
              <code className="mono proto-addr-full">{addr}</code>
              <button className="btn btn-ghost btn-sm" onClick={copyAddress}>
                {copied ? "Copied ✓" : "Copy address"}
              </button>
            </div>
            <div className="proto-gov-line mono">
              Governed by{" "}
              <span className="ok-text">
                {govProfile?.name || (gov ? shortAddress(gov) : "—")}
              </span>
              {govProfile?.name && gov && (
                <span className="proto-meta"> {shortAddress(gov)}</span>
              )}
              {gov && (
                <Link to={`/console?gov=${gov}&net=${net}`} className="proto-gov-link">
                  open governor →
                </Link>
              )}
            </div>
          </div>

          <div className="proto-hero-right">
            <div className="proto-share">
              <span className="mono proto-share-label">Share this protocol</span>
              <div className="proto-share-row">
                <input className="input mono-input proto-share-input" readOnly value={shareLink} />
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareLink);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {copied ? "Copied ✓" : "Copy link"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Status banner */}
        <section className={`proto-status proto-status-${status}`}>
          <strong>{statusMeta.label}</strong>
          <p>{statusMeta.desc}</p>
        </section>

        {/* Stats */}
        <section className="proto-stats">
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">Total deposits</div>
              <div className="stat-value">{state ? formatNumber(state.total_deposits) : "—"}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Deposit count</div>
              <div className="stat-value">{state ? formatNumber(state.deposit_count) : "—"}</div>
            </div>
            <div className="stat">
              <div className="stat-label">Last activity</div>
              <div className="stat-value">{state ? formatNumber(state.last_activity) : "—"}</div>
            </div>
            <div className="stat">
              <div className="stat-label">State</div>
              <div className="stat-value">
                {state ? (state.paused ? "Paused" : "Live") : "—"}
              </div>
            </div>
          </div>
        </section>

        {loading && <p className="loading mono">Reading protocol state…</p>}
        {error && (
          <div className="load-error">
            <strong>Couldn’t read this protocol.</strong>
            <p className="mono">{error}</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => load()}>
              Retry
            </button>
          </div>
        )}

        <div className="proto-grid">
          <div className="proto-stack">
          {/* Actions */}
          <section className="panel">
            <div className="panel-title">Actions</div>

            {halted ? (
              <div className="proto-action-block">
                <p className="proto-action-desc">
                  The protocol is halted. Once the fix is in, prove it’s safe to resume.
                </p>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!account || busy === "resume"}
                  title={!account ? "Connect a wallet to submit this transaction" : undefined}
                  onClick={() => runAction("resume", "Prove safe", (c) => proveSafe(c, gov, addr, "Fix deployed"))}
                >
                  {busy === "resume" ? "Verifying…" : "Prove safe"}
                </button>
              </div>
            ) : (
              <div className="proto-action-block">
                <p className="proto-action-desc">
                  Report an exploit. Validators independently judge the evidence — if
                  consensus confirms an active exploit, this protocol is halted.
                </p>
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
                  disabled={!account || !claim.trim() || !evidence.trim() || busy === "halt"}
                  title={
                    !account
                      ? "Connect a wallet to submit this transaction"
                      : "Claim and evidence are both required"
                  }
                  onClick={() =>
                    runAction("halt", "Propose halt", (c) =>
                      proposeHalt(c, gov, addr, claim.trim(), evidence.trim()),
                    )
                  }
                >
                  {busy === "halt" ? "Submitting…" : "Submit report & halt"}
                </button>
              </div>
            )}

            <div className="proto-action-note mono">
              Actions are submitted to the Governor at {gov ? shortAddress(gov) : "—"}.
            </div>
          </section>

          {/* Duplicate instance */}
          <section className="panel">
            <div className="panel-title">Duplicate this protocol</div>
            <p className="proto-action-desc">
              Read this protocol’s deployed contract code from the chain, deploy an
              exact copy, and register it with the same Governor. Useful for cloning
              a setup in one click.
            </p>
            <button
              className="btn btn-ghost btn-sm"
              disabled={!account || !isOwner || busy === "duplicate"}
              title={
                !account
                  ? "Connect a wallet to submit this transaction"
                  : !isOwner
                    ? "Only the Governor owner wallet can register duplicated protocols"
                    : undefined
              }
              onClick={onDuplicate}
            >
              {busy === "duplicate" ? "Duplicating…" : "Duplicate instance"}
            </button>
            {account && owner && !isOwner && (
              <p className="wallet-hint">
                Connected wallet is not the Governor owner, so duplication is unavailable.
              </p>
            )}
            {newProtocol && (
              <div className="duplicate-result">
                <span className="mono">New protocol:</span>
                <Link to={`/protocol/${newProtocol}?gov=${gov}&net=${net}`} className="mono ok-text">
                  {shortAddress(newProtocol)} →
                </Link>
              </div>
            )}
            {copies.length > 0 && (
              <div className="copies-list">
                <div className="mono copies-label">Copies of this protocol</div>
                <ul>
                  {copies.map((c) => (
                    <li key={c}>
                      <Link to={`/protocol/${c}?gov=${gov}&net=${net}`} className="mono ok-text">
                        {shortAddress(c)} →
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
          </div>

          {/* Related transactions */}
          <section className="panel">
            <div className="panel-title">Transactions on this protocol</div>
            <TxLog txs={related} network={net} />
          </section>
        </div>
          </>
        )}
      </div>
    </main>
  );
}
