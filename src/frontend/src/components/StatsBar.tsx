import { BarChart2, Coins, TrendingDown, TrendingUp } from "lucide-react";
import type { CoinData } from "../hooks/useScreener";

interface StatsBarProps {
  coins: CoinData[];
  totalScanned: number;
}

export function StatsBar({ coins, totalScanned }: StatsBarProps) {
  const longCount = coins.filter((c) => c.signal === "LONG").length;
  const shortCount = coins.filter((c) => c.signal === "SHORT").length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-card border border-border rounded-xl p-4 shadow-card">
        <div className="flex items-center gap-2 mb-1">
          <BarChart2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Total Scanned</span>
        </div>
        <div className="text-2xl font-bold text-foreground font-mono">
          {totalScanned}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          perpetual pairs
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-card">
        <div className="flex items-center gap-2 mb-1">
          <Coins className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Coins &lt; $4</span>
        </div>
        <div className="text-2xl font-bold text-foreground font-mono">
          {coins.length}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          matching price filter
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-card">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4 text-success" />
          <span className="text-xs text-muted-foreground">Long Signals</span>
        </div>
        <div className="text-2xl font-bold text-success font-mono">
          {longCount}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          above SMA200 &amp; VWAP
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-card">
        <div className="flex items-center gap-2 mb-1">
          <TrendingDown className="w-4 h-4 text-destructive" />
          <span className="text-xs text-muted-foreground">Short Signals</span>
        </div>
        <div className="text-2xl font-bold text-destructive font-mono">
          {shortCount}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          below SMA200 &amp; VWAP
        </div>
      </div>
    </div>
  );
}
