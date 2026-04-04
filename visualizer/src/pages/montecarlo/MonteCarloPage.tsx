import {
  Affix,
  Badge,
  Container,
  Grid,
  Group,
  MultiSelect,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import axios from 'axios';
import Highcharts from 'highcharts';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MonteCarloDashboard } from '../../models.ts';
import { useStore } from '../../store.ts';
import { parseVisualizerInput } from '../../utils/algorithm.tsx';
import { formatNumber } from '../../utils/format.ts';
import { VisualizerCard } from '../visualizer/VisualizerCard.tsx';
import {
  buildBandChartSeries,
  distributionLineSeries,
  ErrorMonteCarloView,
  formatSlope,
  histogramSeries,
  lineSeries,
  LoadingMonteCarloView,
  MonteCarloRunComparisonRow,
  normalFitSeries,
  normalFitSeriesNamed,
  RunComparisonInsightsPanel,
  RunComparisonLeaderboard,
  RunComparisonTable,
  SessionRankingTable,
  SimpleChart,
  SummaryTable,
} from './MonteCarloComponents.tsx';
import { buildMonteCarloComparisonInsights } from './monteCarloInsights.ts';

const LATEST_RUN_VALUE = '__latest__';

const RUN_COMPARE_COLORS = ['#4c6ef5', '#12b886', '#fd7e14', '#be4bdb', '#fab005', '#15aabf', '#fa5252'];

function basename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() ?? path;
}

