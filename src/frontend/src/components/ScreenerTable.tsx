import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { CoinData } from "../hooks/useScreener";
import {
  formatPct,
  formatPrice,
  formatVolume,
  getDisplaySymbol,
} from "../utils/format";

type SortKey = keyof Pick<
  CoinData,
  | "symbol"
  | "price"
  | "priceChange24h"
  | "volume24h"
  | "sma200"
  | "pctFromSma"
  | "vwap"
  | "pctFromVwap"
  | "rsi14"
  | "signal"
>;
type SortDir = "asc" | "desc";

interface ScreenerTableProps {
  coins: CoinData[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

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

const SKELETON_COLS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6, 7];

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
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [coins, sortKey, sortDir]);

  function handleRowClick(coin: CoinData) {
    navigator.clipboard.writeText(coin.symbol).then(() => {
      toast.success(`Copied ${coin.symbol} to clipboard`, {
        description: `Signal: ${coin.signal} · Price: $${formatPrice(coin.price)} · RSI: ${Math.round(coin.rsi14)}`,
      });
    });
  }

  const ColHead = ({ col, label }: { col: SortKey; label: string }) => (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap text-xs text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => handleSort(col)}
    >
      <div className="flex items-center">
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </div>
    </TableHead>
  );

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

  return (
    <div className="bg-card border border-border rounded-xl shadow-card overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <ColHead col="symbol" label="Pair" />
              <ColHead col="price" label="Price" />
              <ColHead col="priceChange24h" label="24h %" />
              <ColHead col="volume24h" label="Vol 24h" />
              <ColHead col="sma200" label="SMA200" />
              <ColHead col="pctFromSma" label="% SMA" />
              <ColHead col="vwap" label="VWAP" />
              <ColHead col="pctFromVwap" label="% VWAP" />
              <ColHead col="rsi14" label="RSI(14)" />
              <ColHead col="signal" label="Signal" />
              <TableHead className="text-xs text-muted-foreground">
                Action
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && sorted.length === 0
              ? SKELETON_ROWS.map((rowIdx) => (
                  <TableRow key={rowIdx} className="border-b border-border/50">
                    {SKELETON_COLS.map((colIdx) => (
                      <TableCell key={colIdx}>
                        <div className="h-4 bg-secondary/60 rounded animate-pulse w-3/4" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : sorted.map((coin, idx) => (
                  <TableRow
                    key={coin.symbol}
                    data-ocid={`screener.item.${idx + 1}`}
                    className="border-b border-border/50 cursor-pointer hover:bg-secondary/40 transition-colors group"
                    onClick={() => handleRowClick(coin)}
                  >
                    {/* Pair */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">
                          {getDisplaySymbol(coin.symbol).slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-foreground">
                            {getDisplaySymbol(coin.symbol)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            USDT·PERP
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Price */}
                    <TableCell className="font-mono text-sm font-medium text-foreground">
                      ${formatPrice(coin.price)}
                    </TableCell>

                    {/* 24h Change */}
                    <TableCell>
                      <span
                        className={`font-mono text-sm font-medium ${coin.priceChange24h >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {formatPct(coin.priceChange24h)}
                      </span>
                    </TableCell>

                    {/* Volume */}
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      ${formatVolume(coin.volume24h)}
                    </TableCell>

                    {/* SMA200 */}
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      ${formatPrice(coin.sma200)}
                    </TableCell>

                    {/* % From SMA */}
                    <TableCell>
                      <span
                        className={`font-mono text-sm font-medium ${coin.pctFromSma >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {formatPct(coin.pctFromSma)}
                      </span>
                    </TableCell>

                    {/* VWAP */}
                    <TableCell className="font-mono text-sm text-muted-foreground">
                      ${formatPrice(coin.vwap)}
                    </TableCell>

                    {/* % From VWAP */}
                    <TableCell>
                      <span
                        className={`font-mono text-sm font-medium ${coin.pctFromVwap >= 0 ? "text-success" : "text-destructive"}`}
                      >
                        {formatPct(coin.pctFromVwap)}
                      </span>
                    </TableCell>

                    {/* RSI(14) */}
                    <TableCell>
                      <RsiCell value={coin.rsi14} />
                    </TableCell>

                    {/* Signal */}
                    <TableCell>
                      <SignalBadge signal={coin.signal} />
                    </TableCell>

                    {/* Action */}
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
