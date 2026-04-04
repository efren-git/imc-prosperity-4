import { MonteCarloDashboard } from '../../models.ts';

export type CompareDirection = 'higher' | 'lower' | 'neutral';

export interface ComparisonMetricRowDef {
  id: string;
  label: string;
  getValue: (d: MonteCarloDashboard) => number;
  /** `std_conditional`: lower std wins only when run means are close (see plan). */
  direction: CompareDirection | 'std_conditional';
}

export const COMPARISON_METRICS: ComparisonMetricRowDef[] = [
  {
    id: 'meanTotalPnl',
    label: 'Mean total PnL',
    getValue: d => d.overall.totalPnl.mean,
    direction: 'higher',
  },
  {
    id: 'stdTotalPnl',
    label: 'Total PnL 1σ',
    getValue: d => d.overall.totalPnl.std,
    direction: 'std_conditional',
  },
  {
    id: 'p05',
    label: 'P05 total PnL',
    getValue: d => d.overall.totalPnl.p05,
    direction: 'higher',
  },
  {
    id: 'p50',
    label: 'Median total PnL',
    getValue: d => d.overall.totalPnl.p50,
    direction: 'higher',
  },
  {
    id: 'p95',
    label: 'P95 total PnL',
    getValue: d => d.overall.totalPnl.p95,
    direction: 'higher',
  },
  {
    id: 'profitability',
    label: 'Profitability (total, mean)',
    getValue: d => d.trendFits.TOTAL.profitability.mean,
    direction: 'higher',
  },
  {
    id: 'stability',
    label: 'Stability (total, mean R²)',
    getValue: d => d.trendFits.TOTAL.stability.mean,
    direction: 'higher',
  },
  {
    id: 'emeraldMeanPnl',
    label: 'EMERALDS mean PnL',
    getValue: d => d.products.EMERALDS.pnl.mean,
    direction: 'higher',
  },
  {
    id: 'tomatoMeanPnl',
    label: 'TOMATOES mean PnL',
    getValue: d => d.products.TOMATOES.pnl.mean,
    direction: 'higher',
  },
];

/** If relative spread of means across runs is below this, std row uses lower-is-better. */
const STD_MEAN_SPREAD_FRAC = 0.05;

export function meansAreComparableForStd(means: number[]): boolean {
  if (means.length < 2) {
    return false;
  }
  const minM = Math.min(...means);
  const maxM = Math.max(...means);
  const scale = Math.max(Math.abs(minM), Math.abs(maxM), 1);
  return (maxM - minM) / scale <= STD_MEAN_SPREAD_FRAC;
}

export function effectiveDirection(
  def: ComparisonMetricRowDef,
  totalPnlMeans: number[],
): CompareDirection {
  if (def.direction !== 'std_conditional') {
    return def.direction;
  }
  return meansAreComparableForStd(totalPnlMeans) ? 'lower' : 'neutral';
}

export function rowBestWorstKeys(
  runKeys: string[],
  values: number[],
  direction: CompareDirection,
): { bestKeys: Set<string>; worstKeys: Set<string> } {
  const bestKeys = new Set<string>();
  const worstKeys = new Set<string>();
  if (runKeys.length === 0 || direction === 'neutral') {
    return { bestKeys, worstKeys };
  }

  const pairs = runKeys.map((key, i) => ({ key, v: values[i] })).filter(p => Number.isFinite(p.v));
  if (pairs.length === 0) {
    return { bestKeys, worstKeys };
  }

  const nums = pairs.map(p => p.v);
  const extreme = direction === 'higher' ? Math.max(...nums) : Math.min(...nums);
  const anti = direction === 'higher' ? Math.min(...nums) : Math.max(...nums);

  const eps = 1e-9 * (Math.abs(extreme) + 1);
  for (const p of pairs) {
    if (Math.abs(p.v - extreme) <= eps) {
      bestKeys.add(p.key);
    }
    if (Math.abs(p.v - anti) <= eps && anti !== extreme) {
      worstKeys.add(p.key);
    }
  }
  if (bestKeys.size === runKeys.length) {
    worstKeys.clear();
  }
  return { bestKeys, worstKeys };
}

export function countMetricWins(
  runKeys: string[],
  dashboardsByKey: Map<string, MonteCarloDashboard>,
): Map<string, number> {
  const wins = new Map<string, number>();
  for (const k of runKeys) {
    wins.set(k, 0);
  }

  const means = runKeys.map(k => dashboardsByKey.get(k)!.overall.totalPnl.mean);

  for (const def of COMPARISON_METRICS) {
    const direction = effectiveDirection(def, means);
    if (direction === 'neutral') {
      continue;
    }
    const values = runKeys.map(k => def.getValue(dashboardsByKey.get(k)!));
    const { bestKeys } = rowBestWorstKeys(runKeys, values, direction);
    for (const k of bestKeys) {
      wins.set(k, (wins.get(k) ?? 0) + 1);
    }
  }

  return wins;
}

/** Fixed weights for a heuristic composite (higher z contribution = better). */
const Z_WEIGHTS: Record<string, number> = {
  meanTotalPnl: 0.35,
  p05: 0.15,
  p50: 0.1,
  p95: 0.1,
  profitability: 0.15,
  stability: 0.1,
  emeraldMeanPnl: 0.025,
  tomatoMeanPnl: 0.025,
};

function rowZScores(values: number[]): number[] {
  const n = values.length;
  if (n < 2) {
    return values.map(() => 0);
  }
  const m = values.reduce((a, b) => a + b, 0) / n;
  const varr = values.reduce((s, v) => s + (v - m) ** 2, 0) / n;
  const s = Math.sqrt(varr) || 1e-12;
  return values.map(v => (v - m) / s);
}

export interface CompositeScoreRow {
  runKey: string;
  label: string;
  score: number;
}

export function computeCompositeScores(
  runKeys: string[],
  labelsByKey: Map<string, string>,
  dashboardsByKey: Map<string, MonteCarloDashboard>,
): CompositeScoreRow[] {
  const means = runKeys.map(k => dashboardsByKey.get(k)!.overall.totalPnl.mean);
  const comparableStd = meansAreComparableForStd(means);

  const scores = new Map<string, number>();
  for (const k of runKeys) {
    scores.set(k, 0);
  }

  for (const def of COMPARISON_METRICS) {
    const w = Z_WEIGHTS[def.id];
    if (w === undefined) {
      continue;
    }
    if (def.id === 'stdTotalPnl') {
      if (!comparableStd) {
        continue;
      }
      const values = runKeys.map(k => def.getValue(dashboardsByKey.get(k)!));
      const zs = rowZScores(values);
      runKeys.forEach((k, i) => {
        scores.set(k, (scores.get(k) ?? 0) - w * zs[i]);
      });
      continue;
    }

    const direction = effectiveDirection(def, means);
    if (direction === 'neutral') {
      continue;
    }

    const values = runKeys.map(k => def.getValue(dashboardsByKey.get(k)!));
    const zs = rowZScores(values);
    const sign = direction === 'higher' ? 1 : -1;
    runKeys.forEach((k, i) => {
      scores.set(k, (scores.get(k) ?? 0) + w * sign * zs[i]);
    });
  }

  return runKeys
    .map(runKey => ({
      runKey,
      label: labelsByKey.get(runKey) ?? runKey,
      score: scores.get(runKey) ?? 0,
    }))
    .sort((a, b) => b.score - a.score);
}
