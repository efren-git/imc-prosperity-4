import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import { ActionIcon, Badge, Button, Group, NumberInput, Select, Text } from '@mantine/core';
import { IconPlus, IconX, IconZoomReset } from '@tabler/icons-react';
import { ReactNode, useRef, useState } from 'react';
import { ActivityLogRow, Trade } from '../../models.ts';
import { getAskColor, getBidColor } from '../../utils/colors.ts';
import { SubmissionChart } from './SubmissionChart.tsx';

export interface SubmissionPriceChartProps {
  product: string;
  activityLogs: ActivityLogRow[];
  trades: Trade[];
  selectedTimestamp: number | null;
  onTimestampChange: (ts: number) => void;
}

// pointFormatter that shows "price (vol: N)" for bid/ask line series
function makePriceVolFormatter(label: string, color: string) {
  return function (this: any): string {
    const vol = this.point?.custom?.vol;
    const volPart = vol != null ? ` &nbsp;<span style="color:#adb5bd">vol ${vol}</span>` : '';
    return `<span style="color:${color}">●</span> ${label}: <b>${this.y}</b>${volPart}<br/>`;
  };
}

// ── Overlay types ─────────────────────────────────────────────────────────────

type OverlayOp = '>=' | '<=' | '=';

interface Overlay {
  id: string;
  field: string;
  op: OverlayOp;
  value: number;
  color: string;
}

const OVERLAY_FIELDS = [
  { value: 'bid_vol_1', label: 'Bid vol 1' },
  { value: 'bid_vol_2', label: 'Bid vol 2' },
  { value: 'bid_vol_3', label: 'Bid vol 3' },
  { value: 'ask_vol_1', label: 'Ask vol 1' },
  { value: 'ask_vol_2', label: 'Ask vol 2' },
  { value: 'ask_vol_3', label: 'Ask vol 3' },
  { value: 'bid_price_1', label: 'Bid price 1' },
  { value: 'bid_price_2', label: 'Bid price 2' },
  { value: 'bid_price_3', label: 'Bid price 3' },
  { value: 'ask_price_1', label: 'Ask price 1' },
  { value: 'ask_price_2', label: 'Ask price 2' },
  { value: 'ask_price_3', label: 'Ask price 3' },
];

const OVERLAY_COLORS = ['#ff6b6b', '#ffa94d', '#a9e34b', '#4dabf7', '#da77f2', '#f783ac', '#74c0fc'];

function getFieldValue(row: ActivityLogRow, field: string): number | undefined {
  switch (field) {
    case 'bid_price_1': return row.bidPrices[0];
    case 'bid_price_2': return row.bidPrices[1];
    case 'bid_price_3': return row.bidPrices[2];
    case 'ask_price_1': return row.askPrices[0];
    case 'ask_price_2': return row.askPrices[1];
    case 'ask_price_3': return row.askPrices[2];
    case 'bid_vol_1': return row.bidVolumes[0];
    case 'bid_vol_2': return row.bidVolumes[1];
    case 'bid_vol_3': return row.bidVolumes[2];
    case 'ask_vol_1': return row.askVolumes[0];
    case 'ask_vol_2': return row.askVolumes[1];
    case 'ask_vol_3': return row.askVolumes[2];
    default: return undefined;
  }
}

function getPlotPrice(row: ActivityLogRow, field: string): number | undefined {
  if (field.startsWith('bid_vol_')) {
    const idx = parseInt(field.slice(-1)) - 1;
    return row.bidPrices[idx];
  }
  if (field.startsWith('ask_vol_')) {
    const idx = parseInt(field.slice(-1)) - 1;
    return row.askPrices[idx];
  }
  // For price fields, plot at the price itself
  return getFieldValue(row, field);
}

function matchesOp(val: number, op: OverlayOp, threshold: number): boolean {
  if (op === '>=') return val >= threshold;
  if (op === '<=') return val <= threshold;
  return val === threshold;
}

