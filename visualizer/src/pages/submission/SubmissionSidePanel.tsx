import { Slider, SliderProps, Stack, Text, Title } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { ReactNode } from 'react';
import { Algorithm } from '../../models.ts';
import { formatNumber } from '../../utils/format.ts';
import { OrderDepthTable } from '../visualizer/OrderDepthTable.tsx';
import { VisualizerCard } from '../visualizer/VisualizerCard.tsx';

interface SubmissionSidePanelProps {
  algorithm: Algorithm;
  selectedProduct: string;
  timestamp: number;
  onTimestampChange: (ts: number) => void;
}

export function SubmissionSidePanel({ algorithm, selectedProduct, timestamp, onTimestampChange }: SubmissionSidePanelProps): ReactNode {
  const data = algorithm.data;

  if (data.length === 0) {
    return null;
  }

  const timestampMin = data[0].state.timestamp;
  const timestampMax = data[data.length - 1].state.timestamp;
  const timestampStep = data.length > 1 ? data[1].state.timestamp - data[0].state.timestamp : 100;

  useHotkeys([
    ['ArrowLeft', () => onTimestampChange(timestamp <= timestampMin ? timestamp : timestamp - timestampStep)],
    ['ArrowRight', () => onTimestampChange(timestamp >= timestampMax ? timestamp : timestamp + timestampStep)],
  ]);

  // Index data by timestamp for O(1) lookup
  const rowsByTimestamp: Record<number, (typeof data)[0]> = {};
  for (const row of data) {
    rowsByTimestamp[row.state.timestamp] = row;
  }

  const marks: SliderProps['marks'] = [];
  for (let i = timestampMin; i <= timestampMax; i += (timestampMax - timestampMin) / 4) {
    marks.push({ value: Math.round(i / timestampStep) * timestampStep, label: formatNumber(Math.round(i / timestampStep) * timestampStep) });
  }

  const currentRow = rowsByTimestamp[timestamp];
  const orderDepth = currentRow?.state.orderDepths[selectedProduct];
  const position = currentRow?.state.position[selectedProduct] ?? 0;
  const orders = currentRow?.orders[selectedProduct] ?? [];

  return (
    <Stack gap="sm">
      <VisualizerCard>
        <Title order={6} mb="xs">
          Timestamp — {formatNumber(timestamp)}
        </Title>
        <Slider
          min={timestampMin}
          max={timestampMax}
          step={timestampStep}
          marks={marks}
          label={v => formatNumber(v)}
          value={timestamp}
          onChange={onTimestampChange}
          mb="xl"
        />
        <Text size="xs" c="dimmed">
          Use ← → arrow keys to step one tick at a time
        </Text>
      </VisualizerCard>

      <VisualizerCard title={`${selectedProduct} — Order Depth`}>
        {orderDepth ? (
          <OrderDepthTable orderDepth={orderDepth} />
        ) : (
          <Text size="sm" c="dimmed">
            No order depth at this timestamp
          </Text>
        )}
      </VisualizerCard>

      <VisualizerCard title="Position &amp; Orders">
        <Text size="sm">
          Position: <b>{formatNumber(position)}</b>
        </Text>
        {orders.length > 0 ? (
          <Stack gap={2} mt="xs">
            {orders.map((o, i) => (
              <Text key={i} size="sm" c={o.quantity > 0 ? 'green' : 'red'}>
                {o.quantity > 0 ? 'BUY' : 'SELL'} {Math.abs(o.quantity)} @ {formatNumber(o.price)}
              </Text>
            ))}
          </Stack>
        ) : (
          <Text size="xs" c="dimmed" mt={4}>
            No orders placed this tick
          </Text>
        )}
      </VisualizerCard>

      <VisualizerCard title="Trades this tick">
        {(() => {
          const ownTrades = currentRow?.state.ownTrades[selectedProduct] ?? [];
          const marketTrades = currentRow?.state.marketTrades[selectedProduct] ?? [];
          const allTickTrades = [...ownTrades, ...marketTrades];
          if (allTickTrades.length === 0) {
            return <Text size="xs" c="dimmed">No trades at this timestamp</Text>;
          }
          return (
            <Stack gap={2}>
              {allTickTrades.map((t, i) => {
                const isOwnBuy = t.buyer === 'SUBMISSION';
                const isOwnSell = t.seller === 'SUBMISSION';
                const color = isOwnBuy ? 'green' : isOwnSell ? 'red' : 'dimmed';
                const side = isOwnBuy ? 'BUY' : isOwnSell ? 'SELL' : 'MKT';
                return (
                  <Text key={i} size="sm" c={color}>
                    {side} {Math.abs(t.quantity)} @ {formatNumber(t.price)}
                    <Text span size="xs" c="dimmed"> ({t.buyer} → {t.seller})</Text>
                  </Text>
                );
              })}
            </Stack>
          );
        })()}
      </VisualizerCard>
    </Stack>
  );
}
