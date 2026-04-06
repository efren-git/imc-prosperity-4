import { ScrollArea, Table } from '@mantine/core';
import { ReactNode } from 'react';
import { Trade } from '../../models.ts';
import { formatNumber } from '../../utils/format.ts';
import { VisualizerCard } from '../visualizer/VisualizerCard.tsx';

interface SubmissionTradesTableProps {
  trades: Trade[];
  onTradeClick?: (trade: Trade) => void;
}

export function SubmissionTradesTable({ trades, onTradeClick }: SubmissionTradesTableProps): ReactNode {
  const sorted = [...trades].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <VisualizerCard title={`All Trades (${trades.length})`}>
      <ScrollArea h={320}>
        <Table striped highlightOnHover withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Timestamp</Table.Th>
              <Table.Th>Symbol</Table.Th>
              <Table.Th>Side</Table.Th>
              <Table.Th>Price</Table.Th>
              <Table.Th>Qty</Table.Th>
              <Table.Th>Buyer</Table.Th>
              <Table.Th>Seller</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((t, i) => {
              const isOwnBuy = t.buyer === 'SUBMISSION';
              const isOwnSell = t.seller === 'SUBMISSION';
              const side = isOwnBuy ? 'BUY' : isOwnSell ? 'SELL' : 'MARKET';
              const rowColor = isOwnBuy
                ? 'var(--mantine-color-green-9)'
                : isOwnSell
                  ? 'var(--mantine-color-red-9)'
                  : undefined;
              return (
                <Table.Tr
                  key={i}
                  style={{
                    ...(rowColor ? { backgroundColor: rowColor } : {}),
                    ...(onTradeClick ? { cursor: 'pointer' } : {}),
                  }}
                  onClick={onTradeClick ? () => onTradeClick(t) : undefined}
                >
                  <Table.Td>{formatNumber(t.timestamp)}</Table.Td>
                  <Table.Td>{t.symbol}</Table.Td>
                  <Table.Td fw={isOwnBuy || isOwnSell ? 600 : undefined}>{side}</Table.Td>
                  <Table.Td>{formatNumber(t.price)}</Table.Td>
                  <Table.Td>{t.quantity}</Table.Td>
                  <Table.Td>{t.buyer}</Table.Td>
                  <Table.Td>{t.seller}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </VisualizerCard>
  );
}
