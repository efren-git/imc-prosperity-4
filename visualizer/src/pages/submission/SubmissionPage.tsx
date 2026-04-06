import { ActionIcon, Container, Grid, Tabs, Title, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Trade } from '../../models.ts';
import { useStore } from '../../store.ts';
import { formatNumber } from '../../utils/format.ts';
import { getAllTrades } from '../../utils/parseSubmissionLog.ts';
import { ProfitLossChart } from '../visualizer/ProfitLossChart.tsx';
import { VisualizerCard } from '../visualizer/VisualizerCard.tsx';
import { SubmissionPriceChart } from './SubmissionPriceChart.tsx';
import { SubmissionSidePanel } from './SubmissionSidePanel.tsx';
import { SubmissionTradesTable } from './SubmissionTradesTable.tsx';
import { SubmissionUpload } from './SubmissionUpload.tsx';

export function SubmissionPage(): ReactNode {
  const algorithm = useStore(state => state.algorithm);
  const setAlgorithm = useStore(state => state.setAlgorithm);

  const [activeProduct, setActiveProduct] = useState<string | null>(null);
  const [selectedTimestamp, setSelectedTimestamp] = useState<number | null>(null);

  const products = useMemo(() => {
    if (!algorithm) return [];
    const seen = new Set<string>();
    for (const row of algorithm.activityLogs) seen.add(row.product);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [algorithm]);

  const allTrades = useMemo<Trade[]>(() => {
    if (!algorithm) return [];
    return getAllTrades(algorithm);
  }, [algorithm]);

  const finalPnl = useMemo(() => {
    if (!algorithm || algorithm.activityLogs.length === 0) return 0;
    const lastTs = algorithm.activityLogs[algorithm.activityLogs.length - 1].timestamp;
    return algorithm.activityLogs
      .filter(r => r.timestamp === lastTs)
      .reduce((acc, r) => acc + r.profitLoss, 0);
  }, [algorithm]);

  // Initialize selectedTimestamp when algorithm loads
  useEffect(() => {
    if (algorithm && algorithm.data.length > 0) {
      setSelectedTimestamp(algorithm.data[0].state.timestamp);
    } else {
      setSelectedTimestamp(null);
    }
  }, [algorithm]);

  const selectedProduct = activeProduct ?? products[0] ?? null;

  // Whether per-tick lambda data is actually present (not just empty shells)
  const hasLambdaData = useMemo(() => {
    if (!algorithm) return false;
    return algorithm.data.some(r => r.sandboxLogs || Object.keys(r.orders).length > 0);
  }, [algorithm]);

  if (!algorithm) {
    return (
      <Container size="md" pt="xl">
        <SubmissionUpload />
      </Container>
    );
  }

  return (
    <Container fluid py="md">
      <Grid>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <Grid.Col span={12}>
          <VisualizerCard>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Title order={3}>Submission Analysis — Final P/L: {formatNumber(finalPnl)}</Title>
              <Tooltip label="Load a different file">
                <ActionIcon variant="subtle" size="lg" onClick={() => setAlgorithm(null)} aria-label="Clear">
                  <IconRefresh size={20} />
                </ActionIcon>
              </Tooltip>
            </div>
          </VisualizerCard>
        </Grid.Col>

        {/* ── Product tabs ───────────────────────────────────────────────── */}
        <Grid.Col span={12}>
          <VisualizerCard p="xs">
            <Tabs value={selectedProduct} onChange={setActiveProduct}>
              <Tabs.List style={{ flexWrap: 'wrap' }}>
                {products.map(p => (
                  <Tabs.Tab key={p} value={p}>
                    {p}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs>
          </VisualizerCard>
        </Grid.Col>

        {/* ── Chart (left 8) + side panel (right 4) ──────────────────────── */}
        {selectedProduct && (
          <>
            <Grid.Col span={{ base: 12, md: 8 }}>
              <div style={{ border: '1px solid var(--mantine-color-dark-4)', borderRadius: 8, overflow: 'hidden' }}>
                <SubmissionPriceChart
                  product={selectedProduct}
                  activityLogs={algorithm.activityLogs}
                  trades={allTrades}
                  selectedTimestamp={selectedTimestamp}
                  onTimestampChange={setSelectedTimestamp}
                />
              </div>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 4 }}>
              {algorithm.data.length > 0 ? (
                <SubmissionSidePanel
                  algorithm={algorithm}
                  selectedProduct={selectedProduct}
                  timestamp={selectedTimestamp ?? algorithm.data[0].state.timestamp}
                  onTimestampChange={setSelectedTimestamp}
                />
              ) : (
                <VisualizerCard title="Order Depth">
                  <p style={{ color: 'var(--mantine-color-dimmed)' }}>
                    Load a .log file (not just .json) to see per-timestamp order depth and orders.
                  </p>
                </VisualizerCard>
              )}
            </Grid.Col>
          </>
        )}

        {/* ── P&L chart + load new file ───────────────────────────────────── */}
        <Grid.Col span={{ base: 12, md: 8 }}>
          <ProfitLossChart symbols={products} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <SubmissionUpload />
        </Grid.Col>

        {/* ── Trades table (always shown when trades exist) ───────────────── */}
        {allTrades.length > 0 && (
          <Grid.Col span={12}>
            <SubmissionTradesTable
              trades={allTrades}
              onTradeClick={t => {
                setSelectedTimestamp(t.timestamp);
                setActiveProduct(t.symbol);
              }}
            />
          </Grid.Col>
        )}

        {/* ── Full timestamp detail only when lambda data is present ──────── */}
        {hasLambdaData && (
          <Grid.Col span={12}>
            {/* TimestampsCard intentionally omitted — it targets the backtester format
                and shows empty/redundant info for submission logs. */}
          </Grid.Col>
        )}
      </Grid>
    </Container>
  );
}