export function SubmissionPriceChart({ product, activityLogs, trades, selectedTimestamp, onTimestampChange }: SubmissionPriceChartProps): ReactNode {
  const [minQty, setMinQty] = useState<number>(1);
  const chartRef = useRef<HighchartsReact.RefObject>(null);

  // Overlay state
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [newField, setNewField] = useState<string>('bid_vol_1');
  const [newOp, setNewOp] = useState<OverlayOp>('>=');
  const [newValue, setNewValue] = useState<number>(1);

  const productLogs = activityLogs.filter(r => r.product === product);
  const productTrades = trades.filter(t => t.symbol === product && Math.abs(t.quantity) >= minQty);

  // Compute timestamp step for click snapping
  const timestampStep =
    productLogs.length > 1 ? productLogs[1].timestamp - productLogs[0].timestamp : 100;

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

  // ── Overlay scatter series ────────────────────────────────────────────────
  const overlaySeries: Highcharts.SeriesOptionsType[] = overlays.map(overlay => {
    const data: object[] = [];
    for (const row of productLogs) {
      const fieldVal = getFieldValue(row, overlay.field);
      if (fieldVal == null) continue;
      if (!matchesOp(fieldVal, overlay.op, overlay.value)) continue;
      const plotY = getPlotPrice(row, overlay.field);
      if (plotY == null) continue;
      data.push({ x: row.timestamp, y: plotY, custom: { fieldVal } });
    }
    const fieldLabel = OVERLAY_FIELDS.find(f => f.value === overlay.field)?.label ?? overlay.field;
    return {
      type: 'scatter',
      name: `${fieldLabel} ${overlay.op} ${overlay.value}`,
      color: overlay.color,
      marker: { symbol: 'circle', radius: 4 },
      data,
      dataGrouping: { enabled: false },
      enableMouseTracking: true,
      tooltip: {
        pointFormatter: function (this: any): string {
          return `<span style="color:${this.color}">●</span> <b>${fieldLabel}</b>=${this.point?.custom?.fieldVal} @ ${this.y}<br/>`;
        },
      },
    } as Highcharts.SeriesOptionsType;
  });

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
    ...overlaySeries,
  ];

  const handleResetZoom = () => {
    chartRef.current?.chart?.zoomOut();
  };

  const handleAddOverlay = () => {
    const color = OVERLAY_COLORS[overlays.length % OVERLAY_COLORS.length];
    setOverlays(prev => [...prev, { id: `${Date.now()}`, field: newField, op: newOp, value: newValue, color }]);
  };

  const handleRemoveOverlay = (id: string) => {
    setOverlays(prev => prev.filter(o => o.id !== id));
  };

  // Shared click handler — snaps to nearest tick
  const handleXClick = (x: number) => {
    onTimestampChange(Math.round(x / timestampStep) * timestampStep);
  };

  // Chart click → update selected timestamp
  const chartOptions: Highcharts.Options = {
    xAxis: {
      plotLines: selectedTimestamp != null
        ? [{
            value: selectedTimestamp,
            color: '#868e96',
            dashStyle: 'ShortDash',
            width: 1,
            zIndex: 5,
          }]
        : [],
    },
    chart: {
      events: {
        click(e: any) {
          const x = e.xAxis?.[0]?.value;
          if (x != null) handleXClick(x);
        },
      },
    },
    plotOptions: {
      series: {
        cursor: 'pointer',
        point: {
          events: {
            click(this: any) {
              // Use the point's exact x (timestamp) rather than the click coordinate
              handleXClick(this.x);
            },
          },
        },
      },
    },
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

      {/* Overlay builder row */}
      <Group gap="xs" px="md" pb="xs" wrap="wrap">
        <Text size="sm" fw={500}>
          Overlay:
        </Text>
        <Select
          size="xs"
          value={newField}
          onChange={v => setNewField(v ?? 'bid_vol_1')}
          data={OVERLAY_FIELDS}
          style={{ width: 130 }}
        />
        <Select
          size="xs"
          value={newOp}
          onChange={v => setNewOp((v as OverlayOp) ?? '>=')}
          data={[
            { value: '>=', label: '>=' },
            { value: '<=', label: '<=' },
            { value: '=', label: '=' },
          ]}
          style={{ width: 70 }}
        />
        <NumberInput
          size="xs"
          value={newValue}
          onChange={v => setNewValue(typeof v === 'number' ? v : 1)}
          style={{ width: 80 }}
          aria-label="Overlay threshold value"
        />
        <Button size="xs" variant="light" leftSection={<IconPlus size={12} />} onClick={handleAddOverlay}>
          Add
        </Button>
        {overlays.map(o => {
          const label = OVERLAY_FIELDS.find(f => f.value === o.field)?.label ?? o.field;
          return (
            <Badge
              key={o.id}
              color="gray"
              variant="outline"
              style={{ borderColor: o.color, color: o.color }}
              rightSection={
                <ActionIcon size={12} variant="transparent" onClick={() => handleRemoveOverlay(o.id)} style={{ color: o.color }}>
                  <IconX size={10} />
                </ActionIcon>
              }
            >
              {label} {o.op} {o.value}
            </Badge>
          );
        })}
      </Group>

      <SubmissionChart title={`${product} — Price & Trades`} series={series} chartRef={chartRef} options={chartOptions} />
    </>
  );
}
