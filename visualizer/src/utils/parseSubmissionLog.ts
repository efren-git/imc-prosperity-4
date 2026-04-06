import {
  ActivityLogRow,
  Algorithm,
  AlgorithmDataRow,
  Listing,
  Order,
  OrderDepth,
  ProsperitySymbol,
  Trade,
  TradingState,
} from '../models.ts';

// ──────────────────────────────────────────────────────────────────────────────
// Types matching the raw IMC submission JSON format
// ──────────────────────────────────────────────────────────────────────────────

interface RawTradeHistory {
  timestamp: number;
  buyer: string;
  seller: string;
  symbol: string;
  currency: string;
  price: number;
  quantity: number;
}

interface RawBuyOrder {
  BUYO: { p: number; s: string; v: number };
}

interface RawSellOrder {
  SELLO: { p: number; s: string; v: number };
}

type RawOrder = RawBuyOrder | RawSellOrder;

interface RawLambdaLog {
  GENERAL: {
    TIMESTAMP: number;
    POSITIONS: Record<string, number>;
  };
  ORDERS: RawOrder[];
  [product: string]: unknown;
}

interface RawLogEntry {
  timestamp: number;
  sandboxLog: string;
  lambdaLog: string;
}

// Shape of 50088.log (submissionId present)
export interface RawSubmissionLog {
  submissionId: string;
  activitiesLog: string;
  logs: RawLogEntry[];
  tradeHistory: RawTradeHistory[];
}

// Shape of 50088.json (no submissionId, has round/status/profit)
export interface RawSubmissionJson {
  round: number | string;
  status: string;
  profit: number;
  activitiesLog: string;
  graphLog: string;
  positions: { symbol: string; quantity: number }[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Activity log CSV parsing (same semicolon format as the text-based parser)
// ──────────────────────────────────────────────────────────────────────────────

function getColumnValues(columns: string[], indices: number[]): number[] {
  const values: number[] = [];
  for (const index of indices) {
    const value = columns[index];
    if (value !== '') {
      values.push(parseFloat(value));
    }
  }
  return values;
}

function parseActivityLogCsv(csv: string): ActivityLogRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const rows: ActivityLogRow[] = [];

  // Skip header row
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const columns = line.split(';');
    rows.push({
      day: Number(columns[0]),
      timestamp: Number(columns[1]),
      product: columns[2],
      bidPrices: getColumnValues(columns, [3, 5, 7]),
      bidVolumes: getColumnValues(columns, [4, 6, 8]),
      askPrices: getColumnValues(columns, [9, 11, 13]),
      askVolumes: getColumnValues(columns, [10, 12, 14]),
      midPrice: Number(columns[15]),
      profitLoss: Number(columns[16]),
    });
  }

  return rows;
}

// ──────────────────────────────────────────────────────────────────────────────
// Order depth reconstruction from activity log rows at a given timestamp
// ──────────────────────────────────────────────────────────────────────────────

function buildOrderDepths(
  activityRows: ActivityLogRow[],
): Record<ProsperitySymbol, OrderDepth> {
  const depths: Record<ProsperitySymbol, OrderDepth> = {};

  for (const row of activityRows) {
    const buyOrders: Record<number, number> = {};
    const sellOrders: Record<number, number> = {};

    for (let i = 0; i < row.bidPrices.length; i++) {
      buyOrders[row.bidPrices[i]] = row.bidVolumes[i];
    }
    for (let i = 0; i < row.askPrices.length; i++) {
      // sell orders stored as negative quantities by convention
      sellOrders[row.askPrices[i]] = -row.askVolumes[i];
    }

    depths[row.product] = { buyOrders, sellOrders };
  }

  return depths;
}

// ──────────────────────────────────────────────────────────────────────────────
// Listings from activity rows
// ──────────────────────────────────────────────────────────────────────────────

function buildListings(
  activityRows: ActivityLogRow[],
): Record<ProsperitySymbol, Listing> {
  const listings: Record<ProsperitySymbol, Listing> = {};
  for (const row of activityRows) {
    listings[row.product] = {
      symbol: row.product,
      product: row.product,
      denomination: 'XIRECS',
    };
  }
  return listings;
}

// ──────────────────────────────────────────────────────────────────────────────
// Parse ORDERS array from lambdaLog into the orders record
// ──────────────────────────────────────────────────────────────────────────────

function parseOrders(rawOrders: RawOrder[]): Record<ProsperitySymbol, Order[]> {
  const orders: Record<ProsperitySymbol, Order[]> = {};

  for (const rawOrder of rawOrders) {
    let symbol: string;
    let price: number;
    let quantity: number;

    if ('BUYO' in rawOrder) {
      symbol = rawOrder.BUYO.s;
      price = rawOrder.BUYO.p;
      quantity = rawOrder.BUYO.v; // positive = buy
    } else {
      symbol = rawOrder.SELLO.s;
      price = rawOrder.SELLO.p;
      quantity = -rawOrder.SELLO.v; // negative = sell
    }

    if (!orders[symbol]) {
      orders[symbol] = [];
    }
    orders[symbol].push({ symbol, price, quantity });
  }

  return orders;
}

// ──────────────────────────────────────────────────────────────────────────────
// Group tradeHistory by timestamp, split into own/market trades
// ──────────────────────────────────────────────────────────────────────────────

