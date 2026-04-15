import { Toaster } from "@/components/ui/sonner";
import { useEffect, useRef, useState } from "react";
import { FilterBar } from "./components/FilterBar";
import { Header } from "./components/Header";
import { ScreenerTable } from "./components/ScreenerTable";
import { StatsBar } from "./components/StatsBar";
import { useScreener } from "./hooks/useScreener";
import type { CoinData } from "./hooks/useScreener";
import { formatTime } from "./utils/format";

const currentYear = new Date().getFullYear();

export default function App() {
  const { coins, loading, error, progress, lastUpdated, refresh } =
    useScreener();

  const [search, setSearch] = useState("");
  const [signalFilter, setSignalFilter] = useState<"all" | "long" | "short">(
    "all",
  );
  const [minVolume, setMinVolume] = useState(0);
  const [minRsi, setMinRsi] = useState<number | null>(null);
  const [maxRsi, setMaxRsi] = useState<number | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(60);
  const [countdown, setCountdown] = useState(60);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh timer
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (!autoRefresh) {
      setCountdown(refreshInterval);
      return;
    }

    setCountdown(refreshInterval);
    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          refresh();
          return refreshInterval;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefresh, refreshInterval, refresh]);

  // Reset countdown when refresh finishes
  useEffect(() => {
    if (!loading) setCountdown(refreshInterval);
  }, [loading, refreshInterval]);

  const filteredCoins: CoinData[] = coins.filter((c) => {
    const matchSearch = c.symbol.toLowerCase().includes(search.toLowerCase());
    const matchSignal =
      signalFilter === "all" ||
      (signalFilter === "long" && c.signal === "LONG") ||
      (signalFilter === "short" && c.signal === "SHORT");
    const matchVolume = minVolume <= 0 || c.volume24h >= minVolume;
    const matchRsiMin = minRsi === null || c.rsi14 >= minRsi;
    const matchRsiMax = maxRsi === null || c.rsi14 <= maxRsi;
    return (
      matchSearch && matchSignal && matchVolume && matchRsiMin && matchRsiMax
    );
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 p-4 md:p-6 space-y-4 max-w-screen-2xl mx-auto w-full">
        {/* Page title */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              Perpetual Screener
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Binance USDT Perp · Price &lt; $4 · SMA200 + VWAP + RSI(14) · 3m
              timeframe
            </p>
          </div>
          {lastUpdated && (
            <div className="text-xs text-muted-foreground">
              Last updated:{" "}
              <span className="text-foreground font-medium">
                {formatTime(lastUpdated)} IST
              </span>
            </div>
          )}
        </div>

        {/* Stats */}
        <StatsBar coins={filteredCoins} totalScanned={coins.length} />

        {/* Filters */}
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          signalFilter={signalFilter}
          onSignalFilterChange={setSignalFilter}
          minVolume={minVolume}
          onMinVolumeChange={setMinVolume}
          minRsi={minRsi}
          maxRsi={maxRsi}
          onMinRsiChange={setMinRsi}
          onMaxRsiChange={setMaxRsi}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          refreshInterval={refreshInterval}
          onRefreshIntervalChange={setRefreshInterval}
          onRefresh={refresh}
          loading={loading}
          countdown={countdown}
          progress={progress}
        />

        {/* Table */}
        <ScreenerTable
          coins={filteredCoins}
          loading={loading}
          error={error}
          onRetry={refresh}
        />

        {/* Session info banner */}
        <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-muted-foreground">
              IST Session: <span className="text-foreground">05:30 AM</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">
              UTC Anchor: <span className="text-foreground">00:00 UTC</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">
              VWAP resets daily at 05:30 AM IST
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">
              LONG: Price &gt; SMA200{" "}
              <span className="text-success font-medium">&amp;&amp;</span> Price
              &gt; VWAP → <span className="text-success font-bold">LONG</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">
              SHORT: Price &lt; SMA200{" "}
              <span className="text-destructive font-medium">&amp;&amp;</span>{" "}
              Price &lt; VWAP →{" "}
              <span className="text-destructive font-bold">SHORT</span>
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 px-6 text-center text-xs text-muted-foreground">
        © {currentYear}. Built with love using{" "}
        <a
          href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          caffeine.ai
        </a>
      </footer>

      <Toaster richColors position="bottom-right" />
    </div>
  );
}
