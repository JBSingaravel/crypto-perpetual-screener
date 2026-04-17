import { Activity, ChevronDown } from "lucide-react";
import type { AdvancedFilters } from "./FilterBar";

export type ExchangeId = "binance" | "bingx" | "mexc" | "bitget" | "coinex";

export interface ExchangeOption {
  id: ExchangeId;
  label: string;
}

export const EXCHANGES: ExchangeOption[] = [
  { id: "binance", label: "Binance" },
  { id: "bingx", label: "BingX" },
  { id: "mexc", label: "MEXC" },
  { id: "bitget", label: "Bitget" },
  { id: "coinex", label: "CoinEx" },
];

interface HeaderProps {
  advancedFilters: AdvancedFilters;
  onAdvancedFiltersChange: (f: AdvancedFilters) => void;
  selectedExchange: ExchangeId;
  onExchangeChange: (exchange: ExchangeId) => void;
}

export function Header({
  advancedFilters,
  onAdvancedFiltersChange,
  selectedExchange,
  onExchangeChange,
}: HeaderProps) {
  function setAdv(patch: Partial<AdvancedFilters>) {
    onAdvancedFiltersChange({ ...advancedFilters, ...patch });
  }

  const currentExchangeLabel =
    EXCHANGES.find((e) => e.id === selectedExchange)?.label ?? "Binance";

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-6 py-3 border-b border-border bg-card shadow-card gap-4">
      {/* Left: Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Activity className="w-4 h-4 text-primary" />
        </div>
        <span className="font-bold text-foreground tracking-tight text-lg">
          Crypto<span className="text-primary">Screener</span>
        </span>
      </div>

      {/* Center: Info bar */}
      <div className="hidden sm:flex flex-wrap items-center justify-center gap-3 min-w-0">
        {/* Exchange selector dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Exchange:</span>
          <div className="relative">
            <select
              data-ocid="screener.exchange.select"
              value={selectedExchange}
              onChange={(e) => onExchangeChange(e.target.value as ExchangeId)}
              className="appearance-none text-xs font-medium text-primary bg-primary/10 border border-primary/20 pl-2.5 pr-6 py-0.5 rounded-full cursor-pointer hover:bg-primary/15 transition-colors focus:outline-none focus:ring-1 focus:ring-primary/40"
              aria-label="Select exchange"
            >
              {EXCHANGES.map((ex) => (
                <option
                  key={ex.id}
                  value={ex.id}
                  className="bg-background text-foreground"
                >
                  {ex.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-primary pointer-events-none" />
          </div>
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
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Quote:</span>
          <button
            type="button"
            data-ocid="screener.quote_usdt.toggle"
            onClick={() =>
              setAdv({ quoteUsdtEnabled: !advancedFilters.quoteUsdtEnabled })
            }
            className={`text-xs font-medium px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
              advancedFilters.quoteUsdtEnabled
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            }`}
            title={
              advancedFilters.quoteUsdtEnabled
                ? "USDT filter ON — click to disable"
                : "USDT filter OFF — click to enable"
            }
          >
            {advancedFilters.quoteUsdtEnabled ? "✓ USDT" : "USDT"}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Type:</span>
          <button
            type="button"
            data-ocid="screener.perpetual.toggle"
            onClick={() =>
              setAdv({ perpetualEnabled: !advancedFilters.perpetualEnabled })
            }
            className={`text-xs font-medium px-2 py-0.5 rounded-full border transition-colors cursor-pointer ${
              advancedFilters.perpetualEnabled
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            }`}
            title={
              advancedFilters.perpetualEnabled
                ? "Perpetual filter ON — click to disable"
                : "Perpetual filter OFF — click to enable"
            }
          >
            {advancedFilters.perpetualEnabled ? "✓ Perpetual" : "Perpetual"}
          </button>
        </div>
      </div>

      {/* Right: Exchange label (mobile) + Live indicator + user badge */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Mobile exchange label */}
        <div className="sm:hidden">
          <select
            data-ocid="screener.exchange.select.mobile"
            value={selectedExchange}
            onChange={(e) => onExchangeChange(e.target.value as ExchangeId)}
            className="appearance-none text-xs font-medium text-primary bg-primary/10 border border-primary/20 pl-2 pr-5 py-0.5 rounded-full cursor-pointer focus:outline-none"
            aria-label="Select exchange"
          >
            {EXCHANGES.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.label}
              </option>
            ))}
          </select>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span>Live</span>
        </div>
        <div
          className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-bold text-foreground"
          title={`Exchange: ${currentExchangeLabel}`}
        >
          IN
        </div>
      </div>
    </header>
  );
}
