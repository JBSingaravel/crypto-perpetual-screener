import { useCallback, useEffect, useRef, useState } from "react";
import type { ExchangeId } from "../components/Header";

export interface CoinData {
  symbol: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  volatility: number; // (high - low) / low * 100 from current UTC-day 1d kline (matches TradingView)
  volumeChangePct: number | null; // (current24h - prev24h) / prev24h * 100 from 48 hourly klines only
  sma200: number;
  vwap: number;
  rsi14: number;
  roc5m: number;
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

// ─── Binance ─────────────────────────────────────────────────────────────────
const BINANCE_BASE = "https://fapi.binance.com";
// Steady-stream batch size — keeps concurrent requests manageable
const BATCH_SIZE = 6;
// Fixed inter-batch pause (ms) — creates a steady stream Binance tolerates
const INTER_BATCH_PAUSE = 80;
// Extended pause after a 429 hit — only for that next batch, then reverts to INTER_BATCH_PAUSE
const RATE_LIMIT_PAUSE = 1500;
// 200 closes for SMA + 14 for RSI warm-up = 215, round up to 225
const KLINES_3M_LIMIT = 225;
// 14 for ROC period, fetch 20 to be safe
const KLINES_5M_LIMIT = 20;
// Hourly klines for Vol Chg%: 48 candles — [0..23] = previous 24h, [24..47] = current 24h
const KLINES_1H_LIMIT = 48;
// 1d kline fetch for volatility: limit=2 gives current UTC-day candle (index -1)
const KLINES_1D_LIMIT = 2;

// ─── CORS proxy ──────────────────────────────────────────────────────────────
// Used for exchanges that block direct browser requests (CORS).
// Prepend to any URL that fails with CORS / OPAQUE response.
const CORS_PROXY = "https://corsproxy.io/?";

function proxyUrl(url: string): string {
  return `${CORS_PROXY}${encodeURIComponent(url)}`;
}

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

/** ROC (Rate of Change) — period=14 on closes array. Returns 0 if not enough data. */
function computeROC(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 0;
  const current = closes[closes.length - 1];
  const prior = closes[closes.length - 1 - period];
  if (prior === 0) return 0;
  return ((current - prior) / prior) * 100;
}

/** Wilder's RSI(14) — returns 0 if not enough data */
function computeRSI14(closes: number[]): number {
  if (closes.length < 15) return 0;

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

/**
 * VOLATILITY — uses high and low from the current UTC-day 1d kline.
 * Formula: (high - low) / low * 100
 * Source: /fapi/v1/klines?interval=1d&limit=2 — last candle = current UTC day.
 * This matches TradingView's volatility which resets at midnight UTC (05:30 IST).
 * Falls back to bulk 24hr ticker highPrice/lowPrice if the 1d fetch fails.
 */
function computeVolatility(dayHigh: number, dayLow: number): number {
  if (dayLow <= 0) return 0;
  return ((dayHigh - dayLow) / dayLow) * 100;
}

/**
 * VOL CHANGE % — reads ONLY from a dedicated 48-hourly-kline fetch.
 * prev24hQuoteVol    = sum of klines[0..23].quoteAssetVolume  (older 24h window)
 * current24hQuoteVol = sum of klines[24..47].quoteAssetVolume (recent 24h window)
 * Formula: (current24h - prev24h) / prev24h * 100
 * Source: /klines?interval=1h&limit=48 (independent fetch, never shared)
 * Returns null if insufficient data.
 */
function computeVolumeChangePct(klines1h: number[][]): number | null {
  if (klines1h.length < 48) return null;
  // Index 7 = quoteAssetVolume in the normalized kline format [time, o, h, l, c, baseVol, closeTime, quoteVol]
  const prev24h = klines1h.slice(0, 24).reduce((sum, k) => sum + k[7], 0);
  const current24h = klines1h.slice(24, 48).reduce((sum, k) => sum + k[7], 0);
  if (!prev24h || prev24h === 0) return null;
  return ((current24h - prev24h) / prev24h) * 100;
}

interface ParsedKlines {
  closes: number[];
  rawKlines: number[][];
}

function parseKlines(raw: unknown[][]): ParsedKlines {
  const rawKlines = raw.map((k) => [
    Number(k[0]), // open time
    Number(k[1]), // open
    Number(k[2]), // high
    Number(k[3]), // low
    Number(k[4]), // close
    Number(k[5]), // base asset volume
    Number(k[6]), // close time
    Number(k[7]), // quote asset volume
  ]);
  return {
    closes: rawKlines.map((k) => k[4]),
    rawKlines,
  };
}

/** Normalized ticker row — common internal format */
interface NormalizedTicker {
  symbol: string; // exchange-native symbol (e.g. BTCUSDT, BTC-USDT, BTC_USDT, BTCUSDT_UMCBL)
  lastPrice: number;
  priceChangePercent: number;
  quoteVolume: number;
  highPrice: number;
  lowPrice: number;
}

/** Ticker shape from Binance /fapi/v1/ticker/24hr */
interface BinanceTicker {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
}

// ─── Exchange config & normalization ─────────────────────────────────────────

interface ExchangeConfig {
  exchangeInfoUrl: string;
  ticker24hrUrl: string;
  /** Whether to use CORS proxy for all requests to this exchange */
  useCorsProxy: boolean;
  /** Returns canonical (USDT-perp) symbols in exchange-native format */
  parseSymbols: (data: unknown) => string[];
  /** Normalizes bulk ticker array to NormalizedTicker[] */
  parseTickers: (data: unknown) => NormalizedTicker[];
  /** Builds klines URL for a given symbol, interval key, and limit */
  klinesUrl: (
    symbol: string,
    interval: "3m" | "5m" | "1h" | "1d",
    limit: number,
  ) => string;
  /** Normalizes kline array from exchange format to [[time,o,h,l,c,baseVol,closeTime,quoteVol],...] ascending time order */
  parseKlinesRaw: (data: unknown) => unknown[][];
}

// ── Binance ───────────────────────────────────────────────────────────────────
const binanceConfig: ExchangeConfig = {
  exchangeInfoUrl: `${BINANCE_BASE}/fapi/v1/exchangeInfo`,
  ticker24hrUrl: `${BINANCE_BASE}/fapi/v1/ticker/24hr`,
  useCorsProxy: false,
  parseSymbols(data) {
    const d = data as {
      symbols: Array<{
        quoteAsset: string;
        contractType: string;
        status: string;
        symbol: string;
      }>;
    };
    if (!d?.symbols || !Array.isArray(d.symbols)) return [];
    return d.symbols
      .filter(
        (s) =>
          s.quoteAsset === "USDT" &&
          s.contractType === "PERPETUAL" &&
          s.status === "TRADING",
      )
      .map((s) => s.symbol);
  },
  parseTickers(data) {
    if (!Array.isArray(data)) return [];
    return (data as BinanceTicker[]).map((t) => ({
      symbol: t.symbol,
      lastPrice: Number.parseFloat(t.lastPrice),
      priceChangePercent: Number.parseFloat(t.priceChangePercent),
      quoteVolume: Number.parseFloat(t.quoteVolume),
      highPrice: Number.parseFloat(t.highPrice),
      lowPrice: Number.parseFloat(t.lowPrice),
    }));
  },
  klinesUrl(symbol, interval, limit) {
    return `${BINANCE_BASE}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  },
  parseKlinesRaw(data) {
    if (!Array.isArray(data)) return [];
    return data as unknown[][];
  },
};

// ── BingX ─────────────────────────────────────────────────────────────────────
// BingX public swap API — requires CORS proxy for browser access.
// Symbol format: BTC-USDT (hyphenated)
// Contracts endpoint: GET /openApi/swap/v2/quote/contracts
//   Response: { code: "0", data: [{symbol: "BTC-USDT", currency: "USDT", ...}] }
// Ticker endpoint: GET /openApi/swap/v2/quote/ticker (no params = all symbols)
//   Response: { code: "0", data: [{symbol, lastPrice, priceChangePercent, quoteVolume, highPrice, lowPrice, ...}] }
// Klines endpoint: GET /openApi/swap/v3/quote/klines?symbol=BTC-USDT&interval=3m&limit=200
//   Response: { code: "0", data: [{open, close, high, low, volume, time, amount}] }
//   Field names are plain strings (not array indices), ascending time order.
const BINGX_BASE = "https://open-api.bingx.com";

interface BingXContractItem {
  symbol: string;
  currency?: string;
  asset?: string;
  contractId?: string;
}
interface BingXContractsResponse {
  code?: string | number;
  data:
    | BingXContractItem[]
    | { contracts?: BingXContractItem[]; rows?: BingXContractItem[] };
}
interface BingXTickerItem {
  symbol: string;
  lastPrice: string | number;
  priceChangePercent: string | number;
  quoteVolume?: string | number;
  volume?: string | number;
  highPrice?: string | number;
  high?: string | number;
  lowPrice?: string | number;
  low?: string | number;
  openPrice?: string | number;
}
interface BingXTickerResponse {
  code?: string | number;
  data: BingXTickerItem | BingXTickerItem[];
}
interface BingXKlineRow {
  time: number | string;
  open: string | number;
  close: string | number;
  high: string | number;
  low: string | number;
  volume: string | number;
  amount?: string | number;
}
interface BingXKlineResponse {
  code?: string | number;
  data: BingXKlineRow[] | null;
}

const bingxIntervalMap: Record<string, string> = {
  "3m": "3m",
  "5m": "5m",
  "1h": "1h",
};

const bingxConfig: ExchangeConfig = {
  exchangeInfoUrl: `${BINGX_BASE}/openApi/swap/v2/quote/contracts`,
  ticker24hrUrl: `${BINGX_BASE}/openApi/swap/v2/quote/ticker`,
  useCorsProxy: true,
  parseSymbols(data) {
    // Response: { code: "0", data: [...] }
    // data can be a flat array or { contracts: [...] } or { rows: [...] }
    const d = data as BingXContractsResponse;
    let rows: BingXContractItem[] = [];
    if (Array.isArray(d?.data)) {
      rows = d.data as BingXContractItem[];
    } else if (d?.data && typeof d.data === "object") {
      const nested = d.data as {
        contracts?: BingXContractItem[];
        rows?: BingXContractItem[];
      };
      rows = nested.contracts ?? nested.rows ?? [];
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      console.warn(
        "[BingX] parseSymbols: no rows found in response",
        JSON.stringify(d).slice(0, 300),
      );
      return [];
    }
    const result = rows
      .filter((s) => {
        const sym: string = s?.symbol ?? "";
        return sym.endsWith("-USDT");
      })
      .map((s) => s.symbol);
    console.log(`[BingX] parseSymbols: found ${result.length} USDT perpetuals`);
    return result;
  },
  parseTickers(data) {
    // Response: { code: "0", data: [{symbol, lastPrice, priceChangePercent, quoteVolume, highPrice, lowPrice}] }
    // Note: some BingX API versions use "volume" instead of "quoteVolume",
    //       and "high"/"low" instead of "highPrice"/"lowPrice"
    const d = data as BingXTickerResponse;
    let rows: BingXTickerItem[] = [];
    if (Array.isArray(d?.data)) {
      rows = d.data as BingXTickerItem[];
    } else if (d?.data && typeof d.data === "object") {
      // Single ticker object — wrap in array
      rows = [d.data as BingXTickerItem];
    }
    if (rows.length === 0) {
      console.warn(
        "[BingX] parseTickers: no rows found in response",
        JSON.stringify(d).slice(0, 300),
      );
      return [];
    }
    return rows
      .filter((t) => t?.symbol)
      .map((t) => ({
        symbol: t.symbol,
        lastPrice: Number(t.lastPrice),
        priceChangePercent: Number(t.priceChangePercent),
        // quoteVolume field may be "quoteVolume" or "volume" depending on API version
        quoteVolume: Number(t.quoteVolume ?? t.volume ?? 0),
        highPrice: Number(t.highPrice ?? t.high ?? 0),
        lowPrice: Number(t.lowPrice ?? t.low ?? 0),
      }));
  },
  klinesUrl(symbol, interval, limit) {
    const bxInterval = bingxIntervalMap[interval] ?? interval;
    return `${BINGX_BASE}/openApi/swap/v3/quote/klines?symbol=${encodeURIComponent(symbol)}&interval=${bxInterval}&limit=${limit}`;
  },
  parseKlinesRaw(data) {
    // BingX returns { data: [{time, open, close, high, low, volume, amount}] }
    // Fields are named strings; time is ms timestamp; ascending order.
    // Normalize to Binance-like [time, open, high, low, close, baseVol, closeTime, quoteVol]
    const d = data as BingXKlineResponse;
    const rows = d?.data;
    if (!Array.isArray(rows) || rows.length === 0) return [];
    return rows.map((k) => [
      Number(k.time), // 0: open time (ms)
      Number(k.open), // 1: open
      Number(k.high), // 2: high
      Number(k.low), // 3: low
      Number(k.close), // 4: close
      Number(k.volume), // 5: base asset volume
      Number(k.time) + 1, // 6: close time (approx)
      Number(k.amount ?? 0), // 7: quote asset volume
    ]);
  },
};

// ── MEXC ──────────────────────────────────────────────────────────────────────
// MEXC Futures (contract) API — requires CORS proxy for browser access.
// Symbol format: BTC_USDT (underscore)
// Contracts endpoint: GET /api/v1/contract/detail
//   Response: { code: 0, data: [{symbol: "BTC_USDT", baseCoin, quoteCoin, ...}] }
// Ticker endpoint: GET /api/v1/contract/ticker (all symbols, no params needed)
//   Response: { code: 0, data: [{symbol, lastPrice, riseFallRate (decimal), volume24, amount24,
//                                high24Price, low24Price, ...}] }
// Klines endpoint: GET /api/v1/contract/kline/{symbol}?interval=Min3&limit=200
//   Response: { code: 0, data: { time:[...], open:[...], high:[...], low:[...], close:[...], vol:[...], amount:[...] } }
//   Columnar format — all arrays share the same index; timestamps in seconds.
const MEXC_BASE = "https://contract.mexc.com";

interface MEXCContractItem {
  symbol: string;
  baseCoin?: string;
  quoteCoin?: string;
  settleCoin?: string;
  quoteAsset?: string;
}
interface MEXCContracts {
  code?: number;
  data: MEXCContractItem[];
}
interface MEXCTickerItem {
  symbol: string;
  lastPrice: number | string;
  // riseFallRate: decimal e.g. 0.05 = 5%. Some versions use "changePercent" (already %)
  riseFallRate?: number | string;
  changePercent?: number | string;
  change?: number | string;
  volume24?: number | string;
  amount24?: number | string;
  high24Price?: number | string;
  high24price?: number | string;
  low24Price?: number | string;
  low24price?: number | string;
}
interface MEXCTickers {
  code?: number;
  data: MEXCTickerItem[];
}
interface MEXCKlineResponse {
  code?: number;
  data: {
    time: number[];
    open: (number | string)[];
    high: (number | string)[];
    low: (number | string)[];
    close: (number | string)[];
    vol: (number | string)[];
    amount?: (number | string)[];
  };
}

const mexcIntervalMap: Record<string, string> = {
  "3m": "Min3",
  "5m": "Min5",
  "1h": "Hour1",
};

const mexcConfig: ExchangeConfig = {
  exchangeInfoUrl: `${MEXC_BASE}/api/v1/contract/detail`,
  ticker24hrUrl: `${MEXC_BASE}/api/v1/contract/ticker`,
  useCorsProxy: true,
  parseSymbols(data) {
    const d = data as MEXCContracts;
    if (!Array.isArray(d?.data)) {
      console.warn(
        "[MEXC] parseSymbols: unexpected response shape",
        JSON.stringify(d).slice(0, 300),
      );
      return [];
    }
    const result = d.data
      .filter((s) => {
        const sym: string = s?.symbol ?? "";
        return sym.endsWith("_USDT");
      })
      .map((s) => s.symbol);
    console.log(`[MEXC] parseSymbols: found ${result.length} USDT perpetuals`);
    return result;
  },
  parseTickers(data) {
    const d = data as MEXCTickers;
    const rows = Array.isArray(d?.data) ? d.data : [];
    if (rows.length === 0) {
      console.warn(
        "[MEXC] parseTickers: no rows found",
        JSON.stringify(d).slice(0, 300),
      );
      return [];
    }
    return rows
      .filter((t) => t?.symbol)
      .map((t) => {
        // riseFallRate is a decimal (0.05 = 5%), but some MEXC API versions
        // already return it as a percentage. Heuristic: if |value| > 1 treat as %, else multiply.
        const rawRate = Number(
          t.riseFallRate ?? t.changePercent ?? t.change ?? 0,
        );
        const priceChangePercent =
          Math.abs(rawRate) < 2 ? rawRate * 100 : rawRate;
        return {
          symbol: t.symbol,
          lastPrice: Number(t.lastPrice),
          priceChangePercent,
          // amount24 is in USD (quote volume), volume24 is in contracts
          quoteVolume: Number(t.amount24 ?? t.volume24 ?? 0),
          highPrice: Number(t.high24Price ?? t.high24price ?? 0),
          lowPrice: Number(t.low24Price ?? t.low24price ?? 0),
        };
      });
  },
  klinesUrl(symbol, interval, limit) {
    const mxInterval = mexcIntervalMap[interval] ?? interval;
    return `${MEXC_BASE}/api/v1/contract/kline/${symbol}?interval=${mxInterval}&limit=${limit}`;
  },
  parseKlinesRaw(data) {
    // MEXC returns columnar arrays: { time:[...], open:[...], high:[...], low:[...], close:[...], vol:[...], amount?:[...] }
    // Timestamps may be in seconds — detect by checking magnitude (< 1e10 = seconds).
    const d = data as MEXCKlineResponse;
    const k = d?.data;
    if (!k || !Array.isArray(k.time) || k.time.length === 0) return [];
    return k.time.map((t, i) => {
      const tsMs = Number(t) < 1e10 ? Number(t) * 1000 : Number(t);
      return [
        tsMs, // 0: open time (ms)
        Number(k.open[i]), // 1: open
        Number(k.high[i]), // 2: high
        Number(k.low[i]), // 3: low
        Number(k.close[i]), // 4: close
        Number(k.vol[i]), // 5: base asset volume
        tsMs + 1, // 6: close time (approx)
        Number(k.amount?.[i] ?? 0), // 7: quote asset volume
      ];
    });
  },
};

// ── Bitget ────────────────────────────────────────────────────────────────────
// Bitget Mix (USDT Perpetual) API — requires CORS proxy for browser access.
// Symbol format: BTCUSDT_UMCBL (with _UMCBL suffix)
// Contracts endpoint: GET /api/v1/mix/market/contracts?productType=umcbl
//   Response: { code: "00000", data: [{symbol: "BTCUSDT_UMCBL", baseCoin, quoteCoin, ...}] }
// Ticker endpoint: GET /api/v1/mix/market/tickers?productType=umcbl
//   Response: { code: "00000", data: [{symbol, last, change24h (decimal), usdtVol, high24h, low24h}] }
// Klines endpoint: GET /api/v1/mix/market/candles?symbol=BTCUSDT_UMCBL&granularity=3m&limit=200
//   Response: bare array [[timestamp(ms), open, high, low, close, baseVol, quoteVol], ...]
//   IMPORTANT: Bitget returns klines in DESCENDING order (newest first) — must reverse!
const BITGET_BASE = "https://api.bitget.com";

interface BitgetContractItem {
  symbol: string;
  quoteCoin?: string;
  settleCoin?: string;
  status?: string;
}
interface BitgetContracts {
  code?: string;
  data: BitgetContractItem[];
}
interface BitgetTickerItem {
  symbol: string;
  last: string | number;
  // change24h may also appear as changeUtc or change
  change24h?: string | number;
  changeUtc?: string | number;
  change?: string | number;
  usdtVol?: string | number;
  quoteVolume?: string | number;
  high24h?: string | number;
  high?: string | number;
  low24h?: string | number;
  low?: string | number;
}
interface BitgetTickers {
  code?: string;
  data: BitgetTickerItem[];
}
// Bitget kline row (bare array): [timestamp, open, high, low, close, baseVol, quoteVol]
type BitgetKlineRow = [string, string, string, string, string, string, string];

const bitgetGranularityMap: Record<string, string> = {
  "3m": "3m",
  "5m": "5m",
  "1h": "1H",
};

const bitgetConfig: ExchangeConfig = {
  exchangeInfoUrl: `${BITGET_BASE}/api/v1/mix/market/contracts?productType=umcbl`,
  ticker24hrUrl: `${BITGET_BASE}/api/v1/mix/market/tickers?productType=umcbl`,
  useCorsProxy: true,
  parseSymbols(data) {
    const d = data as BitgetContracts;
    if (!Array.isArray(d?.data)) {
      console.warn(
        "[Bitget] parseSymbols: unexpected response shape",
        JSON.stringify(d).slice(0, 300),
      );
      return [];
    }
    const result = d.data
      .filter((s) => {
        const sym: string = s?.symbol ?? "";
        return sym.endsWith("_UMCBL") && sym.includes("USDT");
      })
      .map((s) => s.symbol);
    console.log(
      `[Bitget] parseSymbols: found ${result.length} USDT perpetuals`,
    );
    return result;
  },
  parseTickers(data) {
    const d = data as BitgetTickers;
    const rows = Array.isArray(d?.data) ? d.data : [];
    if (rows.length === 0) {
      console.warn(
        "[Bitget] parseTickers: no rows found",
        JSON.stringify(d).slice(0, 300),
      );
      return [];
    }
    return rows
      .filter((t) => t?.symbol)
      .map((t) => {
        // change24h is a decimal string (e.g. "0.0125" = 1.25%), multiply × 100
        const rawChange = Number(t.change24h ?? t.changeUtc ?? t.change ?? 0);
        // Heuristic: if absolute value > 2, it's already a percentage; otherwise multiply
        const priceChangePercent =
          Math.abs(rawChange) < 2 ? rawChange * 100 : rawChange;
        return {
          symbol: t.symbol,
          lastPrice: Number(t.last),
          priceChangePercent,
          quoteVolume: Number(t.usdtVol ?? t.quoteVolume ?? 0),
          highPrice: Number(t.high24h ?? t.high ?? 0),
          lowPrice: Number(t.low24h ?? t.low ?? 0),
        };
      });
  },
  klinesUrl(symbol, interval, limit) {
    const gran = bitgetGranularityMap[interval] ?? interval;
    return `${BITGET_BASE}/api/v1/mix/market/candles?symbol=${symbol}&granularity=${gran}&limit=${limit}`;
  },
  parseKlinesRaw(data) {
    // Bitget returns a bare array or { data: [[...], ...] }
    // Each row: [timestamp(ms), open, high, low, close, baseVol, quoteVol]
    // CRITICAL: Bitget returns newest-first (descending) — must reverse to ascending for correct SMA/VWAP/RSI.
    let rows: BitgetKlineRow[] = [];
    if (Array.isArray(data)) {
      rows = data as BitgetKlineRow[];
    } else {
      const d = data as { data?: BitgetKlineRow[] };
      if (Array.isArray(d?.data)) rows = d.data;
    }
    if (rows.length === 0) return [];
    // Reverse to ascending time order (oldest first) — critical for SMA200, VWAP, RSI correctness
    const ascending = [...rows].reverse();
    return ascending.map((k) => [
      Number(k[0]), // 0: open time (ms)
      Number(k[1]), // 1: open
      Number(k[2]), // 2: high
      Number(k[3]), // 3: low
      Number(k[4]), // 4: close
      Number(k[5]), // 5: base asset volume
      Number(k[0]) + 1, // 6: close time (approx)
      Number(k[6] ?? 0), // 7: quote asset volume
    ]);
  },
};

// ── CoinEx ────────────────────────────────────────────────────────────────────
// CoinEx Futures API v2 — requires CORS proxy for browser access.
// Symbol format: BTCUSDT (plain, no suffix — same as Binance)
// Markets endpoint: GET /v2/futures/market
//   Response: { code: 0, data: [{market: "BTCUSDT", base_currency, quote_currency, ...}] }
// Ticker endpoint: GET /v2/futures/ticker
//   Response: { code: 0, data: [{market, last, change_rate (decimal), volume, high, low, ...}] }
//   NOTE: data is an ARRAY (not a keyed object) in V2 API.
// Klines endpoint: GET /v2/futures/kline?market=BTCUSDT&period=3min&limit=200
//   Response: { code: 0, data: [{created_at (unix seconds), open, high, low, close, volume, value}] }
//   Ascending time order. Timestamps in UNIX seconds — multiply × 1000 for ms.
const COINEX_BASE = "https://api.coinex.com";

interface CoinExMarketItem {
  market: string;
  base_currency?: string;
  quote_currency?: string;
  is_perpetual?: boolean;
}
interface CoinExMarketsResponse {
  code?: number;
  data: CoinExMarketItem[];
}
interface CoinExTickerItem {
  market: string;
  last: string | number;
  // change_rate: decimal e.g. 0.025 = 2.5%
  change_rate?: string | number;
  // volume: base asset volume; value / quote_volume: USD volume
  volume?: string | number;
  value?: string | number;
  quote_volume?: string | number;
  high?: string | number;
  low?: string | number;
}
// V2 returns data as array, not keyed object
interface CoinExTickersResponse {
  code?: number;
  data: CoinExTickerItem[] | Record<string, CoinExTickerItem>;
}
interface CoinExKlineRow {
  created_at: number | string;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
  value?: string | number;
}
interface CoinExKlineResponse {
  code?: number;
  data: CoinExKlineRow[];
}

const coinexPeriodMap: Record<string, string> = {
  "3m": "3min",
  "5m": "5min",
  "1h": "1hour",
};

const coinexConfig: ExchangeConfig = {
  exchangeInfoUrl: `${COINEX_BASE}/v2/futures/market`,
  ticker24hrUrl: `${COINEX_BASE}/v2/futures/ticker`,
  useCorsProxy: true,
  parseSymbols(data) {
    const d = data as CoinExMarketsResponse;
    if (!Array.isArray(d?.data)) {
      console.warn(
        "[CoinEx] parseSymbols: unexpected response shape",
        JSON.stringify(d).slice(0, 300),
      );
      return [];
    }
    const result = d.data
      .filter((s) => {
        const m: string = s?.market ?? "";
        return m.endsWith("USDT");
      })
      .map((s) => s.market);
    console.log(
      `[CoinEx] parseSymbols: found ${result.length} USDT perpetuals`,
    );
    return result;
  },
  parseTickers(data) {
    const d = data as CoinExTickersResponse;
    let rows: CoinExTickerItem[] = [];
    if (Array.isArray(d?.data)) {
      // V2: data is array
      rows = d.data as CoinExTickerItem[];
    } else if (d?.data && typeof d.data === "object") {
      // Fallback: keyed object (V1-style)
      rows = Object.values(d.data as Record<string, CoinExTickerItem>);
    }
    if (rows.length === 0) {
      console.warn(
        "[CoinEx] parseTickers: no rows found",
        JSON.stringify(d).slice(0, 300),
      );
      return [];
    }
    return rows
      .filter((t) => t?.market)
      .map((t) => ({
        symbol: t.market,
        lastPrice: Number(t.last),
        priceChangePercent: Number(t.change_rate ?? 0) * 100, // decimal → percentage
        // value is USD volume; fall back to volume (base asset) if not present
        quoteVolume: Number(t.value ?? t.quote_volume ?? t.volume ?? 0),
        highPrice: Number(t.high ?? 0),
        lowPrice: Number(t.low ?? 0),
      }));
  },
  klinesUrl(symbol, interval, limit) {
    const period = coinexPeriodMap[interval] ?? interval;
    return `${COINEX_BASE}/v2/futures/kline?market=${symbol}&period=${period}&limit=${limit}`;
  },
  parseKlinesRaw(data) {
    // CoinEx returns { data: [{created_at (unix seconds), open, high, low, close, volume, value}] }
    // Ascending time order. Timestamps in seconds — multiply × 1000.
    const d = data as CoinExKlineResponse;
    const rows = Array.isArray(d?.data) ? d.data : [];
    return rows.map((k) => [
      Number(k.created_at) * 1000, // 0: open time (seconds → ms)
      Number(k.open), // 1: open
      Number(k.high), // 2: high
      Number(k.low), // 3: low
      Number(k.close), // 4: close
      Number(k.volume), // 5: base asset volume
      Number(k.created_at) * 1000 + 1, // 6: close time (approx)
      Number(k.value ?? 0), // 7: quote asset volume
    ]);
  },
};

const EXCHANGE_CONFIGS: Record<ExchangeId, ExchangeConfig> = {
  binance: binanceConfig,
  bingx: bingxConfig,
  mexc: mexcConfig,
  bitget: bitgetConfig,
  coinex: coinexConfig,
};

export function useScreener(exchange: ExchangeId = "binance") {
  const [state, setState] = useState<ScreenerState>({
    coins: [],
    loading: false,
    error: null,
    progress: null,
    lastUpdated: null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const exchangeRef = useRef<ExchangeId>(exchange);
  exchangeRef.current = exchange;

  const runScreenerOnce = useCallback(
    async (
      abort: AbortController,
      selectedExchange: ExchangeId,
    ): Promise<{ results: CoinData[]; rateLimited: boolean }> => {
      const config = EXCHANGE_CONFIGS[selectedExchange];

      // Build a fetch URL — applies CORS proxy when the exchange requires it.
      function buildUrl(url: string): string {
        return config.useCorsProxy ? proxyUrl(url) : url;
      }

      // Retry helper — only long back-off on actual 429 rate-limit responses.
      // All other transient errors get a fast 100ms retry. Max 3 attempts.
      let batchHit429 = false;
      async function fetchWithRetry(
        url: string,
        retries = 3,
      ): Promise<Response> {
        const fetchUrl = buildUrl(url);
        for (let attempt = 0; attempt < retries; attempt++) {
          if (abort.signal.aborted)
            throw new DOMException("Aborted", "AbortError");
          try {
            const res = await fetch(fetchUrl, { signal: abort.signal });
            if (res.ok) return res;
            if (res.status === 429) {
              // Rate-limited: back off 2s × attempt
              batchHit429 = true;
              if (attempt < retries - 1) {
                await sleep(2000 * (attempt + 1));
                continue;
              }
            } else if (attempt < retries - 1) {
              // Non-429 error (5xx, network blip): retry quickly
              await sleep(100);
              continue;
            }
            return res;
          } catch (fetchErr: unknown) {
            if (fetchErr instanceof Error && fetchErr.name === "AbortError")
              throw fetchErr;
            if (attempt < retries - 1) {
              await sleep(200);
              continue;
            }
            throw fetchErr;
          }
        }
        throw new Error(`Failed to fetch data from ${selectedExchange}`);
      }

      let infoData: unknown;
      let tickerData: unknown;

      try {
        const [infoRes, tickerRes] = await Promise.all([
          fetchWithRetry(config.exchangeInfoUrl),
          fetchWithRetry(config.ticker24hrUrl),
        ]);

        if (!infoRes.ok || !tickerRes.ok) {
          throw new Error(
            `Failed to fetch ${selectedExchange} data (HTTP ${infoRes.status}/${tickerRes.status})`,
          );
        }

        [infoData, tickerData] = await Promise.all([
          infoRes.json(),
          tickerRes.json(),
        ]);
      } catch (initErr: unknown) {
        if (initErr instanceof Error && initErr.name === "AbortError")
          throw initErr;
        console.error(
          `[${selectedExchange}] Failed to fetch exchangeInfo or tickers:`,
          initErr,
        );
        throw new Error(
          `Failed to fetch ${selectedExchange} data: ${initErr instanceof Error ? initErr.message : String(initErr)}`,
        );
      }

      // Parse symbol list from exchange-specific format
      const symbolList = config.parseSymbols(infoData);
      if (!symbolList || symbolList.length === 0) {
        console.error(
          `[${selectedExchange}] exchangeInfo response:`,
          JSON.stringify(infoData).slice(0, 500),
        );
        throw new Error(
          `Failed to fetch ${selectedExchange} data: no USDT perpetual symbols found`,
        );
      }
      const perpetualSymbols = new Set<string>(symbolList);

      // Parse tickers from exchange-specific format
      const normalizedTickers = config.parseTickers(tickerData);
      if (!normalizedTickers || normalizedTickers.length === 0) {
        console.error(
          `[${selectedExchange}] ticker response:`,
          JSON.stringify(tickerData).slice(0, 500),
        );
        throw new Error(
          `Failed to fetch ${selectedExchange} data: ticker response malformed`,
        );
      }

      // Filter to USDT perpetuals under $4
      const filtered = normalizedTickers.filter(
        (t) => perpetualSymbols.has(t.symbol) && t.lastPrice < 4,
      );

      if (filtered.length === 0) {
        // Debug: log first few tickers and symbols to diagnose mismatch
        console.warn(
          `[${selectedExchange}] No coins passed filter. First 5 ticker symbols:`,
          normalizedTickers.slice(0, 5).map((t) => t.symbol),
        );
        console.warn(
          `[${selectedExchange}] First 5 perpetual symbols:`,
          [...perpetualSymbols].slice(0, 5),
        );
        console.warn(
          `[${selectedExchange}] Tickers under $4 (any symbol):`,
          normalizedTickers
            .filter((t) => t.lastPrice < 4)
            .slice(0, 5)
            .map((t) => `${t.symbol}=$${t.lastPrice}`),
        );
      }

      const total = filtered.length;
      setState((prev) => ({ ...prev, progress: { current: 0, total } }));

      const results: CoinData[] = [];
      let anyBatchHadRateLimit = false;
      // nextPause tracks the inter-batch delay: normally INTER_BATCH_PAUSE,
      // elevated to RATE_LIMIT_PAUSE for one batch after a 429, then resets.
      let nextPause = INTER_BATCH_PAUSE;

      for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
        if (abort.signal.aborted) break;

        batchHit429 = false;
        const batch = filtered.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (ticker) => {
            try {
              // ── Four kline fetches per coin ───────────────────────────────
              // klines3m  → SMA200, VWAP, RSI14
              // klines5m  → ROC 5m
              // klines1h  → Vol Chg% ONLY (48 candles, never shared with other metrics)
              // klines1d  → Volatility: current UTC-day high/low (limit=2, last candle)
              const [klinesRes, klines5mRes, klines1hRes, klines1dRes] =
                await Promise.all([
                  fetchWithRetry(
                    config.klinesUrl(ticker.symbol, "3m", KLINES_3M_LIMIT),
                  ),
                  fetchWithRetry(
                    config.klinesUrl(ticker.symbol, "5m", KLINES_5M_LIMIT),
                  ),
                  // Dedicated fetch for Vol Chg% — limit=48 hourly candles, independent, never modified
                  fetchWithRetry(
                    config.klinesUrl(ticker.symbol, "1h", KLINES_1H_LIMIT),
                  ),
                  // Dedicated fetch for Volatility — current UTC-day candle (limit=2, take last)
                  fetchWithRetry(
                    config.klinesUrl(ticker.symbol, "1d", KLINES_1D_LIMIT),
                  ),
                ]);

              if (!klinesRes.ok) return null;

              // ── 3m klines: SMA200, VWAP, RSI14 ──────────────────────────
              const rawKlinesData: unknown = await klinesRes.json();
              const rawKlinesNorm = config.parseKlinesRaw(rawKlinesData);
              // Validate array before parsing — a missing/empty response must not crash
              if (!Array.isArray(rawKlinesNorm) || rawKlinesNorm.length === 0)
                return null;
              const { closes, rawKlines: klines3m } =
                parseKlines(rawKlinesNorm);

              // ── 5m klines: ROC only ───────────────────────────────────────
              let roc5m = 0;
              if (klines5mRes.ok) {
                const raw5mData: unknown = await klines5mRes.json();
                const raw5m = config.parseKlinesRaw(raw5mData);
                // Validate array before accessing any element
                if (Array.isArray(raw5m) && raw5m.length > 0) {
                  const { closes: closes5m } = parseKlines(raw5m);
                  roc5m = computeROC(closes5m);
                }
              }

              // ── 1h klines (48): Vol Chg% only ────────────────────────────
              // klines1h[0..23].quoteAssetVolume = previous 24h window
              // klines1h[24..47].quoteAssetVolume = current 24h window
              let volumeChangePct: number | null = null;
              if (klines1hRes.ok) {
                const raw1hData: unknown = await klines1hRes.json();
                const raw1h = config.parseKlinesRaw(raw1hData);
                // Validate array before accessing any element
                if (Array.isArray(raw1h) && raw1h.length > 0) {
                  const { rawKlines: klines1h } = parseKlines(raw1h);
                  volumeChangePct = computeVolumeChangePct(klines1h);
                }
              }

              // ── Volatility from UTC-day 1d kline ─────────────────────
              // Uses the current UTC-day candle high/low (same window as TradingView).
              // Formula: (high - low) / low * 100
              // Falls back to rolling 24h ticker high/low only if 1d fetch fails.
              let volHigh = ticker.highPrice;
              let volLow = ticker.lowPrice;
              if (klines1dRes.ok) {
                const raw1dData: unknown = await klines1dRes.json();
                const raw1d = config.parseKlinesRaw(raw1dData);
                if (Array.isArray(raw1d) && raw1d.length > 0) {
                  // Take the last candle — that is the current UTC day
                  const lastCandle = raw1d[raw1d.length - 1] as number[];
                  const candleHigh = lastCandle[2]; // index 2 = high
                  const candleLow = lastCandle[3]; // index 3 = low
                  if (candleHigh > 0 && candleLow > 0) {
                    volHigh = candleHigh;
                    volLow = candleLow;
                  }
                }
              }
              const volatility = computeVolatility(volHigh, volLow);

              // ── Ticker-derived values ─────────────────────────────────────
              const price = ticker.lastPrice;
              // 24h Change % — directly from priceChangePercent, no recalculation
              const priceChange24h = ticker.priceChangePercent;
              // Volume 24h in USD — from quoteVolume
              const volume24h = ticker.quoteVolume;

              // ── Signal logic ──────────────────────────────────────────────
              const sma200 = computeSMA200(closes);
              const vwap = computeVWAP(klines3m);
              const rsi14 = computeRSI14(closes);
              const pctFromSma =
                sma200 > 0 ? ((price - sma200) / sma200) * 100 : 0;
              const pctFromVwap = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0;

              let signal: CoinData["signal"] = "NEUTRAL";
              if (price > sma200 && price > vwap) signal = "LONG";
              else if (price < sma200 && price < vwap) signal = "SHORT";

              // Use only the base symbol part for display (strip exchange suffixes)
              // Binance: BTCUSDT → BTCUSDT
              // BingX: BTC-USDT → BTCUSDT (for consistent display)
              // MEXC: BTC_USDT → BTCUSDT
              // Bitget: BTCUSDT_UMCBL → BTCUSDT
              const displaySymbol = ticker.symbol
                .replace(/_UMCBL$/, "") // Bitget
                .replace(/-/g, "") // BingX
                .replace(/_/g, ""); // MEXC

              return {
                symbol: displaySymbol,
                price,
                priceChange24h,
                volume24h,
                volatility,
                volumeChangePct,
                sma200,
                vwap,
                rsi14,
                roc5m,
                pctFromSma,
                pctFromVwap,
                signal,
                lastUpdated: new Date(),
              } as CoinData;
            } catch (coinErr: unknown) {
              // A single coin failure must never abort the entire batch.
              if (
                !(coinErr instanceof Error && coinErr.name === "AbortError")
              ) {
                console.warn(
                  `[useScreener] skipping ${ticker.symbol}:`,
                  coinErr instanceof Error ? coinErr.message : String(coinErr),
                );
              }
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

        // Determine inter-batch pause:
        // - If this batch hit a 429, use the elevated RATE_LIMIT_PAUSE for the next batch
        // - Otherwise apply the fixed steady-stream INTER_BATCH_PAUSE
        // After applying the elevated pause once, reset back to INTER_BATCH_PAUSE
        if (batchHit429) {
          anyBatchHadRateLimit = true;
          nextPause = RATE_LIMIT_PAUSE;
        } else {
          nextPause = INTER_BATCH_PAUSE;
        }

        if (i + BATCH_SIZE < filtered.length) {
          await sleep(nextPause);
        }
      }

      return {
        results,
        rateLimited: anyBatchHadRateLimit && results.length === 0,
      };
    },
    [],
  );

  const runScreener = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const abort = new AbortController();
    abortRef.current = abort;

    const currentExchange = exchangeRef.current;

    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
      progress: null,
    }));

    try {
      let { results, rateLimited } = await runScreenerOnce(
        abort,
        currentExchange,
      );

      // Auto-retry once if rate-limited and got 0 results
      if (results.length === 0 && rateLimited && !abort.signal.aborted) {
        setState((prev) => ({
          ...prev,
          error: "Rate limited — retrying in 3s...",
          progress: null,
        }));
        await sleep(3000);
        if (!abort.signal.aborted) {
          setState((prev) => ({
            ...prev,
            error: null,
            loading: true,
            progress: null,
          }));
          ({ results, rateLimited } = await runScreenerOnce(
            abort,
            currentExchange,
          ));
        }
      }

      if (!abort.signal.aborted) {
        if (results.length === 0) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: `Failed to load data: all coin requests failed. ${currentExchange.charAt(0).toUpperCase() + currentExchange.slice(1)} API may be rate-limiting. Please wait a moment and try again.`,
            progress: null,
          }));
          return;
        }
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
  }, [runScreenerOnce]);

  useEffect(() => {
    // Auto-load on startup is disabled. Use the Scan Now button to load data.
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ...state, refresh: runScreener };
}
