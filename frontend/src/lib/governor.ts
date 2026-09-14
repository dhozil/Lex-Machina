import {
  TransactionStatus,
  type Address,
  type TransactionHash,
} from "genlayer-js/types";
import type { makeClient } from "./client";

export type Client = ReturnType<typeof makeClient>;

type AddressHex = Address;

export interface GovernanceState {
  owner: string;
  rules: string;
  rule_version: number;
  risk_threshold: number;
  tune_count: number;
  exploit_count: number;
  protocol_count: number;
}

export interface ProtocolState {
  paused: boolean;
  total_deposits: number;
  deposit_count: number;
  last_activity: number;
  governor: string;
}

export type TxStatus = "pending" | "accepted" | "finalized" | "error";

export interface TxRecord {
  id: string;
  label: string;
  hash: string;
  status: TxStatus;
  executionResult?: string;
  error?: string;
  createdAt: number;
  network: string;
  /** Optional reference to a governed protocol this transaction acts on. */
  ref?: string;
}

// ---- reads ----

// Circuit breaker: after a rate-limit response, fail fast locally for a
// cooldown period instead of sending requests that deepen the hole.
let rpcHaltedUntil = 0;
const COOLDOWN_MS = 5 * 60 * 1000;

export function rpcCooldownRemainingMs(): number {
  return Math.max(0, rpcHaltedUntil - Date.now());
}

/** Manual retry consent: an explicit user action clears the cooldown. */
export function resetRpcBreaker(): void {
  rpcHaltedUntil = 0;
}

function throwIfHalted(): void {
  const remaining = rpcCooldownRemainingMs();
  if (remaining > 0) {
    throw new Error(
      `Rate-limit cooldown active (${Math.ceil(remaining / 1000)}s left). No request was sent.`,
    );
  }
}

function tripBreakerOnRateLimit(e: unknown): void {
  const msg = e instanceof Error ? e.message : "";
  if (/rate limit|429|too many requests/i.test(msg)) {
    rpcHaltedUntil = Date.now() + COOLDOWN_MS;
  }
}

/** Retry a read against transient transport failures ("Failed to fetch").
 * Rate-limit (429) responses are never retried: Studionet enforces 30
 * requests/minute on top of the hourly quota, so retrying only deepens
 * the hole. The caller trips the circuit breaker instead. */
async function readWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  throwIfHalted();
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      tripBreakerOnRateLimit(e);
      const msg = e instanceof Error ? e.message : "";
      if (/rate limit|429|too many requests/i.test(msg)) {
        throw e;
      }
      if (!(e instanceof Error) || !/failed to fetch|networkerror|load failed|timeout/i.test(msg)) {
        throw e;
      }
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw last;
}

export async function readGovernanceState(client: Client, governor: string): Promise<GovernanceState> {
  return readWithRetry(
    () =>
      client.readContract({
        address: governor as AddressHex,
        functionName: "get_governance_state",
        args: [],
      }) as unknown as Promise<GovernanceState>,
  );
}

export async function readProtocols(client: Client, governor: string): Promise<string[]> {
  return readWithRetry(
    () =>
      client.readContract({
        address: governor as AddressHex,
        functionName: "get_protocols",
        args: [],
      }) as Promise<string[]>,
  );
}

export async function readProtocolState(
  client: Client,
  governor: string,
  protocol: string,
): Promise<ProtocolState> {
  return readWithRetry(
    () =>
      client.readContract({
        address: governor as AddressHex,
        functionName: "get_protocol_state",
        args: [protocol],
      }) as unknown as Promise<ProtocolState>,
  );
}

export async function isHalted(client: Client, governor: string, protocol: string): Promise<boolean> {
  return readWithRetry(
    () =>
      client.readContract({
        address: governor as AddressHex,
        functionName: "is_halted",
        args: [protocol],
      }) as Promise<boolean>,
  );
}

/** On-chain label from register_protocol; "" when unregistered. */
export async function readProtocolLabel(
  client: Client,
  governor: string,
  protocol: string,
): Promise<string> {
  return readWithRetry(
    () =>
      client.readContract({
        address: governor as AddressHex,
        functionName: "get_protocol_label",
        args: [protocol],
      }) as Promise<string>,
  );
}

/** On-chain description; "" when unset. Old governors lack the method. */
export async function readProtocolDescription(
  client: Client,
  governor: string,
  protocol: string,
): Promise<string> {
  return readWithRetry(
    () =>
      client.readContract({
        address: governor as AddressHex,
        functionName: "get_protocol_description",
        args: [protocol],
      }) as Promise<string>,
  );
}

