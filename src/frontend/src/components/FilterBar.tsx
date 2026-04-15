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
import { Switch } from "@/components/ui/switch";
import { Clock, RefreshCw, Search } from "lucide-react";

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  signalFilter: "all" | "long" | "short";
  onSignalFilterChange: (v: "all" | "long" | "short") => void;
  minVolume: number;
  onMinVolumeChange: (v: number) => void;
  minRsi: number | null;
  maxRsi: number | null;
  onMinRsiChange: (v: number | null) => void;
  onMaxRsiChange: (v: number | null) => void;
  autoRefresh: boolean;
  onAutoRefreshChange: (v: boolean) => void;
  refreshInterval: number;
  onRefreshIntervalChange: (v: number) => void;
  onRefresh: () => void;
  loading: boolean;
  countdown: number;
  progress: { current: number; total: number } | null;
}

function formatVolShorthand(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}

export function FilterBar({
  search,
  onSearchChange,
  signalFilter,
  onSignalFilterChange,
  minVolume,
  onMinVolumeChange,
  minRsi,
  maxRsi,
  onMinRsiChange,
  onMaxRsiChange,
  autoRefresh,
  onAutoRefreshChange,
  refreshInterval,
  onRefreshIntervalChange,
  onRefresh,
  loading,
  countdown,
  progress,
}: FilterBarProps) {
  function handleMinVolumeChange(raw: string) {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    onMinVolumeChange(cleaned === "" ? 0 : Number.parseFloat(cleaned));
  }

  function handleRsiChange(type: "min" | "max", raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, "");
    const val =
      cleaned === ""
        ? null
        : Math.min(100, Math.max(0, Number.parseInt(cleaned, 10)));
    if (type === "min") onMinRsiChange(val);
    else onMaxRsiChange(val);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-card space-y-3">
      {/* Row 1: Search + Signal Filter + Auto-refresh + Refresh */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            data-ocid="screener.search_input"
            placeholder="Search symbol..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-8 text-sm bg-secondary border-border"
          />
        </div>

        {/* Signal Filter */}
        <div className="flex items-center bg-secondary rounded-lg p-0.5 gap-0.5">
          <button
            type="button"
            data-ocid="screener.all.tab"
            onClick={() => onSignalFilterChange("all")}
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
            onClick={() => onSignalFilterChange("long")}
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
            onClick={() => onSignalFilterChange("short")}
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
            onCheckedChange={onAutoRefreshChange}
            className="scale-90"
          />
          <Label className="text-xs text-muted-foreground">Auto</Label>
          <Select
            value={String(refreshInterval)}
            onValueChange={(v) => onRefreshIntervalChange(Number(v))}
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
          </div>
        )}

        {/* Manual Refresh */}
        <Button
          data-ocid="screener.refresh.button"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          className="h-8 px-3 text-xs"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`}
          />
          {loading ? "Scanning..." : "Refresh"}
        </Button>
      </div>

      {/* Row 2: Advanced filters */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
        {/* Min Volume */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">
            Min Vol
          </Label>
          <div className="relative">
            <Input
              data-ocid="screener.min_volume_input"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 1000000"
              value={minVolume > 0 ? String(minVolume) : ""}
              onChange={(e) => handleMinVolumeChange(e.target.value)}
              className="h-7 w-36 text-xs bg-secondary border-border pr-10"
            />
            {minVolume > 0 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary font-medium pointer-events-none">
                {formatVolShorthand(minVolume)}
              </span>
            )}
          </div>
        </div>

        <div className="hidden sm:block w-px h-5 bg-border" />

        {/* RSI Range */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">
            RSI
          </Label>
          <Input
            data-ocid="screener.min_rsi_input"
            type="text"
            inputMode="numeric"
            placeholder="Min"
            value={minRsi !== null ? String(minRsi) : ""}
            onChange={(e) => handleRsiChange("min", e.target.value)}
            className="h-7 w-16 text-xs bg-secondary border-border text-center"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            data-ocid="screener.max_rsi_input"
            type="text"
            inputMode="numeric"
            placeholder="Max"
            value={maxRsi !== null ? String(maxRsi) : ""}
            onChange={(e) => handleRsiChange("max", e.target.value)}
            className="h-7 w-16 text-xs bg-secondary border-border text-center"
          />
          <span className="text-[10px] text-muted-foreground">(0–100)</span>
        </div>

        {/* Active filter badges */}
        {(minVolume > 0 || minRsi !== null || maxRsi !== null) && (
          <div className="flex items-center gap-1.5 ml-auto">
            {minVolume > 0 && (
              <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                Vol ≥ {formatVolShorthand(minVolume)}
              </span>
            )}
            {minRsi !== null && (
              <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                RSI ≥ {minRsi}
              </span>
            )}
            {maxRsi !== null && (
              <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                RSI ≤ {maxRsi}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Row 3: Exchange/pair info */}
      <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-border">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Exchange:</span>
          <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
            Binance
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Pair:</span>
          <span className="text-xs font-medium text-foreground bg-secondary px-2 py-0.5 rounded-full border border-border">
            USDT Perpetual
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Price Filter:</span>
          <span className="text-xs font-medium text-foreground bg-secondary px-2 py-0.5 rounded-full border border-border">
            &lt; $4.00
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Timeframe:</span>
          <span className="text-xs font-medium bg-secondary px-2 py-0.5 rounded-full border border-border">
            3m
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Session:</span>
          <span className="text-xs font-medium bg-secondary px-2 py-0.5 rounded-full border border-border">
            05:30 IST
          </span>
        </div>
      </div>
    </div>
  );
}
