/**
 * Rule-based comparison copy only. LLM / external API explanations are intentionally
 * out of scope here (user API keys, privacy, latency)—add in a separate change if needed.
 */
import { MonteCarloDashboard } from '../../models.ts';
import { meansAreComparableForStd } from './monteCarloCompareUtils.ts';
import { formatNumber } from '../../utils/format.ts';

export type InsightComparisonRow = { label: string; dashboard: MonteCarloDashboard };

function pctDiff(a: number, b: number): string {
  if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(b) < 1e-12) {
    return formatNumber(Math.abs(a - b), 1);
  }
  return formatNumber((Math.abs(a - b) / Math.abs(b)) * 100, 1);
}

/**
 * Deterministic bullets from loaded dashboards (no external API).
 */
export function buildMonteCarloComparisonInsights(rows: InsightComparisonRow[]): string[] {
  if (rows.length < 2) {
    return [];
  }

  const bullets: string[] = [];
  const byLabel = (i: number) => rows[i].label;
  const d = (i: number) => rows[i].dashboard;

  let bestMeanIdx = 0;
  let worstMeanIdx = 0;
  for (let i = 1; i < rows.length; i++) {
    if (d(i).overall.totalPnl.mean > d(bestMeanIdx).overall.totalPnl.mean) {
      bestMeanIdx = i;
    }
    if (d(i).overall.totalPnl.mean < d(worstMeanIdx).overall.totalPnl.mean) {
      worstMeanIdx = i;
    }
  }

  if (bestMeanIdx !== worstMeanIdx) {
    const hi = d(bestMeanIdx).overall.totalPnl;
    const lo = d(worstMeanIdx).overall.totalPnl;
    bullets.push(
      `${byLabel(bestMeanIdx)} has the highest mean total PnL (${formatNumber(hi.mean)} vs ${formatNumber(lo.mean)} for ${byLabel(worstMeanIdx)}).`,
    );

    if (hi.std > lo.std && lo.std > 1e-9) {
      bullets.push(
        `${byLabel(bestMeanIdx)} also has ~${pctDiff(hi.std, lo.std)}% higher total PnL volatility (1σ) than ${byLabel(worstMeanIdx)}—check whether the extra mean return justifies the wider spread.`,
      );
    } else if (hi.std < lo.std && hi.std > 1e-9) {
      bullets.push(
        `${byLabel(bestMeanIdx)} shows lower total PnL volatility than ${byLabel(worstMeanIdx)} while leading on mean PnL on this sample.`,
      );
    }
  }

  let bestP05Idx = 0;
  for (let i = 1; i < rows.length; i++) {
    if (d(i).overall.totalPnl.p05 > d(bestP05Idx).overall.totalPnl.p05) {
      bestP05Idx = i;
    }
  }
  if (bestP05Idx !== bestMeanIdx) {
    bullets.push(
      `${byLabel(bestP05Idx)} has the stronger downside (higher P05 total PnL). If you care about tail risk, compare it with the mean PnL leader (${byLabel(bestMeanIdx)}).`,
    );
  }

  const means = rows.map(r => r.dashboard.overall.totalPnl.mean);
  if (meansAreComparableForStd(means)) {
    let bestStdIdx = 0;
    for (let i = 1; i < rows.length; i++) {
      if (d(i).overall.totalPnl.std < d(bestStdIdx).overall.totalPnl.std) {
        bestStdIdx = i;
      }
    }
    bullets.push(
      `Mean total PnL is similar across runs (within ~5% scale), so ${byLabel(bestStdIdx)} has the lowest 1σ among comparable means—often preferable if means stay tied.`,
    );
  }

  bullets.push(
    'These notes are heuristic summaries of the Monte Carlo JSON, not trading advice. Iterate on strategy code and re-run with the same session counts for fair comparison.',
  );

  return bullets;
}