// ---- writes ----

async function submit(
  client: Client,
  address: string,
  functionName: string,
  args: (string | number)[],
): Promise<string> {
  throwIfHalted();
  try {
    const hash = await client.writeContract({
      address: address as AddressHex,
      functionName,
      args,
      value: 0n,
    });
    return hash as string;
  } catch (e) {
    tripBreakerOnRateLimit(e);
    throw e;
  }
}

export const registerProtocol = (client: Client, gov: string, protocol: string, label: string) =>
  submit(client, gov, "register_protocol", [protocol, label]);

export const proposeHalt = (client: Client, gov: string, protocol: string, claim: string, evidence: string) =>
  submit(client, gov, "propose_halt", [protocol, claim, evidence]);
export const proveSafe = (client: Client, gov: string, protocol: string, reason: string) =>
  submit(client, gov, "prove_safe", [protocol, reason]);

export const setProtocolDescription = (client: Client, gov: string, protocol: string, description: string) =>
  submit(client, gov, "set_protocol_description", [protocol, description]);

// ---- governor profile & listing ----

export interface GovernorProfile {
  name: string;
  description: string;
  owner: string;
}

export async function readGovernorProfile(client: Client, governor: string): Promise<GovernorProfile> {
  return readWithRetry(
    () =>
      client.readContract({
        address: governor as AddressHex,
        functionName: "get_governor_profile",
        args: [],
      }) as unknown as Promise<GovernorProfile>,
  );
}

export const setGovernorProfile = (client: Client, gov: string, name: string, description: string) =>
  submit(client, gov, "set_governor_profile", [name, description]);

export interface ListingRequest {
  address: string;
  label: string;
  description: string;
  requester: string;
  status: string;
}

export async function readListingRequests(client: Client, governor: string): Promise<ListingRequest[]> {
  return readWithRetry(
    () =>
      client.readContract({
        address: governor as AddressHex,
        functionName: "get_listing_requests",
        args: [],
      }) as unknown as Promise<ListingRequest[]>,
  );
}

export const requestListing = (
  client: Client,
  gov: string,
  protocol: string,
  label: string,
  description: string,
) => submit(client, gov, "request_listing", [protocol, label, description]);

export const approveListing = (client: Client, gov: string, protocol: string) =>
  submit(client, gov, "approve_listing", [protocol]);

export const rejectListing = (client: Client, gov: string, protocol: string) =>
  submit(client, gov, "reject_listing", [protocol]);

export const cancelListing = (client: Client, gov: string, protocol: string) =>
  submit(client, gov, "cancel_listing", [protocol]);

// ---- curator ----

export interface CuratorState {
  owner: string;
  min_score: number;
  review_count: number;
}

export interface GovernorReview {
  address: string;
  score: number;
  listed: boolean;
  reasoning: string;
}

export interface ListedGovernor {
  address: string;
  score: number;
  name: string;
  description: string;
  protocol_count: number;
  risk_threshold: number;
}

export async function readCuratorState(client: Client, curator: string): Promise<CuratorState> {
  return readWithRetry(
    () =>
      client.readContract({
        address: curator as AddressHex,
        functionName: "get_curator_state",
        args: [],
      }) as unknown as Promise<CuratorState>,
  );
}

export async function readReview(
  client: Client,
  curator: string,
  governor: string,
): Promise<GovernorReview> {
  return readWithRetry(
    () =>
      client.readContract({
        address: curator as AddressHex,
        functionName: "get_review",
        args: [governor],
      }) as unknown as Promise<GovernorReview>,
  );
}

export async function readListedGovernors(
  client: Client,
  curator: string,
): Promise<ListedGovernor[]> {
  return readWithRetry(
    () =>
      client.readContract({
        address: curator as AddressHex,
        functionName: "get_listed_governors",
        args: [],
      }) as unknown as Promise<ListedGovernor[]>,
  );
}

export const submitGovernorForReview = (client: Client, curator: string, governor: string) =>
  submit(client, curator, "submit_governor", [governor]);

export const requestGovernorReReview = (client: Client, curator: string, governor: string) =>
  submit(client, curator, "request_re_review", [governor]);

export const monitorAndTune = (client: Client, gov: string) =>
  submit(client, gov, "monitor_and_tune", []);

