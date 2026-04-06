import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { Button, Group, NumberInput, Text } from '@mantine/core';
import { IconZoomReset } from '@tabler/icons-react';
import { ReactNode, useRef, useState } from 'react';
import { ActivityLogRow, Trade } from '../../models.ts';
import { getAskColor, getBidColor } from '../../utils/colors.ts';
import { SubmissionChart } from './SubmissionChart.tsx';

export interface SubmissionPriceChartProps {
  product: string;
  activityLogs: ActivityLogRow[];
  trades: Trade[];
}

// pointFormatter that shows "price (vol: N)" for bid/ask line series
function makePriceVolFormatter(label: string, color: string) {
  return function (this: any): string {
    const vol = this.point?.custom?.vol;
    const volPart = vol != null ? ` &nbsp;<span style="color:#adb5bd">vol ${vol}</span>` : '';
    return `<span style="color:${color}">●</span> ${label}: <b>${this.y}</b>${volPart}<br/>`;
  };
}

export function SubmissionPriceChart({ product, activityLogs, trades }: SubmissionPriceChartProps): ReactNode {
  const [minQty, setMinQty] = useState<number>(1);
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  const productLogs = activityLogs.filter(r => r.product === product);
  const productTrades = trades.filter(t => t.symbol === product && Math.abs(t.quantity) >= minQty);

  // ── Bid series (3 levels) ─────────────────────────────────────────────────
  const bidSeries: Highcharts.SeriesOptionsType[] = [
    {
      type: 'line',
      name: 'Bid 3',
      color: getBidColor(0.4),
      dashStyle: 'ShortDot',
      marker: { enabled: false },
      data: [],
      tooltip: { pointFormatter: makePriceVolFormatter('Bid 3', getBidColor(0.4)) },
    },
    {
      type: 'line',
      name: 'Bid 2',
      color: getBidColor(0.65),
      dashStyle: 'ShortDot',
      marker: { enabled: false },
      data: [],
      tooltip: { pointFormatter: makePriceVolFormatter('Bid 2', getBidColor(0.65)) },
    },
    {
      type: 'line',
      name: 'Bid 1',
      color: getBidColor(1.0),
      marker: { enabled: false },
      data: [],
      tooltip: { pointFormatter: makePriceVolFormatter('Bid 1', getBidColor(1.0)) },
    },
  ];

  const midSeries: Highcharts.SeriesOptionsType = {
    type: 'line',
    name: 'Mid',
    color: 'rgba(200,200,200,0.85)',
    dashStyle: 'Dash',
    lineWidth: 1.5,
    marker: { enabled: false },
    data: [],
  };

  // ── Ask series (3 levels) ─────────────────────────────────────────────────
  const askSeries: Highcharts.SeriesOptionsType[] = [
    {
      type: 'line',
      name: 'Ask 1',
      color: getAskColor(1.0),
      marker: { enabled: false },
      data: [],
      tooltip: { pointFormatter: makePriceVolFormatter('Ask 1', getAskColor(1.0)) },
    },
    {
      type: 'line',
      name: 'Ask 2',
      color: getAskColor(0.65),
      dashStyle: 'ShortDot',
      marker: { enabled: false },
      data: [],
      tooltip: { pointFormatter: makePriceVolFormatter('Ask 2', getAskColor(0.65)) },
    },
    {
      type: 'line',
      name: 'Ask 3',
      color: getAskColor(0.4),
      dashStyle: 'ShortDot',
      marker: { enabled: false },
      data: [],
      tooltip: { pointFormatter: makePriceVolFormatter('Ask 3', getAskColor(0.4)) },
    },
  ];

  // Fill line series — use point objects so we can attach custom.vol
  for (const row of productLogs) {
    for (let i = 0; i < row.bidPrices.length; i++) {
      (bidSeries[2 - i] as any).data.push({ x: row.timestamp, y: row.bidPrices[i], custom: { vol: row.bidVolumes[i] } });
    }
    (midSeries as any).data.push([row.timestamp, row.midPrice]);
    for (let i = 0; i < row.askPrices.length; i++) {
      (askSeries[i] as any).data.push({ x: row.timestamp, y: row.askPrices[i], custom: { vol: row.askVolumes[i] } });
    }
  }

  // ── Trade scatter series ──────────────────────────────────────────────────
  const ownBuyData: object[] = [];
  const ownSellData: object[] = [];
  const marketData: object[] = [];

  for (const t of productTrades) {
    const isOwn = t.buyer === 'SUBMISSION' || t.seller === 'SUBMISSION';
    const point = { x: t.timestamp, y: t.price, custom: { qty: t.quantity, buyer: t.buyer, seller: t.seller } };
    if (isOwn) {
      if (t.buyer === 'SUBMISSION') ownBuyData.push(point);
      else ownSellData.push(point);
    } else {
      marketData.push(point);
    }
  }

  const scatterPointFormatter = function (this: any): string {
    const { qty, buyer, seller } = this.point?.custom ?? {};
    const side = buyer === 'SUBMISSION' ? 'BUY' : seller === 'SUBMISSION' ? 'SELL' : 'MARKET';
    return `<span style="color:${this.color}">◆</span> <b>${side}</b> qty=${qty} @ ${this.y}<br/>`;
  };

  const series: Highcharts.SeriesOptionsType[] = [
    ...bidSeries,
    midSeries,
    ...askSeries,
    {
      type: 'scatter',
      name: `Market trades (qty≥${minQty})`,
      color: 'rgba(255, 200, 0, 0.9)',
      marker: { symbol: 'diamond', radius: 5 },
      data: marketData,
      dataGrouping: { enabled: false },
      enableMouseTracking: true,
      tooltip: { pointFormatter: scatterPointFormatter },
    } as Highcharts.SeriesOptionsType,
    {
      type: 'scatter',
      name: 'My buys',
      color: 'rgba(0, 220, 120, 1)',
      marker: { symbol: 'triangle', radius: 6 },
      data: ownBuyData,
      dataGrouping: { enabled: false },
      enableMouseTracking: true,
      tooltip: { pointFormatter: scatterPointFormatter },
    } as Highcharts.SeriesOptionsType,
    {
      type: 'scatter',
      name: 'My sells',
      color: 'rgba(255, 80, 80, 1)',
      marker: { symbol: 'triangle-down', radius: 6 },
      data: ownSellData,
      dataGrouping: { enabled: false },
      enableMouseTracking: true,
      tooltip: { pointFormatter: scatterPointFormatter },
    } as Highcharts.SeriesOptionsType,
  ];

  const handleResetZoom = () => {
    chartRef.current?.chart?.zoomOut();
  };

  return (
    <>
      <Group gap="xs" mb="xs" px="md" pt="md" justify="space-between">
        <Group gap="xs">
          <Text size="sm" fw={500}>
            Min trade size:
          </Text>
          <NumberInput
            size="xs"
            min={1}
            step={1}
            value={minQty}
            onChange={v => setMinQty(typeof v === 'number' ? Math.max(1, Math.floor(v)) : 1)}
            style={{ width: 80 }}
            aria-label="Minimum trade quantity filter"
          />
          <Text size="xs" c="dimmed">
            {productTrades.length} trade{productTrades.length !== 1 ? 's' : ''} shown
          </Text>
        </Group>
        <Button
          size="xs"
          variant="subtle"
          leftSection={<IconZoomReset size={14} />}
          onClick={handleResetZoom}
          mr="md"
        >
          Reset zoom
        </Button>
      </Group>
      <SubmissionChart title={`${product} — Price & Trades`} series={series} chartRef={chartRef} />
    </>
  );
}
