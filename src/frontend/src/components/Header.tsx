import { Activity, ChevronDown, LogOut, Settings } from "lucide-react";
import { Role } from "../backend";
import type { UserInfo } from "../hooks/useAuth";
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
  user: UserInfo;
  onLogout: () => Promise<void>;
  onOpenAdmin: () => void;
}

export function Header({
  advancedFilters,
  onAdvancedFiltersChange,
  selectedExchange,
  onExchangeChange,
  user,
  onLogout,
  onOpenAdmin,
}: HeaderProps) {
  function setAdv(patch: Partial<AdvancedFilters>) {
    onAdvancedFiltersChange({ ...advancedFilters, ...patch });
  }

  const initials = user.username.slice(0, 2).toUpperCase();
  const isAdmin = user.role === Role.admin;

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
            USDT Perp
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Price:</span>
          <span className="text-xs font-medium text-foreground bg-secondary px-2 py-0.5 rounded-full border border-border">
            &lt; $4.00
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">TF:</span>
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
            {advancedFilters.perpetualEnabled ? "✓ Perp" : "Perp"}
          </button>
        </div>
      </div>

      {/* Right: Exchange (mobile) + Live + User + Admin + Logout */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Mobile exchange selector */}
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

        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span>Live</span>
        </div>

        {/* Admin Dashboard button — visible to admin only */}
        {isAdmin && (
          <button
            type="button"
            data-ocid="header.admin.button"
            onClick={onOpenAdmin}
            title="Admin Dashboard"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-secondary"
            aria-label="Open Admin Dashboard"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden md:inline">Admin</span>
          </button>
        )}

        {/* Username badge */}
        <div
          className="flex items-center gap-1.5 bg-secondary border border-border rounded-full pl-1 pr-2.5 py-0.5"
          title={`Logged in as ${user.username}`}
        >
          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
            {initials}
          </div>
          <span className="hidden sm:inline text-xs font-medium text-foreground">
            {user.username}
          </span>
        </div>

        {/* Logout button */}
        <button
          type="button"
          data-ocid="header.logout.button"
          onClick={onLogout}
          title="Sign out"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md hover:bg-destructive/10"
          aria-label="Sign out"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden md:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
