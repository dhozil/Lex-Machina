export function isAddressHex(value?: string | null): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function shortAddress(addr?: string, prefix = 6, suffix = 4): string {
  if (!addr) return "—";
  if (addr.length <= prefix + suffix + 2) return addr;
  return `${addr.slice(0, prefix + 2)}…${addr.slice(-suffix)}`;
}

export function shortHash(hash?: string): string {
  return shortAddress(hash, 8, 6);
}

export function formatNumber(n: number | string | undefined): string {
  if (n === undefined || n === null) return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString("en-US");
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