function withVersion(url: string, version: string | null): string {
  if (version === null || version.length === 0) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(version)}`;
}

type LocalRunInfo = {
  id: string;
  label: string;
  mtimeMs: number;
  dashboardUrl: string;
};

function resolveSelectedRuns(selectedIds: string[], runs: LocalRunInfo[]): LocalRunInfo[] {
  if (runs.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const out: LocalRunInfo[] = [];
  for (const sid of selectedIds) {
    const run = sid === LATEST_RUN_VALUE ? runs[0] : runs.find(r => r.id === sid);
    if (run !== undefined && !seen.has(run.id)) {
      seen.add(run.id);
      out.push(run);
    }
  }
  return out;
}

/** Stable string so we can avoid resetting React state when the poll returns identical runs. */
function runsListFingerprint(runs: LocalRunInfo[]): string {
  return runs.map(r => `${r.id}\0${r.mtimeMs}\0${r.dashboardUrl}`).join('\n');
}

function targetsFetchKey(targets: LocalRunInfo[]): string {
  return targets.map(t => `${t.id}\0${t.mtimeMs}\0${t.dashboardUrl}`).join('\n');
}

type LocalDashboardStatus = {
  dashboardExists: boolean;
  dashboardMtimeMs: number | null;
  dashboardSizeBytes: number | null;
  root: string;
  currentRunId?: string | null;
  runs?: LocalRunInfo[];
};

export type MonteCarloLoadedRun = {
  runKey: string;
  label: string;
  dashboard: MonteCarloDashboard;
};

function MonteCarloDetailHead({ dashboard }: { dashboard: MonteCarloDashboard }): ReactNode {
  const totalTrend = dashboard.trendFits.TOTAL;
  const emeraldTrend = dashboard.trendFits.EMERALDS;
  const tomatoTrend = dashboard.trendFits.TOMATOES;

  return (
    <>
      <Grid.Col span={{ base: 12, lg: 8 }}>
        <VisualizerCard title="Profitability And Statistics">
          <Table striped withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Metric</Table.Th>
                <Table.Th>Meaning</Table.Th>
                <Table.Th>Total</Table.Th>
                <Table.Th>EMERALDS</Table.Th>
                <Table.Th>TOMATOES</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>Profitability</Table.Td>
                <Table.Td>Mean fitted MTM slope in dollars per step.</Table.Td>
                <Table.Td>{formatSlope(totalTrend.profitability.mean)}</Table.Td>
                <Table.Td>{formatSlope(emeraldTrend.profitability.mean)}</Table.Td>
                <Table.Td>{formatSlope(tomatoTrend.profitability.mean)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Stability</Table.Td>
                <Table.Td>Mean linear-fit R². Higher means steadier PnL paths.</Table.Td>
                <Table.Td>{formatNumber(totalTrend.stability.mean, 3)}</Table.Td>
                <Table.Td>{formatNumber(emeraldTrend.stability.mean, 3)}</Table.Td>
                <Table.Td>{formatNumber(tomatoTrend.stability.mean, 3)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Profitability 1σ</Table.Td>
                <Table.Td>Cross-session spread of profitability.</Table.Td>
                <Table.Td>{formatSlope(totalTrend.profitability.std)}</Table.Td>
                <Table.Td>{formatSlope(emeraldTrend.profitability.std)}</Table.Td>
                <Table.Td>{formatSlope(tomatoTrend.profitability.std)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Stability 1σ</Table.Td>
                <Table.Td>Cross-session spread of stability.</Table.Td>
                <Table.Td>{formatNumber(totalTrend.stability.std, 3)}</Table.Td>
                <Table.Td>{formatNumber(emeraldTrend.stability.std, 3)}</Table.Td>
                <Table.Td>{formatNumber(tomatoTrend.stability.std, 3)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </VisualizerCard>
      </Grid.Col>

      <Grid.Col span={{ base: 12, lg: 4 }}>
        <VisualizerCard title="Fair Value Models">
          <Table withTableBorder withColumnBorders>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>EMERALDS</Table.Td>
                <Table.Td>
                  <Text fw={500}>{dashboard.generatorModel.EMERALDS.formula}</Text>
                  <Text size="sm" c="dimmed">
                    {dashboard.generatorModel.EMERALDS.notes[0]}
                  </Text>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>TOMATOES</Table.Td>
                <Table.Td>
                  <Text fw={500}>{dashboard.generatorModel.TOMATOES.formula}</Text>
                  <Text size="sm" c="dimmed">
                    {dashboard.generatorModel.TOMATOES.notes[0]}
                  </Text>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </VisualizerCard>
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 4 }}>
        <SummaryTable title="Total PnL Summary" stats={dashboard.overall.totalPnl} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 4 }}>
        <SummaryTable title="EMERALDS PnL Summary" stats={dashboard.products.EMERALDS.pnl} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 4 }}>
        <SummaryTable title="TOMATOES PnL Summary" stats={dashboard.products.TOMATOES.pnl} />
      </Grid.Col>
    </>
  );
}

function crossProductScatterSeries(dashboard: MonteCarloDashboard): Highcharts.SeriesOptionsType[] {
  const scatterFit = dashboard.scatterFit;
  return [
    {
      type: 'scatter',
      name: 'Sessions',
      color: '#4c6ef5',
      data: dashboard.sessions.map(row => [row.emeraldPnl, row.tomatoPnl]),
    },
    {
      type: 'line',
      name: 'Linear fit',
      color: '#fa5252',
      lineWidth: 2,
      data: scatterFit.line,
    },
  ];
}

function MonteCarloCrossProductScatter({ dashboard }: { dashboard: MonteCarloDashboard }): ReactNode {
  const scatterFit = dashboard.scatterFit;
  return (
    <Grid.Col span={{ base: 12, md: 6 }}>
      <SimpleChart
        title="Cross Product Scatter"
        subtitle={`corr ${formatNumber(scatterFit.correlation, 3)} · fit R² ${formatNumber(scatterFit.r2, 3)} · ${scatterFit.diagnosis}`}
        series={crossProductScatterSeries(dashboard)}
        options={{
          xAxis: { title: { text: 'EMERALDS pnl' } },
          yAxis: { title: { text: 'TOMATOES pnl' } },
        }}
      />
    </Grid.Col>
  );
}

function MonteCarloDetailTail({
  dashboard,
  bandProduct,
  setBandProduct,
}: {
  dashboard: MonteCarloDashboard;
  bandProduct: string;
  setBandProduct: (product: string) => void;
}): ReactNode {
  const selectedBandSeries = dashboard.bandSeries?.[bandProduct];
  const bandOptions = Object.keys(dashboard.bandSeries ?? {}).map(product => ({ value: product, label: product }));

  const profitabilitySeries: Highcharts.SeriesOptionsType[] = [
    distributionLineSeries(dashboard.histograms.totalProfitability, 'Total', '#4c6ef5'),
    distributionLineSeries(dashboard.histograms.emeraldProfitability, 'EMERALDS', '#12b886'),
    distributionLineSeries(dashboard.histograms.tomatoProfitability, 'TOMATOES', '#fd7e14'),
  ];
  const stabilitySeries: Highcharts.SeriesOptionsType[] = [
    distributionLineSeries(dashboard.histograms.totalStability, 'Total', '#4c6ef5'),
    distributionLineSeries(dashboard.histograms.emeraldStability, 'EMERALDS', '#12b886'),
    distributionLineSeries(dashboard.histograms.tomatoStability, 'TOMATOES', '#fd7e14'),
  ];

  return (
    <>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <SimpleChart
          title="Profitability Distribution"
          subtitle="Per-session fitted MTM slope in dollars per step"
          series={profitabilitySeries}
          options={{
            xAxis: {
              title: { text: '$ / step' },
              labels: {
                formatter(this: Highcharts.AxisLabelsFormatterContextObject) {
                  return formatNumber(Number(this.value), 4);
                },
              },
            },
            yAxis: { title: { text: 'Density proxy' } },
          }}
        />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <SimpleChart
          title="Stability Distribution"
          subtitle="Per-session linear-fit R²"
          series={stabilitySeries}
          options={{
            xAxis: {
              title: { text: 'R²' },
              labels: {
                formatter(this: Highcharts.AxisLabelsFormatterContextObject) {
                  return formatNumber(Number(this.value), 3);
                },
              },
            },
            yAxis: { title: { text: 'Density proxy' } },
          }}
        />
      </Grid.Col>

      <Grid.Col span={{ base: 12, md: 6 }}>
        <SessionRankingTable title="Best Sessions" rows={dashboard.topSessions} />
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 6 }}>
        <SessionRankingTable title="Worst Sessions" rows={dashboard.bottomSessions} />
      </Grid.Col>

      {selectedBandSeries && (
        <>
          <Grid.Col span={12}>
            <VisualizerCard title="Path Boards">
              <Group justify="space-between" align="center">
                <Text c="dimmed" size="sm">
                  Mean path with ±1σ and ±3σ bands across {dashboard.meta.bandSessionCount ?? dashboard.meta.sampleSessions}{' '}
                  sessions.
                </Text>
                <Select
                  w={220}
                  data={bandOptions}
                  value={bandProduct}
                  onChange={value => setBandProduct(value ?? 'EMERALDS')}
                  allowDeselect={false}
                />
              </Group>
            </VisualizerCard>
          </Grid.Col>
          <Grid.Col span={12}>
            <SimpleChart
              title={`${bandProduct} Fair Value`}
              series={buildBandChartSeries(selectedBandSeries.fair, bandProduct === 'EMERALDS' ? '#12b886' : '#fd7e14')}
              options={{
                xAxis: {
                  title: { text: 'Step' },
                },
                yAxis: { title: { text: 'Fair value' } },
              }}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <SimpleChart
              title={`${bandProduct} MTM PnL`}
              series={[
                ...buildBandChartSeries(selectedBandSeries.mtmPnl, bandProduct === 'EMERALDS' ? '#12b886' : '#fd7e14'),
                lineSeries('Zero', '#868e96', selectedBandSeries.mtmPnl.timestamps, selectedBandSeries.mtmPnl.timestamps.map(() => 0), 'ShortDash'),
              ]}
              options={{
                xAxis: {
                  title: { text: 'Step' },
                },
                yAxis: { title: { text: 'MTM pnl' } },
              }}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <SimpleChart
              title={`${bandProduct} Position`}
              series={[
                ...buildBandChartSeries(selectedBandSeries.position, bandProduct === 'EMERALDS' ? '#12b886' : '#fd7e14'),
                lineSeries('Zero', '#868e96', selectedBandSeries.position.timestamps, selectedBandSeries.position.timestamps.map(() => 0), 'ShortDash'),
              ]}
              options={{
                xAxis: {
                  title: { text: 'Step' },
                },
                yAxis: { title: { text: 'Position' } },
              }}
            />
          </Grid.Col>
        </>
      )}
    </>
  );
}

export function MonteCarloPage(): ReactNode {
  const storedDashboard = useStore(state => state.monteCarlo);
  const { search } = useLocation();
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [status, setStatus] = useState('Loading Monte Carlo dashboard');
  const [loadedRunEntries, setLoadedRunEntries] = useState<MonteCarloLoadedRun[] | null>(null);
  const [availableRuns, setAvailableRuns] = useState<LocalRunInfo[]>([]);
  const [selectedRunIds, setSelectedRunIds] = useState<string[]>([LATEST_RUN_VALUE]);
  const [bandProduct, setBandProduct] = useState('TOMATOES');
  const [detailRunKey, setDetailRunKey] = useState<string>('');
  const lastFetchedTargetsKeyRef = useRef<string | null>(null);

  const searchParams = new URLSearchParams(search);
  const explicitOpenUrl = searchParams.get('open');
  const localMode = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const localStatusUrl = localMode ? '/__prosperity4mcbt__/status.json' : null;
  const latestRun = availableRuns[0] ?? null;

  const storeEntries: MonteCarloLoadedRun[] | null =
    explicitOpenUrl === null && !localMode && storedDashboard !== null
      ? [
          {
            runKey: '_store',
            label: basename(storedDashboard.meta.algorithmPath),
            dashboard: storedDashboard,
          },
        ]
      : null;

  const displayEntries = storeEntries ?? loadedRunEntries;

  useEffect(() => {
    if (localStatusUrl === null || explicitOpenUrl !== null) {
      return;
    }

    let cancelled = false;

    const poll = async (): Promise<void> => {
      try {
        const response = await axios.get<LocalDashboardStatus>(localStatusUrl, {
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
          },
        });

        if (cancelled) {
          return;
        }

        const runs = response.data.runs ?? [];
        setAvailableRuns(previous => {
          if (runsListFingerprint(runs) === runsListFingerprint(previous)) {
            return previous;
          }
          return runs;
        });

        setSelectedRunIds(previous => {
          const filtered = previous.filter(id => id === LATEST_RUN_VALUE || runs.some(run => run.id === id));
          if (filtered.length === 0 && runs.length > 0) {
            return [LATEST_RUN_VALUE];
          }
          return filtered;
        });
      } catch {
        if (!cancelled) {
          setStatus('Waiting for local dashboard');
        }
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [explicitOpenUrl, localStatusUrl]);

  useEffect(() => {
    let cancelled = false;

    const fromStoreOnly = explicitOpenUrl === null && !localMode && storedDashboard !== null;
    if (fromStoreOnly) {
      return;
    }

    if (explicitOpenUrl !== null) {
      lastFetchedTargetsKeyRef.current = null;
      const url = withVersion(explicitOpenUrl, null);
      setLoadError(null);
      setLoadedRunEntries(null);
      setStatus('Fetching dashboard');

      const load = async (): Promise<void> => {
        try {
          const response = await axios.get(url, {
            headers: {
              'Cache-Control': 'no-cache',
              Pragma: 'no-cache',
            },
          });
          const parsed = parseVisualizerInput(response.data);

          if (cancelled) {
            return;
          }

          if (parsed.kind === 'monteCarlo') {
            setLoadedRunEntries([
              {
                runKey: '_open',
                label: basename(parsed.monteCarlo.meta.algorithmPath),
                dashboard: parsed.monteCarlo,
              },
            ]);
            setStatus('Dashboard loaded');
            return;
          }

          setLoadError(new Error('This visualizer build only supports Monte Carlo dashboard bundles.'));
        } catch (error) {
          if (!cancelled) {
            setLoadError(error as Error);
          }
        }
      };

      void load();

      return () => {
        cancelled = true;
      };
    }

    if (!localMode) {
      setLoadedRunEntries(null);
      return;
    }

    const targets = resolveSelectedRuns(selectedRunIds, availableRuns);
    if (targets.length === 0) {
      lastFetchedTargetsKeyRef.current = null;
      setLoadedRunEntries(null);
      return;
    }

    const targetsKey = targetsFetchKey(targets);
    if (lastFetchedTargetsKeyRef.current === targetsKey) {
      return;
    }

    setLoadError(null);
    setLoadedRunEntries(null);
    setStatus(targets.length > 1 ? 'Fetching dashboards' : 'Fetching dashboard');

    const load = async (): Promise<void> => {
      try {
        const responses = await Promise.all(
          targets.map(target =>
            axios.get(withVersion(target.dashboardUrl, String(target.mtimeMs)), {
              headers: {
                'Cache-Control': 'no-cache',
                Pragma: 'no-cache',
              },
            }),
          ),
        );

        if (cancelled) {
          return;
        }

        const nextEntries: MonteCarloLoadedRun[] = responses.map((response, index) => {
          const parsed = parseVisualizerInput(response.data);
          if (parsed.kind !== 'monteCarlo') {
            throw new Error('This visualizer build only supports Monte Carlo dashboard bundles.');
          }
          return {
            runKey: targets[index].id,
            label: targets[index].label,
            dashboard: parsed.monteCarlo,
          };
        });

        lastFetchedTargetsKeyRef.current = targetsKey;
        setLoadedRunEntries(nextEntries);
        setStatus('Dashboard loaded');
      } catch (error) {
        if (!cancelled) {
          lastFetchedTargetsKeyRef.current = null;
          setLoadError(error as Error);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [explicitOpenUrl, localMode, storedDashboard, selectedRunIds, availableRuns]);

  useEffect(() => {
    if (displayEntries === null || displayEntries.length === 0) {
      return;
    }
    if (detailRunKey === '' || !displayEntries.some(entry => entry.runKey === detailRunKey)) {
      setDetailRunKey(displayEntries[0].runKey);
    }
  }, [displayEntries, detailRunKey]);

  const activeDashboard =
    displayEntries?.find(entry => entry.runKey === detailRunKey)?.dashboard ?? displayEntries?.[0]?.dashboard ?? null;

  useEffect(() => {
    if (activeDashboard === null) {
      return;
    }
    if (activeDashboard.bandSeries?.[bandProduct] !== undefined) {
      return;
    }
    const keys = Object.keys(activeDashboard.bandSeries ?? {});
    if (keys.length > 0 && keys[0] !== undefined) {
      setBandProduct(keys[0]);
    }
  }, [activeDashboard, bandProduct]);

  const insightBullets = useMemo(() => {
    if (displayEntries === null || displayEntries.length < 2) {
      return [];
    }
    return buildMonteCarloComparisonInsights(
      displayEntries.map(entry => ({ label: entry.label, dashboard: entry.dashboard })),
    );
  }, [displayEntries]);

  const showLoading =
    displayEntries === null && loadError === null && (explicitOpenUrl !== null || localMode);

  if (loadError !== null) {
    return <ErrorMonteCarloView error={loadError} />;
  }

  if (showLoading || displayEntries === null || displayEntries.length === 0) {
    return <LoadingMonteCarloView status={status} />;
  }

  const entries = displayEntries;
  const compareRows: MonteCarloRunComparisonRow[] = entries.map(entry => ({
    key: entry.runKey,
    label: entry.label,
    dashboard: entry.dashboard,
  }));
  const isMultiCompare = entries.length > 1;
  const headerDashboard = entries[0].dashboard;
  const strategyName = basename(headerDashboard.meta.algorithmPath);

  const totalHistogramSeriesSingle: Highcharts.SeriesOptionsType[] = [
    histogramSeries(headerDashboard.histograms.totalPnl, 'Total PnL', '#4c6ef5'),
    normalFitSeries(headerDashboard.normalFits.totalPnl),
  ];
  const emeraldHistogramSeriesSingle: Highcharts.SeriesOptionsType[] = [
    histogramSeries(headerDashboard.histograms.emeraldPnl, 'EMERALDS PnL', '#12b886'),
    normalFitSeries(headerDashboard.normalFits.emeraldPnl),
  ];
  const tomatoHistogramSeriesSingle: Highcharts.SeriesOptionsType[] = [
    histogramSeries(headerDashboard.histograms.tomatoPnl, 'TOMATOES PnL', '#fd7e14'),
    normalFitSeries(headerDashboard.normalFits.tomatoPnl),
  ];

  const totalPnlCompareSeries: Highcharts.SeriesOptionsType[] = entries.map((entry, index) =>
    normalFitSeriesNamed(
      entry.dashboard.normalFits.totalPnl,
      entry.label,
      RUN_COMPARE_COLORS[index % RUN_COMPARE_COLORS.length],
    ),
  );
  const emeraldPnlCompareSeries: Highcharts.SeriesOptionsType[] = entries.map((entry, index) =>
    normalFitSeriesNamed(
      entry.dashboard.normalFits.emeraldPnl,
      entry.label,
      RUN_COMPARE_COLORS[index % RUN_COMPARE_COLORS.length],
    ),
  );
  const tomatoPnlCompareSeries: Highcharts.SeriesOptionsType[] = entries.map((entry, index) =>
    normalFitSeriesNamed(
      entry.dashboard.normalFits.tomatoPnl,
      entry.label,
      RUN_COMPARE_COLORS[index % RUN_COMPARE_COLORS.length],
    ),
  );

  return (
    <Container fluid py="md" pb={isMultiCompare ? 120 : 'md'}>
      <Grid>
        <Grid.Col span={12}>
          <VisualizerCard>
            <Group justify="space-between" align="flex-start">
              <div>
                <Title order={2}>Monte Carlo Results</Title>
                <Text c="dimmed">
                  {isMultiCompare
                    ? `Comparing ${entries.length} runs (badges reflect the first selected run; use the sticky tabs or bottom bar for per-run detail)`
                    : strategyName}
                </Text>
              </div>
              <Group gap="xs" align="flex-start">
                {explicitOpenUrl === null && localMode && availableRuns.length > 0 && (
                  <MultiSelect
                    w={320}
                    label="Runs"
                    description="Pick two or more runs to show the comparison table and overlaid PnL charts."
                    placeholder="Select runs"
                    value={selectedRunIds}
                    onChange={values => {
                      if (values.length === 0 && availableRuns.length > 0) {
                        setSelectedRunIds([LATEST_RUN_VALUE]);
                        return;
                      }
                      setSelectedRunIds(values);
                    }}
                    data={[
                      {
                        value: LATEST_RUN_VALUE,
                        label: `Latest (${latestRun?.label ?? 'none'})`,
                      },
                      ...availableRuns.map(run => ({
                        value: run.id,
                        label: run.label,
                      })),
                    ]}
                  />
                )}
                <Badge variant="light">{headerDashboard.meta.sessionCount} sessions</Badge>
                <Badge variant="light">{headerDashboard.meta.bandSessionCount ?? headerDashboard.meta.sampleSessions} path traces</Badge>
                <Badge variant="light">{headerDashboard.meta.fvMode}</Badge>
                <Badge variant="light">{headerDashboard.meta.tradeMode}</Badge>
              </Group>
            </Group>
          </VisualizerCard>
        </Grid.Col>

        {isMultiCompare && (
          <Grid.Col span={12}>
            <Grid>
              <Grid.Col span={{ base: 12, lg: 8 }}>
                <RunComparisonTable rows={compareRows} />
              </Grid.Col>
              <Grid.Col span={{ base: 12, lg: 4 }}>
                <Stack gap="md">
                  <RunComparisonLeaderboard rows={compareRows} />
                  <RunComparisonInsightsPanel bullets={insightBullets} />
                </Stack>
              </Grid.Col>
            </Grid>
          </Grid.Col>
        )}

        {!isMultiCompare && (
          <>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <VisualizerCard title="Mean Total PnL">
                <Title order={2}>{formatNumber(headerDashboard.overall.totalPnl.mean)}</Title>
                <Text c="dimmed" size="sm">
                  95% mean CI {formatNumber(headerDashboard.overall.totalPnl.meanConfidenceLow95)} to{' '}
                  {formatNumber(headerDashboard.overall.totalPnl.meanConfidenceHigh95)}
                </Text>
              </VisualizerCard>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <VisualizerCard title="Total PnL 1σ">
                <Title order={2}>{formatNumber(headerDashboard.overall.totalPnl.std)}</Title>
                <Text c="dimmed" size="sm">
                  P05 {formatNumber(headerDashboard.overall.totalPnl.p05)} · P95 {formatNumber(headerDashboard.overall.totalPnl.p95)}
                </Text>
              </VisualizerCard>
            </Grid.Col>
            <MonteCarloDetailHead dashboard={headerDashboard} />
          </>
        )}

        {isMultiCompare ? (
          <>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <SimpleChart
                title="Total PnL Distribution"
                subtitle="Overlaid normal fits (backend fit grid per run)"
                series={totalPnlCompareSeries}
                options={{
                  xAxis: { title: { text: 'Final total pnl' } },
                  yAxis: { title: { text: 'Fitted density' } },
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <SimpleChart
                title="EMERALDS PnL Distribution"
                subtitle="Overlaid normal fits"
                series={emeraldPnlCompareSeries}
                options={{
                  xAxis: { title: { text: 'EMERALDS final pnl' } },
                  yAxis: { title: { text: 'Fitted density' } },
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <SimpleChart
                title="TOMATOES PnL Distribution"
                subtitle="Overlaid normal fits"
                series={tomatoPnlCompareSeries}
                options={{
                  xAxis: { title: { text: 'TOMATOES final pnl' } },
                  yAxis: { title: { text: 'Fitted density' } },
                }}
              />
            </Grid.Col>
          </>
        ) : (
          <>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <SimpleChart
                title="Total PnL Distribution"
                subtitle={`Normal fit μ ${formatNumber(headerDashboard.normalFits.totalPnl.mean)} · σ ${formatNumber(headerDashboard.normalFits.totalPnl.std)} · R² ${formatNumber(headerDashboard.normalFits.totalPnl.r2, 3)}`}
                series={totalHistogramSeriesSingle}
                options={{
                  xAxis: { title: { text: 'Final total pnl' } },
                  yAxis: { title: { text: 'Session count' } },
                }}
              />
            </Grid.Col>
            <MonteCarloCrossProductScatter dashboard={headerDashboard} />
            <Grid.Col span={{ base: 12, md: 6 }}>
              <SimpleChart
                title="EMERALDS PnL Distribution"
                subtitle={`Normal fit μ ${formatNumber(headerDashboard.normalFits.emeraldPnl.mean)} · σ ${formatNumber(headerDashboard.normalFits.emeraldPnl.std)} · R² ${formatNumber(headerDashboard.normalFits.emeraldPnl.r2, 3)}`}
                series={emeraldHistogramSeriesSingle}
                options={{
                  xAxis: { title: { text: 'EMERALDS final pnl' } },
                  yAxis: { title: { text: 'Session count' } },
                }}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <SimpleChart
                title="TOMATOES PnL Distribution"
                subtitle={`Normal fit μ ${formatNumber(headerDashboard.normalFits.tomatoPnl.mean)} · σ ${formatNumber(headerDashboard.normalFits.tomatoPnl.std)} · R² ${formatNumber(headerDashboard.normalFits.tomatoPnl.r2, 3)}`}
                series={tomatoHistogramSeriesSingle}
                options={{
                  xAxis: { title: { text: 'TOMATOES final pnl' } },
                  yAxis: { title: { text: 'Session count' } },
                }}
              />
            </Grid.Col>
          </>
        )}

        {isMultiCompare ? (
          <Grid.Col span={12}>
            <Tabs value={detailRunKey} onChange={value => value !== null && setDetailRunKey(value)}>
              <Paper withBorder shadow="sm" radius="md" mb="md" p="xs" style={{ position: 'sticky', top: 0, zIndex: 40 }}>
                <Tabs.List grow>
                  {entries.map(entry => (
                    <Tabs.Tab key={entry.runKey} value={entry.runKey}>
                      {entry.label}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Paper>
              {entries.map(entry => (
                <Tabs.Panel key={entry.runKey} value={entry.runKey} pt="md">
                  <Grid>
                    <MonteCarloDetailHead dashboard={entry.dashboard} />
                    <MonteCarloCrossProductScatter dashboard={entry.dashboard} />
                    <MonteCarloDetailTail
                      dashboard={entry.dashboard}
                      bandProduct={bandProduct}
                      setBandProduct={setBandProduct}
                    />
                  </Grid>
                </Tabs.Panel>
              ))}
            </Tabs>
            <Affix position={{ bottom: 0, left: 0, right: 0 }} zIndex={100}>
              <Paper
                p="sm"
                radius={0}
                shadow="md"
                withBorder
                style={{
                  borderLeft: 0,
                  borderRight: 0,
                  borderBottom: 0,
                }}
              >
                <Group justify="center" wrap="wrap" gap="sm">
                  <Text size="sm" fw={600}>
                    Per-run detail
                  </Text>
                  <SegmentedControl
                    value={detailRunKey}
                    onChange={value => setDetailRunKey(value)}
                    data={entries.map(entry => ({
                      value: entry.runKey,
                      label: entry.label.length > 26 ? `${entry.label.slice(0, 24)}…` : entry.label,
                    }))}
                  />
                </Group>
              </Paper>
            </Affix>
          </Grid.Col>
        ) : (
          <MonteCarloDetailTail
            dashboard={entries[0].dashboard}
            bandProduct={bandProduct}
            setBandProduct={setBandProduct}
          />
        )}
      </Grid>
    </Container>
  );
}
