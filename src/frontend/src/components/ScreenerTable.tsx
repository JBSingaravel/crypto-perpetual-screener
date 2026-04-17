import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type { CoinData } from "../hooks/useScreener";
import {
  formatPct,
  formatPrice,
  formatVolume,
  getDisplaySymbol,
} from "../utils/format";

// ─────────────────────────────────────────────
// Score computation (pure — no side effects)
// ─────────────────────────────────────────────

function computeScore(coin: CoinData): number {
  if (coin.signal === "NEUTRAL") return 0;

  // ── RSI component (25 pts) ──────────────────
  let rsiPts = 0;
  const rsi = coin.rsi14;
  if (rsi >= 35 && rsi <= 65) {
    rsiPts = 25 * (1 - Math.abs(rsi - 50) / 15);
  }

  // ── Vol Change % component (25 pts) ────────
  let volPts = 0;
  const vc = coin.volumeChangePct;
  if (vc !== null && vc > 0) {
    if (vc > 500) volPts = 25;
    else if (vc >= 200) volPts = 20;
    else if (vc >= 100) volPts = 10;
  }

  // ── ROC 5m component (25 pts) ──────────────
  let rocPts = 0;
  if (coin.signal === "LONG" && coin.roc5m > 0) rocPts = 25;
  if (coin.signal === "SHORT" && coin.roc5m < 0) rocPts = 25;

  // ── % from SMA component (25 pts) ──────────
  let smaPts = 0;
  const pct = coin.pctFromSma;
  if (coin.signal === "LONG") {
    if (pct >= 0 && pct <= 2) smaPts = 25;
    else if (pct > 2 && pct <= 5) smaPts = 20;
    else if (pct > 5 && pct <= 10) smaPts = 10;
    else if (pct > 10) smaPts = 5;
    // pct < 0 → 0 (contradicts LONG)
  } else {
    // SHORT: below SMA, pct is negative
    const absPct = Math.abs(pct);
    if (absPct >= 0 && absPct <= 2) smaPts = 25;
    else if (absPct > 2 && absPct <= 5) smaPts = 20;
    else if (absPct > 5 && absPct <= 10) smaPts = 10;
    else if (absPct > 10) smaPts = 5;
  }

  return Math.round(rsiPts + volPts + rocPts + smaPts);
}

// ─────────────────────────────────────────────
// Types & sort key
// ─────────────────────────────────────────────

type CoinSortKey = keyof Pick<
  CoinData,
  | "symbol"
  | "price"
  | "priceChange24h"
  | "volatility"
  | "volume24h"
  | "volumeChangePct"
  | "sma200"
  | "pctFromSma"
  | "vwap"
  | "pctFromVwap"
  | "rsi14"
  | "roc5m"
  | "signal"
>;
type SortKey = CoinSortKey | "score" | "rank";
type SortDir = "asc" | "desc";

interface ScreenerTableProps {
  coins: CoinData[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

// ─────────────────────────────────────────────
// Helper sub-components
// ─────────────────────────────────────────────

function SortIcon({
  col,
  sortKey,
  sortDir,
}: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey)
    return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
  return sortDir === "asc" ? (
    <ArrowUp className="w-3 h-3 ml-1 text-primary" />
  ) : (
    <ArrowDown className="w-3 h-3 ml-1 text-primary" />
  );
}

function RsiCell({ value }: { value: number }) {
  if (value === 0)
    return <span className="font-mono text-sm text-muted-foreground">—</span>;
  const color =
    value <= 30
      ? "text-success"
      : value >= 70
        ? "text-destructive"
        : "text-foreground";
  return (
    <span className={`font-mono text-sm font-medium ${color}`}>
      {Math.round(value)}
    </span>
  );
}

function RocCell({ value }: { value: number }) {
  if (value === 0)
    return <span className="font-mono text-sm text-muted-foreground">—</span>;
  const isPos = value > 0;
  const color = isPos ? "text-success" : "text-destructive";
  const sign = isPos ? "+" : "";
  return (
    <span className={`font-mono text-sm font-medium ${color}`}>
      {sign}
      {value.toFixed(2)}%
    </span>
  );
}

function VolatilityCell({ value }: { value: number }) {
  const isHigh = value > 8;
  return (
    <span
      className={`font-mono text-sm font-medium ${isHigh ? "text-amber-400" : "text-muted-foreground"}`}
    >
      {value.toFixed(2)}%
    </span>
  );
}

function VolChangePctCell({ value }: { value: number | null }) {
  if (value === null)
    return <span className="font-mono text-sm text-muted-foreground">—</span>;
  const color = value >= 0 ? "text-success" : "text-destructive";
  const sign = value >= 0 ? "+" : "";
  return (
    <span className={`font-mono text-sm font-medium ${color}`}>
      {sign}
      {value.toFixed(1)}%
    </span>
  );
}

function SignalBadge({ signal }: { signal: CoinData["signal"] }) {
  if (signal === "LONG") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-success/15 text-success border border-success/30">
        <TrendingUp className="w-3 h-3" />
        LONG
      </span>
    );
  }
  if (signal === "SHORT") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-destructive/15 text-destructive border border-destructive/30">
        <TrendingDown className="w-3 h-3" />
        SHORT
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-secondary text-muted-foreground border border-border">
      NEUTRAL
    </span>
  );
}

