import { useCallback, useEffect, useRef, useState } from "react";

export interface CoinData {
  symbol: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  sma200: number;
  vwap: number;
  rsi14: number;
  pctFromSma: number;
  pctFromVwap: number;
  signal: "LONG" | "SHORT" | "NEUTRAL";
  lastUpdated: Date;
}

interface ScreenerState {
  coins: CoinData[];
  loading: boolean;
  error: string | null;
  progress: { current: number; total: number } | null;
  lastUpdated: Date | null;
}

const BINANCE_BASE = "https://fapi.binance.com";
const BATCH_SIZE = 5;
const BATCH_DELAY = 300;
// Need 200 for SMA + 14 for RSI seed + a few extra = 225
const KLINES_LIMIT = 225;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function computeSMA200(closes: number[]): number {
  const slice = closes.slice(-200);
  if (slice.length === 0) return 0;
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function computeVWAP(klines: number[][]): number {
  const now = new Date();
  const sessionStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
  );

  let sessionKlines = klines.filter((k) => k[0] >= sessionStart);
  if (sessionKlines.length === 0) {
    sessionKlines = klines.slice(-20);
  }

  let sumTPV = 0;
  let sumVol = 0;
  for (const k of sessionKlines) {
    const high = k[2];
    const low = k[3];
    const close = k[4];
    const vol = k[5];
    const tp = (high + low + close) / 3;
    sumTPV += tp * vol;
    sumVol += vol;
  }
  return sumVol > 0 ? sumTPV / sumVol : 0;
}

/** Wilder's RSI(14) — returns 0 if not enough data */
function computeRSI14(closes: number[]): number {
  if (closes.length < 15) return 0;

  // Use last 15 closes minimum (14 changes) for initial avg
  const relevant = closes.slice(-Math.max(closes.length, 15));
  const changes: number[] = [];
  for (let i = 1; i < relevant.length; i++) {
    changes.push(relevant[i] - relevant[i - 1]);
  }

  if (changes.length < 14) return 0;

  // Seed: simple average of first 14 periods
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < 14; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }
  avgGain /= 14;
  avgLoss /= 14;

  // Smooth: Wilder's method for subsequent periods
  for (let i = 14; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * 13 + gain) / 14;
    avgLoss = (avgLoss * 13 + loss) / 14;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

interface ParsedKlines {
  closes: number[];
  rawKlines: number[][];
}

function parseKlines(raw: unknown[][]): ParsedKlines {
  const rawKlines = raw.map((k) => [
    Number(k[0]),
    Number(k[1]),
    Number(k[2]),
    Number(k[3]),
    Number(k[4]),
    Number(k[5]),
  ]);
  return {
    closes: rawKlines.map((k) => k[4]),
    rawKlines,
  };
}

export function useScreener() {
  const [state, setState] = useState<ScreenerState>({
    coins: [],
    loading: false,
    error: null,
    progress: null,
    lastUpdated: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const runScreener = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const abort = new AbortController();
    abortRef.current = abort;

    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      progress: null,
    }));

    try {
      const [infoRes, tickerRes] = await Promise.all([
        fetch(`${BINANCE_BASE}/fapi/v1/exchangeInfo`, { signal: abort.signal }),
        fetch(`${BINANCE_BASE}/fapi/v1/ticker/24hr`, { signal: abort.signal }),
      ]);

      if (!infoRes.ok || !tickerRes.ok)
        throw new Error("Failed to fetch Binance data");

      const [infoData, tickerData] = await Promise.all([
        infoRes.json(),
        tickerRes.json(),
      ]);

      const perpetualSymbols = new Set<string>(
        (
          infoData.symbols as Array<{
            quoteAsset: string;
            contractType: string;
            status: string;
            symbol: string;
          }>
        )
          .filter(
            (s) =>
              s.quoteAsset === "USDT" &&
              s.contractType === "PERPETUAL" &&
              s.status === "TRADING",
          )
          .map((s) => s.symbol),
      );

      const filtered = (
        tickerData as Array<{
          symbol: string;
          lastPrice: string;
          priceChangePercent: string;
          quoteVolume: string;
        }>
      ).filter(
        (t) =>
          perpetualSymbols.has(t.symbol) && Number.parseFloat(t.lastPrice) < 4,
      );

      const total = filtered.length;
      setState((prev) => ({ ...prev, progress: { current: 0, total } }));

      const results: CoinData[] = [];

      for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
        if (abort.signal.aborted) break;

        const batch = filtered.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (ticker) => {
            try {
              const klinesRes = await fetch(
                `${BINANCE_BASE}/fapi/v1/klines?symbol=${ticker.symbol}&interval=3m&limit=${KLINES_LIMIT}`,
                { signal: abort.signal },
              );
              if (!klinesRes.ok) return null;
              const rawKlines: unknown[][] = await klinesRes.json();
              const { closes, rawKlines: klines } = parseKlines(rawKlines);

              const price = Number.parseFloat(ticker.lastPrice);
              const sma200 = computeSMA200(closes);
              const vwap = computeVWAP(klines);
              const rsi14 = computeRSI14(closes);
              const pctFromSma =
                sma200 > 0 ? ((price - sma200) / sma200) * 100 : 0;
              const pctFromVwap = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0;

              let signal: CoinData["signal"] = "NEUTRAL";
              if (price > sma200 && price > vwap) signal = "LONG";
              else if (price < sma200 && price < vwap) signal = "SHORT";

              return {
                symbol: ticker.symbol,
                price,
                priceChange24h: Number.parseFloat(ticker.priceChangePercent),
                volume24h: Number.parseFloat(ticker.quoteVolume),
                sma200,
                vwap,
                rsi14,
                pctFromSma,
                pctFromVwap,
                signal,
                lastUpdated: new Date(),
              } as CoinData;
            } catch {
              return null;
            }
          }),
        );

        for (const r of batchResults) {
          if (r) results.push(r);
        }

        setState((prev) => ({
          ...prev,
          progress: { current: Math.min(i + BATCH_SIZE, total), total },
        }));

        if (i + BATCH_SIZE < filtered.length) {
          await sleep(BATCH_DELAY);
        }
      }

      if (!abort.signal.aborted) {
        setState({
          coins: results,
          loading: false,
          error: null,
          progress: null,
          lastUpdated: new Date(),
        });
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to fetch data",
        progress: null,
      }));
    }
  }, []);

  useEffect(() => {
    runScreener();
    return () => {
      abortRef.current?.abort();
    };
  }, [runScreener]);

  return { ...state, refresh: runScreener };
}
