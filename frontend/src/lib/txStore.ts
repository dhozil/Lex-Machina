import type { TxRecord } from "./governor";

const TX_STORAGE_KEY = "ap_txs";
const MAX = 50;

export function loadStoredTxs(): TxRecord[] {
  try {
    const raw = localStorage.getItem(TX_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveStoredTxs(txs: TxRecord[]) {
  try {
    localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(txs.slice(0, MAX)));
  } catch {
    /* ignore storage quota errors */
  }
}