function buildTradesByTimestamp(tradeHistory: RawTradeHistory[]): {
  own: Map<number, Record<ProsperitySymbol, Trade[]>>;
  market: Map<number, Record<ProsperitySymbol, Trade[]>>;
} {
  const own = new Map<number, Record<ProsperitySymbol, Trade[]>>();
  const market = new Map<number, Record<ProsperitySymbol, Trade[]>>();

  for (const t of tradeHistory) {
    const isOwn = t.buyer === 'SUBMISSION' || t.seller === 'SUBMISSION';
    const map = isOwn ? own : market;

    if (!map.has(t.timestamp)) {
      map.set(t.timestamp, {});
    }
    const bySymbol = map.get(t.timestamp)!;
    if (!bySymbol[t.symbol]) {
      bySymbol[t.symbol] = [];
    }
    bySymbol[t.symbol].push({
      symbol: t.symbol,
      price: t.price,
      quantity: t.quantity,
      buyer: t.buyer,
      seller: t.seller,
      timestamp: t.timestamp,
    });
  }

  return { own, market };
}

// ──────────────────────────────────────────────────────────────────────────────
// Parse a full submission log (50088.log format) into Algorithm
// ──────────────────────────────────────────────────────────────────────────────

export function parseSubmissionLog(raw: RawSubmissionLog): Algorithm {
  const activityLogs = parseActivityLogCsv(raw.activitiesLog);

  // Index activityLogs by timestamp for fast lookup
  const activityByTimestamp = new Map<number, ActivityLogRow[]>();
  for (const row of activityLogs) {
    if (!activityByTimestamp.has(row.timestamp)) {
      activityByTimestamp.set(row.timestamp, []);
    }
    activityByTimestamp.get(row.timestamp)!.push(row);
  }

  const { own: ownByTs, market: marketByTs } = buildTradesByTimestamp(raw.tradeHistory);

  const data: AlgorithmDataRow[] = [];

  for (const entry of raw.logs) {
    const ts = entry.timestamp;
    const activityRows = activityByTimestamp.get(ts) ?? [];

    let lambdaData: RawLambdaLog | null = null;
    if (entry.lambdaLog) {
      try {
        lambdaData = JSON.parse(entry.lambdaLog) as RawLambdaLog;
      } catch {
        // ignore malformed lambdaLog
      }
    }

    const state: TradingState = {
      timestamp: ts,
      traderData: '',
      listings: buildListings(activityRows),
      orderDepths: buildOrderDepths(activityRows),
      ownTrades: ownByTs.get(ts) ?? {},
      marketTrades: marketByTs.get(ts) ?? {},
      position: lambdaData?.GENERAL.POSITIONS ?? {},
      observations: {
        plainValueObservations: {},
        conversionObservations: {},
      },
    };

    data.push({
      state,
      orders: lambdaData ? parseOrders((lambdaData.ORDERS as RawOrder[]) ?? []) : {},
      conversions: 0,
      traderData: '',
      algorithmLogs: '',
      sandboxLogs: entry.sandboxLog ?? '',
    });
  }

  return { activityLogs, data };
}

// ──────────────────────────────────────────────────────────────────────────────
// Parse submission JSON (50088.json format — no logs[], only activityLogs)
// ──────────────────────────────────────────────────────────────────────────────

export function parseSubmissionJson(raw: RawSubmissionJson): Algorithm {
  const activityLogs = parseActivityLogCsv(raw.activitiesLog);

  // Build minimal data rows from activityLogs (one row per unique timestamp)
  const activityByTimestamp = new Map<number, ActivityLogRow[]>();
  for (const row of activityLogs) {
    if (!activityByTimestamp.has(row.timestamp)) {
      activityByTimestamp.set(row.timestamp, []);
    }
    activityByTimestamp.get(row.timestamp)!.push(row);
  }

  const data: AlgorithmDataRow[] = [];
  const sortedTimestamps = [...activityByTimestamp.keys()].sort((a, b) => a - b);

  for (const ts of sortedTimestamps) {
    const activityRows = activityByTimestamp.get(ts)!;
    const state: TradingState = {
      timestamp: ts,
      traderData: '',
      listings: buildListings(activityRows),
      orderDepths: buildOrderDepths(activityRows),
      ownTrades: {},
      marketTrades: {},
      position: {},
      observations: {
        plainValueObservations: {},
        conversionObservations: {},
      },
    };

    data.push({
      state,
      orders: {},
      conversions: 0,
      traderData: '',
      algorithmLogs: '',
      sandboxLogs: '',
    });
  }

  return { activityLogs, data };
}

// ──────────────────────────────────────────────────────────────────────────────
// Type guards
// ──────────────────────────────────────────────────────────────────────────────

export function isRawSubmissionLog(obj: unknown): obj is RawSubmissionLog {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'submissionId' in obj &&
    'logs' in obj &&
    'tradeHistory' in obj
  );
}

export function isRawSubmissionJson(obj: unknown): obj is RawSubmissionJson {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'activitiesLog' in obj &&
    'graphLog' in obj &&
    !('submissionId' in obj) &&
    !('kind' in obj)
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// All market trades flattened — used by SubmissionPriceChart for overlays
// ──────────────────────────────────────────────────────────────────────────────

export function getAllTrades(algorithm: Algorithm): Trade[] {
  const seen = new Set<string>();
  const all: Trade[] = [];

  for (const row of algorithm.data) {
    for (const trades of Object.values(row.state.ownTrades)) {
      for (const t of trades) {
        const key = `${t.timestamp}-${t.symbol}-${t.price}-${t.quantity}-${t.buyer}-${t.seller}`;
        if (!seen.has(key)) {
          seen.add(key);
          all.push(t);
        }
      }
    }
    for (const trades of Object.values(row.state.marketTrades)) {
      for (const t of trades) {
        const key = `${t.timestamp}-${t.symbol}-${t.price}-${t.quantity}-${t.buyer}-${t.seller}`;
        if (!seen.has(key)) {
          seen.add(key);
          all.push(t);
        }
      }
    }
  }

  return all;
}
