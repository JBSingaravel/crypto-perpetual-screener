import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronUp, Clock, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AdvancedFilters } from "./components/FilterBar";
import { FilterBar } from "./components/FilterBar";
import type { ExchangeId } from "./components/Header";
import { Header } from "./components/Header";
import { ScreenerTable } from "./components/ScreenerTable";
import { StatsBar } from "./components/StatsBar";
import { useScreener } from "./hooks/useScreener";
import type { CoinData } from "./hooks/useScreener";
import { formatTime } from "./utils/format";

const currentYear = new Date().getFullYear();

const DEFAULT_ADVANCED_FILTERS: AdvancedFilters = {
  volatilityEnabled: false,
  vol24hEnabled: false,
  volChangePctEnabled: false,
  volChangePctMin: 100,
  volChangePctMax: 15000,
  quoteUsdtEnabled: true,
  perpetualEnabled: true,
  rocPositiveEnabled: false,
  rocNegativeEnabled: false,
};

export default function App() {
  const [selectedExchange, setSelectedExchange] =
    useState<ExchangeId>("binance");

  const {
    coins: allCoins,
    loading,
    error,
    progress,
    lastUpdated,
    refresh,
  } = useScreener(selectedExchange);

  function handleExchangeChange(exchange: ExchangeId) {
    setSelectedExchange(exchange);
    // Reset coin list and trigger a fresh scan on exchange change
    setTimeout(() => refresh(), 0);
  }

  const [search, setSearch] = useState("");
  const [signalFilter, setSignalFilter] = useState<"all" | "long" | "short">(
    "all",
  );
  // const [minVolume, setMinVolume] = useState(0); // MIN VOL — commented out; restore when needed
  const [minRsi, setMinRsi] = useState<number | null>(null);
  const [maxRsi, setMaxRsi] = useState<number | null>(null);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>(
    DEFAULT_ADVANCED_FILTERS,
  );
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(60);
  const [countdown, setCountdown] = useState(60);
  const [statsBarVisible, setStatsBarVisible] = useState(true);
  const [advancedFiltersVisible, setAdvancedFiltersVisible] = useState(true);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [lastScanDuration, setLastScanDuration] = useState<number | null>(null);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scanStartRef = useRef<number | null>(null);

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

  // Scan timer: start when loading begins, stop when loading ends
  useEffect(() => {
    if (loading) {
      // New scan started — reset elapsed and record start time
      setElapsedTime(0);
      scanStartRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setElapsedTime(
          Math.floor(
            (Date.now() - (scanStartRef.current ?? Date.now())) / 100,
          ) / 10,
        );
      }, 100);
    } else {
      // Scan finished — stop timer, record total duration
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (scanStartRef.current !== null) {
        const duration =
          Math.floor((Date.now() - scanStartRef.current) / 100) / 10;
        setLastScanDuration(duration);
        scanStartRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [loading]);

  const filteredCoins: CoinData[] = useMemo(() => {
    return allCoins.filter((c) => {
      const matchSearch = c.symbol.toLowerCase().includes(search.toLowerCase());
      const matchSignal =
        signalFilter === "all" ||
        (signalFilter === "long" && c.signal === "LONG") ||
        (signalFilter === "short" && c.signal === "SHORT");
      // const matchVolume = minVolume <= 0 || c.volume24h >= minVolume; // MIN VOL — commented out; restore when needed
      const matchRsiMin = minRsi === null || c.rsi14 >= minRsi;
      const matchRsiMax = maxRsi === null || c.rsi14 <= maxRsi;

      // Advanced filters (only applied when enabled)
      const matchVolatility =
        !advancedFilters.volatilityEnabled || c.volatility > 8;
      const matchVol24h =
        !advancedFilters.vol24hEnabled || c.volume24h >= 20_000_000;
      const matchVolChangePct =
        !advancedFilters.volChangePctEnabled ||
        (c.volumeChangePct !== null &&
          c.volumeChangePct >= advancedFilters.volChangePctMin &&
          c.volumeChangePct <= advancedFilters.volChangePctMax);

      // ROC 5m filters: if both enabled → OR logic (any momentum)
      const rocPos = advancedFilters.rocPositiveEnabled;
      const rocNeg = advancedFilters.rocNegativeEnabled;
      let matchRoc = true;
      if (rocPos && rocNeg) {
        matchRoc = c.roc5m > 0 || c.roc5m < 0;
      } else if (rocPos) {
        matchRoc = c.roc5m > 0;
      } else if (rocNeg) {
        matchRoc = c.roc5m < 0;
      }

      return (
        matchSearch &&
        matchSignal &&
        /* matchVolume && */ // MIN VOL — commented out; restore when needed
        matchRsiMin &&
        matchRsiMax &&
        matchVolatility &&
        matchVol24h &&
        matchVolChangePct &&
        matchRoc
      );
    });
  }, [
    allCoins,
    search,
    signalFilter,
    // minVolume, // MIN VOL — commented out; restore when needed
    minRsi,
    maxRsi,
    advancedFilters,
  ]);

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header
        advancedFilters={advancedFilters}
        onAdvancedFiltersChange={setAdvancedFilters}
        selectedExchange={selectedExchange}
        onExchangeChange={handleExchangeChange}
      />

      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 max-w-screen-2xl mx-auto w-full">
        {/* Stats bar — with hide/show toggle */}
        <div className="space-y-0">
          <div className="flex items-center justify-end">
            <button
              type="button"
              data-ocid="screener.stats.toggle"
              onClick={() => setStatsBarVisible((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary"
              aria-label={statsBarVisible ? "Hide stats" : "Show stats"}
            >
              {statsBarVisible ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Hide Stats
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Show Stats
                </>
              )}
            </button>
          </div>
          {statsBarVisible && (
            <StatsBar coins={filteredCoins} totalScanned={allCoins.length} />
          )}
        </div>

        {/* Filters — with hide/show toggle above panel */}
        <div className="space-y-0">
          <div className="flex items-center justify-end">
            <button
              type="button"
              data-ocid="screener.filters.toggle"
              onClick={() => setAdvancedFiltersVisible((v) => !v)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-secondary"
              aria-label={
                advancedFiltersVisible ? "Hide filters" : "Show filters"
              }
            >
              {advancedFiltersVisible ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Hide Filters
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Show Filters
                </>
              )}
            </button>
          </div>
          {advancedFiltersVisible && (
            <FilterBar
              /* minVolume={minVolume} */ // MIN VOL — commented out; restore when needed
              /* onMinVolumeChange={setMinVolume} */ // MIN VOL — commented out; restore when needed
              minRsi={minRsi}
              maxRsi={maxRsi}
              onMinRsiChange={setMinRsi}
              onMaxRsiChange={setMaxRsi}
              advancedFilters={advancedFilters}
              onAdvancedFiltersChange={setAdvancedFilters}
            />
          )}
        </div>

        {/* Session info banner — commented out; IST session is shown in top header and signal logic (SMA200 + VWAP) is self-evident from the filter. Re-enable if needed. */}
        {/*
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
        */}

        {/* Unified bar: Search + Signal Filter + Auto-refresh + Refresh + Last Updated — just above symbol listing */}
        <div className="bg-card border border-border rounded-xl px-3 py-2 flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              data-ocid="screener.search_input"
              placeholder="Search symbol..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm bg-secondary border-border w-44"
            />
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-6 bg-border" />

          {/* Signal Filter */}
          <div className="flex items-center bg-secondary rounded-lg p-0.5 gap-0.5">
            <button
              type="button"
              data-ocid="screener.all.tab"
              onClick={() => setSignalFilter("all")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                signalFilter === "all"
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              type="button"
              data-ocid="screener.long.tab"
              onClick={() => setSignalFilter("long")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                signalFilter === "long"
                  ? "bg-success/20 text-success"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🟢 Long
            </button>
            <button
              type="button"
              data-ocid="screener.short.tab"
              onClick={() => setSignalFilter("short")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                signalFilter === "short"
                  ? "bg-destructive/20 text-destructive"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              🔴 Short
            </button>
          </div>

          {/* Divider */}
          <div className="hidden sm:block w-px h-6 bg-border" />

          {/* Auto Refresh */}
          <div className="flex items-center gap-2">
            <Switch
              data-ocid="screener.autorefresh.switch"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              className="scale-90"
            />
            <Label className="text-xs text-muted-foreground">Auto</Label>
            <Select
              value={String(refreshInterval)}
              onValueChange={(v) => setRefreshInterval(Number(v))}
            >
              <SelectTrigger
                data-ocid="screener.interval.select"
                className="h-7 w-20 text-xs bg-secondary border-border"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">30s</SelectItem>
                <SelectItem value="60">60s</SelectItem>
                <SelectItem value="120">120s</SelectItem>
                <SelectItem value="180">180s</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Countdown */}
          {autoRefresh && !loading && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span>{countdown}s</span>
            </div>
          )}

          {/* Progress */}
          {loading && progress && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-24 bg-secondary rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: `${(progress.current / progress.total) * 100}%`,
                  }}
                />
              </div>
              <span data-ocid="screener.loading_state">
                Scanning {progress.current}/{progress.total}
              </span>
              <span className="text-muted-foreground/60 font-mono">
                · {elapsedTime.toFixed(1)}s
              </span>
            </div>
          )}

          {/* Scan Now */}
          <Button
            data-ocid="screener.scan_now.button"
            size="sm"
            onClick={refresh}
            disabled={loading}
            className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Scanning..." : "Scan Now"}
          </Button>

          {/* Manual Refresh */}
          <Button
            data-ocid="screener.refresh.button"
            size="sm"
            onClick={refresh}
            disabled={loading}
            className="h-8 px-3 text-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Scanning..." : "Refresh"}
          </Button>

          {/* Last Updated */}
          {lastUpdated && (
            <span className="hidden sm:inline text-xs text-muted-foreground ml-auto">
              Last updated:{" "}
              <span className="text-foreground font-medium font-mono">
                {formatTime(lastUpdated)} IST
              </span>
              {lastScanDuration !== null && !loading && (
                <span className="ml-2 text-muted-foreground/60 font-mono">
                  · scan: {lastScanDuration.toFixed(1)}s
                </span>
              )}
            </span>
          )}
        </div>

        {/* Empty state — shown before first scan */}
        {!loading && !error && filteredCoins.length === 0 && (
          <div
            data-ocid="screener.empty_state"
            className="flex flex-col items-center justify-center py-20 text-center gap-3"
          >
            <RefreshCw className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-base font-medium text-foreground">
              No data loaded yet
            </p>
            <p className="text-sm text-muted-foreground">
              Click{" "}
              <span className="font-semibold text-emerald-600">Scan Now</span>{" "}
              to fetch coin data from{" "}
              {selectedExchange.charAt(0).toUpperCase() +
                selectedExchange.slice(1)}
              .
            </p>
          </div>
        )}

        {/* Table — always visible */}
        {(loading || error || filteredCoins.length > 0) && (
          <ScreenerTable
            coins={filteredCoins}
            loading={loading}
            error={error}
            onRetry={refresh}
          />
        )}
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
