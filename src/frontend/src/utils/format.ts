export function formatPrice(price: number): string {
  if (price < 0.001) return price.toFixed(6);
  if (price < 0.1) return price.toFixed(4);
  if (price < 10) return price.toFixed(3);
  return price.toFixed(2);
}

export function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(2)}B`;
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(2)}M`;
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(2)}K`;
  return vol.toFixed(0);
}

export function formatPct(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Returns "BTCUSDT.P" format from "BTCUSDT" */
export function getDisplaySymbol(symbol: string): string {
  // Remove USDT suffix and append .P for perpetual convention
  return `${symbol.replace(/USDT$/, "")}USDT.P`;
}
