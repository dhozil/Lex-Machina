const KEY = "ap_copies";
const MAX_PER_SOURCE = 20;

/** Map: source protocol address -> list of duplicated copy addresses. */
export function getCopies(source: string): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    const list = parsed[source];
    return Array.isArray(list) ? list.slice(0, MAX_PER_SOURCE) : [];
  } catch {
    return [];
  }
}

export function addCopy(source: string, copy: string) {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = (raw ? JSON.parse(raw) : {}) as Record<string, string[]>;
    const list = Array.isArray(parsed[source]) ? parsed[source] : [];
    if (!list.includes(copy)) {
      list.unshift(copy);
    }
    parsed[source] = list.slice(0, MAX_PER_SOURCE);
    localStorage.setItem(KEY, JSON.stringify(parsed));
  } catch {
    /* ignore storage errors */
  }
}
