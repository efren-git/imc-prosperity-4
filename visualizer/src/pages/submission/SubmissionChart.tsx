/**
 * Like Chart.tsx but:
 * - No `immutable` prop → uses chart.update() on series changes, so zoom state is preserved
 *   when the trade-size filter changes.
 * - Exposes a ref so the parent can call chart.zoomOut() for the Reset Zoom button.
 * - Adds explicit resetZoomButton styling for both light and dark modes.
 * - Taller default height (500px) for inspecting individual timestamps.
 */
import Highcharts from 'highcharts/highstock';
import HighchartsMore from 'highcharts/highcharts-more';
import HighchartsAccessibility from 'highcharts/modules/accessibility';
import HighchartsExporting from 'highcharts/modules/exporting';
import HighchartsOfflineExporting from 'highcharts/modules/offline-exporting';
import HighchartsHighContrastDarkTheme from 'highcharts/themes/high-contrast-dark';
import HighchartsReact from 'highcharts-react-official';
import merge from 'lodash/merge';
import { ReactNode, Ref, useMemo } from 'react';
import { useActualColorScheme } from '../../hooks/use-actual-color-scheme.ts';
import { formatNumber } from '../../utils/format.ts';
import { VisualizerCard } from '../visualizer/VisualizerCard.tsx';

// Only register once (Chart.tsx already calls these globally, but guard is safe)
HighchartsAccessibility(Highcharts);
HighchartsExporting(Highcharts);
HighchartsOfflineExporting(Highcharts);
HighchartsMore(Highcharts);

function getThemeOptions(theme: (highcharts: typeof Highcharts) => void): Highcharts.Options {
  const highchartsMock = {
    _modules: {
      'Core/Globals.js': { theme: null },
      'Core/Defaults.js': { setOptions: () => {} },
    },
    win: { dispatchEvent: () => {} },
  };
  theme(highchartsMock as any);
  return highchartsMock._modules['Core/Globals.js'].theme! as Highcharts.Options;
}

export interface SubmissionChartProps {
  title: string;
  series: Highcharts.SeriesOptionsType[];
  options?: Highcharts.Options;
  chartRef?: Ref<HighchartsReact.RefObject>;
}

export function SubmissionChart({ title, series, options, chartRef }: SubmissionChartProps): ReactNode {
  const colorScheme = useActualColorScheme();
  const axisTextColor = colorScheme === 'dark' ? '#ffffff' : '#495057';
  const axisLineColor = colorScheme === 'dark' ? '#f1f3f5' : '#ced4da';
  const gridLineColor = colorScheme === 'dark' ? '#6c757d' : '#e9ecef';

  const fullOptions = useMemo((): Highcharts.Options => {
    const themeOptions = colorScheme === 'light' ? {} : getThemeOptions(HighchartsHighContrastDarkTheme);

    const chartOptions: Highcharts.Options = merge(
      {},
      {
        chart: {
          animation: false,
          height: 500,
          backgroundColor: 'transparent',
          plotBackgroundColor: 'transparent',
          zooming: {
            type: 'x',
            // Explicit styling so the button is visible in dark AND light mode
            resetButton: {
              theme: {
                fill: colorScheme === 'dark' ? '#373A40' : '#f8f9fa',
                stroke: colorScheme === 'dark' ? '#495057' : '#ced4da',
                r: 4,
                style: {
                  color: colorScheme === 'dark' ? '#C1C2C5' : '#495057',
                  fontWeight: '600',
                  fontSize: '12px',
                },
                states: {
                  hover: {
                    fill: colorScheme === 'dark' ? '#495057' : '#e9ecef',
                    stroke: colorScheme === 'dark' ? '#6c757d' : '#adb5bd',
                  },
                },
              },
            },
          },
          panning: { enabled: true, type: 'x' },
          panKey: 'shift',
          numberFormatter: formatNumber,
          events: {
            load(this: any) {
              Highcharts.addEvent(this.tooltip, 'headerFormatter', (e: any) => {
                if (e.isFooter) return true;
                let timestamp = e.labelConfig.point.x;
                if (e.labelConfig.point.dataGroup) {
                  const xData = e.labelConfig.series.xData;
                  const lastTimestamp = xData[xData.length - 1];
                  if (timestamp + 100 * e.labelConfig.point.dataGroup.length >= lastTimestamp) {
                    timestamp = lastTimestamp;
                  }
                }
                e.text = `Timestamp ${formatNumber(timestamp)}<br/>`;
                return false;
              });
            },
          },
        },
        title: {
          text: title,
          style: { color: colorScheme === 'dark' ? '#e9ecef' : '#212529' },
        },
        credits: {
          href: 'javascript:window.open("https://www.highcharts.com/?credits", "_blank")',
          style: { color: '#868e96' },
        },
        plotOptions: {
          series: {
            // Disable data grouping so individual 100ms ticks are visible when zoomed in
            dataGrouping: { enabled: false },
          },
        },
        xAxis: {
          type: 'datetime',
          title: {
            text: 'Timestamp',
            style: { color: axisTextColor, textOutline: 'none' },
          },
          crosshair: { width: 1, color: colorScheme === 'dark' ? '#adb5bd' : '#adb5bd' },
          gridLineColor,
          lineColor: axisLineColor,
          tickColor: axisLineColor,
          labels: {
            style: { color: axisTextColor, fontSize: '13px', fontWeight: '600', textOutline: 'none' },
            formatter: (params: Highcharts.AxisLabelsFormatterContextObject) =>
              formatNumber(params.value as number),
          },
        },
        yAxis: {
          opposite: false,
          allowDecimals: false,
          gridLineColor,
          lineColor: axisLineColor,
          tickColor: axisLineColor,
          title: { style: { color: axisTextColor, textOutline: 'none' } },
          labels: {
            style: { color: axisTextColor, fontSize: '13px', fontWeight: '600', textOutline: 'none' },
          },
        },
        tooltip: {
          split: false,
          shared: true,
          outside: true,
          backgroundColor: colorScheme === 'dark' ? '#1f2328' : '#ffffff',
          borderColor: colorScheme === 'dark' ? '#495057' : '#ced4da',
          style: { color: colorScheme === 'dark' ? '#f8f9fa' : '#212529' },
        },
        legend: {
          enabled: true,
          itemStyle: { color: colorScheme === 'dark' ? '#e9ecef' : '#212529' },
          itemHoverStyle: { color: colorScheme === 'dark' ? '#ffffff' : '#000000' },
          itemHiddenStyle: { color: colorScheme === 'dark' ? '#6c757d' : '#adb5bd' },
        },
        rangeSelector: { enabled: false },
        navigator: { enabled: false },
        scrollbar: { enabled: false },
        exporting: {
          buttons: {
            contextButton: {
              theme: {
                fill: colorScheme === 'dark' ? '#25262b' : '#ffffff',
                stroke: colorScheme === 'dark' ? '#495057' : '#ced4da',
              },
            },
          },
        },
        series,
      },
      options ?? {},
    );

    return merge(themeOptions, chartOptions);
  }, [axisLineColor, axisTextColor, colorScheme, gridLineColor, title, options, series]);

  return (
    <VisualizerCard p={0}>
      <HighchartsReact
        highcharts={Highcharts}
        constructorType="stockChart"
        options={fullOptions}
        ref={chartRef}
        // No `immutable` → uses chart.update() on series changes, preserving zoom state
      />
    </VisualizerCard>
  );
}
