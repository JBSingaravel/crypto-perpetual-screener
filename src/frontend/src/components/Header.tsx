import {
  Activity,
  BarChart2,
  Bell,
  Search,
  Settings,
  TrendingUp,
} from "lucide-react";

const navTabs = [
  { label: "Dashboard", icon: BarChart2 },
  { label: "Markets", icon: TrendingUp },
  { label: "Screener", icon: Search, active: true },
  { label: "Alerts", icon: Bell },
  { label: "Settings", icon: Settings },
];

export function Header() {
  return (
    <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card shadow-card">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Activity className="w-4 h-4 text-primary" />
        </div>
        <span className="font-bold text-foreground tracking-tight text-lg">
          Crypto<span className="text-primary">Screener</span>
        </span>
        <span className="ml-2 text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
          PERP · BINANCE
        </span>
      </div>

      {/* Nav tabs */}
      <nav className="hidden md:flex items-center gap-1">
        {navTabs.map((tab) => (
          <button
            type="button"
            key={tab.label}
            data-ocid={`nav.${tab.label.toLowerCase()}.link`}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab.active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Right side info */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
          <span>Live</span>
        </div>
        <div className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-bold text-foreground">
          IN
        </div>
      </div>
    </header>
  );
}