/**
 * Duplicate a governed protocol: deploy an exact copy of the ProtocolVault
 * contract and register it with the Governor.
 */
export async function duplicateProtocol(
  client: Client,
  gov: string,
  source: string,
  label: string,
): Promise<{ deployHash: string; newAddress: string; registerHash: string }> {
  throwIfHalted();
  const code = await client.getContractCode(source as AddressHex);
  if (!code) {
    throw new Error("Could not read the source protocol’s onchain contract code.");
  }
  const deployHash = (await client.deployContract({
    code,
    args: [gov, 0],
  })) as string;
  const deployReceipt = await client.waitForTransactionReceipt({
    hash: deployHash as TransactionHash,
    status: TransactionStatus.FINALIZED,
    interval: 5000,
    retries: 144,
  });
  const data = deployReceipt as unknown as {
    txDataDecoded?: { contractAddress?: string };
    data?: { contract_address?: string };
    to_address?: string;
  };
  const newAddress =
    data.txDataDecoded?.contractAddress ?? data.data?.contract_address ?? data.to_address;
  if (!newAddress) {
    throw new Error("Could not determine the duplicated protocol address from the receipt.");
  }
  const registerHash = await registerProtocol(client, gov, newAddress, label);
  return { deployHash, newAddress, registerHash };
}

// ---- tx inspection ----

export async function waitForTx(client: Client, hash: string): Promise<{
  status: TxStatus;
  executionResult?: string;
  error?: string;
}> {
  try {
    throwIfHalted();
    const receipt = await client.waitForTransactionReceipt({
      hash: hash as TransactionHash,
      status: TransactionStatus.ACCEPTED,
      interval: 5000,
      retries: 144,
    });
    const raw = receipt.consensus_data?.leader_receipt as unknown;
    const leader = (Array.isArray(raw) ? raw[0] : raw) as
      | { execution_result?: string; error?: string | null }
      | undefined;
    const execResult = leader?.execution_result ?? "";
    if (execResult === "SUCCESS") {
      return { status: "finalized", executionResult: execResult };
    }
    if (execResult === "ERROR") {
      return { status: "error", executionResult: execResult, error: leader?.error ?? "Execution failed" };
    }
    return { status: "accepted", executionResult: execResult };
  } catch (e) {
    tripBreakerOnRateLimit(e);
    return { status: "error", error: (e as Error).message };
  }
}

export interface TxDetail {
  hash: string;
  status: TxStatus;
  executionResult?: string;
  error?: string;
  gasUsed?: number;
  votes?: Record<string, string>;
  validatorCount?: number;
  triggered: string[];
  stdout?: string;
  stderr?: string;
}

export async function getTxDetail(client: Client, hash: string): Promise<TxDetail> {
  throwIfHalted();
  let tx;
  try {
    tx = await client.getTransaction({ hash: hash as TransactionHash });
  } catch (e) {
    tripBreakerOnRateLimit(e);
    throw e;
  }
  const consensus = tx.consensus_data as unknown as
    | {
        leader_receipt?:
          | Array<{
              execution_result?: string;
              error?: string | null;
              gas_used?: number;
              stdout?: string;
              stderr?: string;
            }>
          | {
              execution_result?: string;
              error?: string | null;
              gas_used?: number;
              stdout?: string;
              stderr?: string;
            };
        validators?: unknown;
        votes?: Record<string, string>;
      }
    | undefined;

  const rawLeader = consensus?.leader_receipt as unknown;
  const leader = (Array.isArray(rawLeader) ? rawLeader[0] : rawLeader) as
    | { execution_result?: string; error?: string | null; gas_used?: number; stdout?: string; stderr?: string }
    | undefined;

  let triggered: string[] = [];
  try {
    triggered = (await client.getTriggeredTransactionIds({
      hash: hash as TransactionHash,
    })) as unknown as string[];
  } catch {
    triggered = [];
  }

  const execResult = leader?.execution_result;
  let status: TxStatus = "accepted";
  if (execResult === "SUCCESS") status = "finalized";
  else if (execResult === "ERROR") status = "error";

  return {
    hash,
    status,
    executionResult: execResult,
    error: leader?.error ?? undefined,
    gasUsed: leader?.gas_used,
    votes: consensus?.votes,
    validatorCount: consensus?.validators ? Object.keys(consensus.validators).length : undefined,
    triggered,
    stdout: leader?.stdout,
    stderr: leader?.stderr,
  };
}
