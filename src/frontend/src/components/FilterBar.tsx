import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Lock } from "lucide-react";

export interface AdvancedFilters {
  volatilityEnabled: boolean;
  vol24hEnabled: boolean;
  volChangePctEnabled: boolean;
  volChangePctMin: number;
  volChangePctMax: number;
  quoteUsdtEnabled: boolean;
  perpetualEnabled: boolean;
  rocPositiveEnabled: boolean;
  rocNegativeEnabled: boolean;
}

interface FilterBarProps {
  /* minVolume: number; */ // MIN VOL — commented out; restore when needed
  /* onMinVolumeChange: (v: number) => void; */ // MIN VOL — commented out; restore when needed
  minRsi: number | null;
  maxRsi: number | null;
  onMinRsiChange: (v: number | null) => void;
  onMaxRsiChange: (v: number | null) => void;
  advancedFilters: AdvancedFilters;
  onAdvancedFiltersChange: (f: AdvancedFilters) => void;
}

/* MIN VOL helper — commented out; restore when needed
function formatVolShorthand(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
}
*/

function ToggleFilter({
  id,
  label,
  checked,
  onChange,
  locked,
  lockedLabel,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  locked?: boolean;
  lockedLabel?: string;
}) {
  if (locked) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary border border-border">
        <Lock className="w-3 h-3 text-primary" />
        <span className="text-xs text-primary font-medium">
          {lockedLabel ?? label}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        data-ocid={`screener.${id}.toggle`}
        checked={checked}
        onCheckedChange={onChange}
        className="scale-90"
      />
      <Label
        htmlFor={id}
        className={`text-xs cursor-pointer whitespace-nowrap select-none ${checked ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
      </Label>
    </div>
  );
}

export function FilterBar({
  /* minVolume, */ // MIN VOL — commented out; restore when needed
  /* onMinVolumeChange, */ // MIN VOL — commented out; restore when needed
  minRsi,
  maxRsi,
  onMinRsiChange,
  onMaxRsiChange,
  advancedFilters,
  onAdvancedFiltersChange,
}: FilterBarProps) {
  /* MIN VOL handler — commented out; restore when needed
  function handleMinVolumeChange(raw: string) {
    const cleaned = raw.replace(/[^0-9.]/g, "");
    onMinVolumeChange(cleaned === "" ? 0 : Number.parseFloat(cleaned));
  }
  */

  function handleRsiChange(type: "min" | "max", raw: string) {
    const cleaned = raw.replace(/[^0-9]/g, "");
    const val =
      cleaned === ""
        ? null
        : Math.min(100, Math.max(0, Number.parseInt(cleaned, 10)));
    if (type === "min") onMinRsiChange(val);
    else onMaxRsiChange(val);
  }

  function setAdv(patch: Partial<AdvancedFilters>) {
    onAdvancedFiltersChange({ ...advancedFilters, ...patch });
  }

  function handleVolChangePct(type: "min" | "max", raw: string) {
    const cleaned = raw.replace(/[^0-9-]/g, "");
    const val =
      cleaned === "" ? (type === "min" ? 100 : 15000) : Number(cleaned);
    if (type === "min") setAdv({ volChangePctMin: val });
    else setAdv({ volChangePctMax: val });
  }

  const hasBasicFilters =
    /* minVolume > 0 || */ minRsi !== null || maxRsi !== null; // MIN VOL condition commented out; restore when needed

  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-card space-y-3">
      {/* Filter controls row */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {/* Filter 1: Volatility > 8% */}
          <ToggleFilter
            id="volatility"
            label="Volatility > 8%"
            checked={advancedFilters.volatilityEnabled}
            onChange={(v) => setAdv({ volatilityEnabled: v })}
          />

          {/* Filter 2: Vol 24h >= 20M */}
          <ToggleFilter
            id="vol24h"
            label="Vol 24hr ≥ 20M USD"
            checked={advancedFilters.vol24hEnabled}
            onChange={(v) => setAdv({ vol24hEnabled: v })}
          />

          {/* Filter 3: Volume Change % range */}
          <div className="flex items-center gap-2">
            <Switch
              id="volChangePct"
              data-ocid="screener.volchangepct.toggle"
              checked={advancedFilters.volChangePctEnabled}
              onCheckedChange={(v) => setAdv({ volChangePctEnabled: v })}
              className="scale-90"
            />
            <Label
              htmlFor="volChangePct"
              className={`text-xs cursor-pointer whitespace-nowrap select-none ${advancedFilters.volChangePctEnabled ? "text-foreground" : "text-muted-foreground"}`}
            >
              Vol Change %
            </Label>
            {advancedFilters.volChangePctEnabled && (
              <div className="flex items-center gap-1.5">
                <Input
                  data-ocid="screener.vol_chg_min_input"
                  type="text"
                  inputMode="numeric"
                  placeholder="100"
                  value={String(advancedFilters.volChangePctMin)}
                  onChange={(e) => handleVolChangePct("min", e.target.value)}
                  className="h-7 w-20 text-xs bg-secondary border-border text-center"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <Input
                  data-ocid="screener.vol_chg_max_input"
                  type="text"
                  inputMode="numeric"
                  placeholder="15000"
                  value={String(advancedFilters.volChangePctMax)}
                  onChange={(e) => handleVolChangePct("max", e.target.value)}
                  className="h-7 w-20 text-xs bg-secondary border-border text-center"
                />
                <span className="text-[10px] text-muted-foreground">%</span>
              </div>
            )}
          </div>

          <div className="hidden sm:block w-px h-5 bg-border self-center" />

          {/* Filter 6: ROC 5m Positive */}
          <ToggleFilter
            id="rocPositive"
            label="ROC 5m +"
            checked={advancedFilters.rocPositiveEnabled}
            onChange={(v) => setAdv({ rocPositiveEnabled: v })}
          />

          {/* Filter 7: ROC 5m Negative */}
          <ToggleFilter
            id="rocNegative"
            label="ROC 5m −"
            checked={advancedFilters.rocNegativeEnabled}
            onChange={(v) => setAdv({ rocNegativeEnabled: v })}
          />

          {/* MIN VOL divider — commented out; restore when needed */}
          {/* <div className="hidden sm:block w-px h-5 bg-border self-center" /> */}

          {/* MIN VOL UI — commented out; restore when needed
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
          */}

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
        </div>

        {/* Active filter badges */}
        {(advancedFilters.volatilityEnabled ||
          advancedFilters.vol24hEnabled ||
          advancedFilters.volChangePctEnabled ||
          advancedFilters.rocPositiveEnabled ||
          advancedFilters.rocNegativeEnabled ||
          hasBasicFilters) && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {advancedFilters.volatilityEnabled && (
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                Volatility &gt; 8%
              </span>
            )}
            {advancedFilters.vol24hEnabled && (
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                Vol 24hr ≥ 20M
              </span>
            )}
            {advancedFilters.volChangePctEnabled && (
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                Vol Chg {advancedFilters.volChangePctMin}% –{" "}
                {advancedFilters.volChangePctMax}%
              </span>
            )}
            {advancedFilters.rocPositiveEnabled &&
              !advancedFilters.rocNegativeEnabled && (
                <span className="text-[10px] bg-success/10 text-success border border-success/20 px-2 py-0.5 rounded-full">
                  ROC 5m &gt; 0 (Positive)
                </span>
              )}
            {advancedFilters.rocNegativeEnabled &&
              !advancedFilters.rocPositiveEnabled && (
                <span className="text-[10px] bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 rounded-full">
                  ROC 5m &lt; 0 (Negative)
                </span>
              )}
            {advancedFilters.rocPositiveEnabled &&
              advancedFilters.rocNegativeEnabled && (
                <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                  ROC 5m ± (Any Momentum)
                </span>
              )}
            {/* MIN VOL active badge — commented out; restore when needed
             {minVolume > 0 && (
               <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full">
                 Vol ≥ {formatVolShorthand(minVolume)}
               </span>
             )}
             */}
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
    </div>
  );
}