function RankCell({
  coin,
  rank,
}: {
  coin: CoinData;
  rank: number | null;
}) {
  if (coin.signal === "NEUTRAL" || rank === null) {
    return <span className="font-mono text-sm text-muted-foreground">—</span>;
  }

  const isLong = coin.signal === "LONG";
  const badgeBg = isLong
    ? "bg-success/15 text-success border-success/30"
    : "bg-destructive/15 text-destructive border-destructive/30";

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${badgeBg}`}
    >
      #{rank}
    </span>
  );
}

function ScoreCell({
  coin,
  score,
}: {
  coin: CoinData;
  score: number;
}) {
  if (coin.signal === "NEUTRAL") {
    return <span className="font-mono text-sm text-muted-foreground">—</span>;
  }

  const isLong = coin.signal === "LONG";
  const scoreColor = isLong ? "text-success" : "text-destructive";

  return (
    <span className={`font-mono text-sm font-bold ${scoreColor}`}>{score}</span>
  );
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const SKELETON_COLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function ScreenerTable({
  coins,
  loading,
  error,
  onRetry,
}: ScreenerTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("signal");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  // Compute scores for all coins in the current filtered set
  const scoreMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const coin of coins) {
      map.set(coin.symbol, computeScore(coin));
    }
    return map;
  }, [coins]);

  // Derive ranks: among LONGs sorted by score desc → rank 1 is best
  const longRankMap = useMemo(() => {
    const map = new Map<string, number>();
    const longs = coins
      .filter((c) => c.signal === "LONG")
      .sort(
        (a, b) => (scoreMap.get(b.symbol) ?? 0) - (scoreMap.get(a.symbol) ?? 0),
      );
    longs.forEach((c, i) => map.set(c.symbol, i + 1));
    return map;
  }, [coins, scoreMap]);

  const shortRankMap = useMemo(() => {
    const map = new Map<string, number>();
    const shorts = coins
      .filter((c) => c.signal === "SHORT")
      .sort(
        (a, b) => (scoreMap.get(b.symbol) ?? 0) - (scoreMap.get(a.symbol) ?? 0),
      );
    shorts.forEach((c, i) => map.set(c.symbol, i + 1));
    return map;
  }, [coins, scoreMap]);

  const getRank = useCallback(
    (coin: CoinData): number | null => {
      if (coin.signal === "LONG") return longRankMap.get(coin.symbol) ?? null;
      if (coin.signal === "SHORT") return shortRankMap.get(coin.symbol) ?? null;
      return null;
    },
    [longRankMap, shortRankMap],
  );

  const sorted = useMemo(() => {
    return [...coins].sort((a, b) => {
      if (sortKey === "signal") {
        const rank = { LONG: 2, SHORT: 1, NEUTRAL: 0 };
        const aVal = rank[a.signal];
        const bVal = rank[b.signal];
        if (aVal !== bVal)
          return sortDir === "desc" ? bVal - aVal : aVal - bVal;
        return sortDir === "desc"
          ? b.pctFromSma - a.pctFromSma
          : a.pctFromSma - b.pctFromSma;
      }
      if (sortKey === "score") {
        const aScore = scoreMap.get(a.symbol) ?? 0;
        const bScore = scoreMap.get(b.symbol) ?? 0;
        if (aScore !== bScore)
          return sortDir === "desc" ? bScore - aScore : aScore - bScore;
        // Tie-break: LONG > SHORT > NEUTRAL
        const signalRank = { LONG: 2, SHORT: 1, NEUTRAL: 0 };
        return signalRank[b.signal] - signalRank[a.signal];
      }
      if (sortKey === "rank") {
        const aRank = getRank(a) ?? Number.POSITIVE_INFINITY;
        const bRank = getRank(b) ?? Number.POSITIVE_INFINITY;
        if (aRank !== bRank)
          return sortDir === "asc" ? aRank - bRank : bRank - aRank;
        return a.signal.localeCompare(b.signal);
      }
      // Handle nullable volumeChangePct
      if (sortKey === "volumeChangePct") {
        const aVal = a.volumeChangePct ?? Number.NEGATIVE_INFINITY;
        const bVal = b.volumeChangePct ?? Number.NEGATIVE_INFINITY;
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aVal = a[sortKey as CoinSortKey];
      const bVal = b[sortKey as CoinSortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [coins, sortKey, sortDir, scoreMap, getRank]);

  function handleRowClick(coin: CoinData) {
    navigator.clipboard.writeText(coin.symbol).then(() => {
      toast.success(`Copied ${coin.symbol} to clipboard`, {
        description: `Signal: ${coin.signal} · Price: $${formatPrice(coin.price)} · RSI: ${Math.round(coin.rsi14)}`,
      });
    });
  }

  // ── Column header helpers ──────────────────

  const ColHead = ({ col, label }: { col: SortKey; label: string }) => (
    <th
      scope="col"
      className="sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap text-xs text-muted-foreground hover:text-foreground transition-colors bg-card shadow-[0_1px_0_0_hsl(var(--border))] h-10 px-2 text-left align-middle font-medium"
      onClick={() => handleSort(col)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSort(col)}
      aria-sort={
        sortKey === col
          ? sortDir === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <div className="flex items-center">
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </div>
    </th>
  );

  const ScoreColHead = () => (
    <th
      scope="col"
      className="sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap text-xs text-muted-foreground hover:text-foreground transition-colors bg-card shadow-[0_1px_0_0_hsl(var(--border))] h-10 px-2 text-left align-middle font-medium"
      onClick={() => handleSort("score")}
      onKeyDown={(e) =>
        (e.key === "Enter" || e.key === " ") && handleSort("score")
      }
      aria-sort={
        sortKey === "score"
          ? sortDir === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <div className="flex items-center">
        Score
        <SortIcon col="score" sortKey={sortKey} sortDir={sortDir} />
      </div>
    </th>
  );

  // ── Error state ────────────────────────────

  if (error) {
    return (
      <div
        data-ocid="screener.error_state"
        className="bg-card border border-border rounded-xl p-12 text-center shadow-card"
      >
        <div className="text-4xl mb-3">⚠️</div>
        <div className="text-foreground font-semibold mb-1">
          Failed to load data
        </div>
        <div className="text-muted-foreground text-sm mb-4">{error}</div>
        <button
          type="button"
          data-ocid="screener.retry.button"
          onClick={onRetry}
          className="px-4 py-2 bg-primary/15 text-primary rounded-lg text-sm hover:bg-primary/25 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!loading && coins.length === 0) {
    return (
      <div
        data-ocid="screener.empty_state"
        className="bg-card border border-border rounded-xl p-12 text-center shadow-card"
      >
        <div className="text-4xl mb-3">🔍</div>
        <div className="text-foreground font-semibold mb-1">No coins found</div>
        <div className="text-muted-foreground text-sm">
          Try adjusting your filters or refreshing
        </div>
      </div>
    );
  }

  // ── Table ──────────────────────────────────

  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      <div className="overflow-auto max-h-[calc(100vh-18rem)]">
        <table className="w-full caption-bottom text-sm">
          <thead className="[&_tr]:border-b">
            <tr className="border-b border-border hover:bg-transparent">
              <ColHead col="symbol" label="Symbol" />
              <ColHead col="rank" label="Rank" />
              <ColHead col="price" label="Price" />
              <ColHead col="priceChange24h" label="24h %" />
              <ColHead col="volatility" label="Volatility" />
              <ColHead col="volume24h" label="Vol 24h" />
              <ColHead col="volumeChangePct" label="Vol Chg%" />
              <ColHead col="sma200" label="SMA200" />
              <ColHead col="pctFromSma" label="% SMA" />
              <ColHead col="vwap" label="VWAP" />
              <ColHead col="pctFromVwap" label="% VWAP" />
              <ColHead col="rsi14" label="RSI(14)" />
              <ColHead col="roc5m" label="ROC 5m" />
              <ColHead col="signal" label="Signal" />
              <ScoreColHead />
              <th className="sticky top-0 z-10 text-xs text-muted-foreground bg-card shadow-[0_1px_0_0_hsl(var(--border))] h-10 px-2 text-left align-middle font-medium whitespace-nowrap">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {loading && sorted.length === 0
              ? SKELETON_ROWS.map((rowIdx) => (
                  <tr key={rowIdx} className="border-b border-border/50">
                    {SKELETON_COLS.map((colIdx) => (
                      <td
                        key={colIdx}
                        className="p-2 align-middle whitespace-nowrap"
                      >
                        <div className="h-4 bg-secondary/60 rounded animate-pulse w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((coin, idx) => {
                  const score = scoreMap.get(coin.symbol) ?? 0;
                  const rank = getRank(coin);
                  return (
                    <tr
                      key={coin.symbol}
                      data-ocid={`screener.item.${idx + 1}`}
                      className="border-b border-border/50 cursor-pointer hover:bg-secondary/40 transition-colors group"
                      onClick={() => handleRowClick(coin)}
                      onKeyDown={(e) =>
                        (e.key === "Enter" || e.key === " ") &&
                        handleRowClick(coin)
                      }
                      tabIndex={0}
                    >
                      {/* Symbol */}
                      <td className="p-2 align-middle whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">
                            {getDisplaySymbol(coin.symbol).slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-semibold text-sm text-foreground">
                              {getDisplaySymbol(coin.symbol)}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Rank */}
                      <td
                        className="p-2 align-middle whitespace-nowrap"
                        data-ocid={`screener.rank.${idx + 1}`}
                      >
                        <RankCell coin={coin} rank={rank} />
                      </td>

                      {/* Price */}
                      <td className="p-2 align-middle whitespace-nowrap font-mono text-sm font-medium text-foreground">
                        ${formatPrice(coin.price)}
                      </td>

                      {/* 24h Change */}
                      <td className="p-2 align-middle whitespace-nowrap">
                        <span
                          className={`font-mono text-sm font-medium ${coin.priceChange24h >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {formatPct(coin.priceChange24h)}
                        </span>
                      </td>

                      {/* Volatility */}
                      <td className="p-2 align-middle whitespace-nowrap">
                        <VolatilityCell value={coin.volatility} />
                      </td>

                      {/* Volume */}
                      <td className="p-2 align-middle whitespace-nowrap font-mono text-sm text-muted-foreground">
                        ${formatVolume(coin.volume24h)}
                      </td>

                      {/* Vol Change % */}
                      <td className="p-2 align-middle whitespace-nowrap">
                        <VolChangePctCell value={coin.volumeChangePct} />
                      </td>

                      {/* SMA200 */}
                      <td className="p-2 align-middle whitespace-nowrap font-mono text-sm text-muted-foreground">
                        ${formatPrice(coin.sma200)}
                      </td>

                      {/* % From SMA */}
                      <td className="p-2 align-middle whitespace-nowrap">
                        <span
                          className={`font-mono text-sm font-medium ${coin.pctFromSma >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {formatPct(coin.pctFromSma)}
                        </span>
                      </td>

                      {/* VWAP */}
                      <td className="p-2 align-middle whitespace-nowrap font-mono text-sm text-muted-foreground">
                        ${formatPrice(coin.vwap)}
                      </td>

                      {/* % From VWAP */}
                      <td className="p-2 align-middle whitespace-nowrap">
                        <span
                          className={`font-mono text-sm font-medium ${coin.pctFromVwap >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          {formatPct(coin.pctFromVwap)}
                        </span>
                      </td>

                      {/* RSI(14) */}
                      <td className="p-2 align-middle whitespace-nowrap">
                        <RsiCell value={coin.rsi14} />
                      </td>

                      {/* ROC 5m */}
                      <td className="p-2 align-middle whitespace-nowrap">
                        <RocCell value={coin.roc5m} />
                      </td>

                      {/* Signal */}
                      <td className="p-2 align-middle whitespace-nowrap">
                        <SignalBadge signal={coin.signal} />
                      </td>

                      {/* Score */}
                      <td
                        className="p-2 align-middle whitespace-nowrap"
                        data-ocid={`screener.score.${idx + 1}`}
                      >
                        <ScoreCell coin={coin} score={score} />
                      </td>

                      {/* Action */}
                      <td className="p-2 align-middle whitespace-nowrap">
                        <button
                          type="button"
                          data-ocid={`screener.copy.button.${idx + 1}`}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors opacity-0 group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(coin);
                          }}
                          title="Copy symbol"
                          aria-label="Copy symbol"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
