import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexPlotOptions,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
} from 'ng-apexcharts';

/**
 * Tüm grafiklerin ortak teması (DESIGN_SYSTEM.md §11).
 *
 * Ekranlar ApexCharts seçeneklerini elle yazmaz; `AppChartCard` bu fabrikaları
 * kullanır. Böylece renk, tipografi ve ızgara stili her grafikte aynı kalır.
 */

export type AppChartType =
  'line' | 'area' | 'bar' | 'donut' | 'radialBar' | 'heatmap' | 'rangeBar' | 'scatter';
export type AppChartSeries = ApexAxisChartSeries | ApexNonAxisChartSeries;

const FONT_FAMILY = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';

/*
 * ApexCharts renkleri JS değeri olarak ister; CSS değişkeni kabul etmez. Bu
 * yüzden token'lar çizim anında `<html>` üzerinden okunur. Sabit hex yazmak,
 * koyu temada ızgara ve eksen etiketlerinin okunmaz kalmasına yol açıyordu.
 *
 * Değerler her çağrıda okunur (önbelleğe alınmaz): tema değiştiğinde
 * `AppChartCard` seçenekleri yeniden hesaplar ve güncel renkleri alır.
 */
function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

const borderColor = () => token('--color-border', '#E5E7EB');
const labelColor = () => token('--color-text-secondary', '#6B7280');
const textColor = () => token('--color-text', '#111827');
const trackColor = () => token('--color-surface-muted', '#F3F4F6');

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

export function chartColors(): readonly string[] {
  return [
    token('--chart-1', '#4F46E5'),
    token('--chart-2', '#0EA5E9'),
    token('--chart-3', '#10B981'),
    token('--chart-4', '#F59E0B'),
    token('--chart-5', '#F43F5E'),
    token('--chart-6', '#8B5CF6'),
    token('--chart-7', '#14B8A6'),
    token('--chart-8', '#64748B'),
  ];
}

/** Ustalık ısı haritası aralıkları — düşükten yükseğe. */
export function heatRanges(): readonly {
  from: number;
  to: number;
  color: string;
  name: string;
}[] {
  return [
    { from: 0, to: 34, color: token('--heat-0', '#FEE2E2'), name: 'Kritik' },
    { from: 35, to: 49, color: token('--heat-1', '#FED7AA'), name: 'Zayıf' },
    { from: 50, to: 64, color: token('--heat-2', '#FEF08A'), name: 'Gelişiyor' },
    { from: 65, to: 79, color: token('--heat-3', '#BBF7D0'), name: 'Yeterli' },
    { from: 80, to: 100, color: token('--heat-5', '#22C55E'), name: 'Ustalaşmış' },
  ];
}

export function baseChart(type: AppChartType, height: number, sparkline = false): ApexChart {
  return {
    type: type === 'rangeBar' ? 'rangeBar' : type,
    height,
    fontFamily: FONT_FAMILY,
    toolbar: { show: false },
    zoom: { enabled: false },
    /*
     * Isı haritasında animasyon KAPALI.
     *
     * Hücreler genişliği 0'dan başlayarak animasyonla açılıyor; Angular'ın seri
     * girdisini yeniden yazması animasyonu iptal edince hücreler 0×0 donuyor ve
     * grafik bomboş görünüyordu. Matris görünümünde animasyonun anlatısal bir
     * katkısı da yok — değerler aynı anda okunur.
     */
    animations: { enabled: type !== 'heatmap', speed: 320 },
    sparkline: { enabled: sparkline },
    parentHeightOffset: 0,
  };
}

export function baseGrid(show = true): ApexGrid {
  return {
    show,
    borderColor: borderColor(),
    strokeDashArray: 4,
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true } },
    padding: { top: 0, right: 8, bottom: 0, left: 8 },
  };
}

export function baseStroke(type: AppChartType): ApexStroke {
  if (type === 'bar' || type === 'rangeBar' || type === 'heatmap') {
    return { show: true, width: 1, colors: ['transparent'] };
  }
  if (type === 'scatter') return { show: false };
  return { curve: 'smooth', width: type === 'area' ? 2 : 2.25, lineCap: 'round' };
}

/** Dağılım grafiğinde noktalar belirgin olmalı; diğer tiplerde varsayılan kullanılır. */
export function baseMarkers(type: AppChartType): { size: number; strokeWidth: number } {
  return type === 'scatter' ? { size: 5, strokeWidth: 0 } : { size: 0, strokeWidth: 2 };
}

export const BASE_DATA_LABELS: ApexDataLabels = { enabled: false };

export function baseLegend(show = true): ApexLegend {
  return {
    show,
    position: 'bottom',
    horizontalAlign: 'left',
    fontFamily: FONT_FAMILY,
    fontSize: '12px',
    labels: { colors: labelColor() },
    markers: { size: 5, shape: 'circle' },
    itemMargin: { horizontal: 10, vertical: 4 },
  };
}

export function baseXAxis(categories: readonly string[], numeric = false): ApexXAxis {
  return {
    ...(numeric ? { type: 'numeric' as const } : { categories: [...categories] }),
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: {
      style: { colors: labelColor(), fontSize: '12px', fontFamily: FONT_FAMILY },
      rotate: 0,
      hideOverlappingLabels: true,
    },
    tooltip: { enabled: false },
  };
}

/**
 * Y ekseni.
 *
 * Isı haritasında y ekseni KATEGORİKTİR: etiketler seri adlarıdır (kazanım
 * kodu). Sayısal biçimlendirici uygulanınca `Math.round("INS210.K3")` → `NaN`
 * oluyor ve eksende bir de sahte `0` çizgisi beliriyordu. Bu yüzden kategorik
 * eksende biçimlendirici hiç kurulmaz.
 */
export function baseYAxis(suffix = '', categorical = false): ApexYAxis {
  const style = { colors: labelColor(), fontSize: '12px', fontFamily: FONT_FAMILY };

  if (categorical) return { labels: { style } };

  return {
    labels: {
      style,
      formatter: (value: number) => `${Math.round(value)}${suffix}`,
    },
  };
}

/** İpucu kutusu da temayı izler; koyu sayfada beyaz kutu göz alıyordu. */
export function baseTooltip(): ApexTooltip {
  return {
    theme: isDarkTheme() ? 'dark' : 'light',
    style: { fontSize: '12px', fontFamily: FONT_FAMILY },
    marker: { show: true },
  };
}

/** Area grafiklerde yumuşak dolgu — panel görünümünü ağırlaştırmaz. */
export function areaFill(): ApexFill {
  return {
    type: 'gradient',
    gradient: {
      shadeIntensity: 1,
      opacityFrom: 0.28,
      opacityTo: 0.02,
      stops: [0, 100],
    },
  };
}

export function basePlotOptions(type: AppChartType, horizontal = false): ApexPlotOptions {
  switch (type) {
    case 'bar':
      return {
        bar: { horizontal, borderRadius: 4, borderRadiusApplication: 'end', columnWidth: '52%' },
      };

    case 'rangeBar':
      return { bar: { horizontal: true, borderRadius: 4, barHeight: '55%' } };

    case 'radialBar':
      return {
        radialBar: {
          hollow: { size: '62%' },
          track: { background: trackColor(), strokeWidth: '100%' },
          dataLabels: {
            name: { fontSize: '12px', color: labelColor(), offsetY: 22 },
            value: {
              fontSize: '24px',
              fontWeight: 650,
              color: textColor(),
              offsetY: -18,
              formatter: (value: number) => `%${Math.round(value)}`,
            },
          },
        },
      };

    case 'heatmap':
      return {
        heatmap: {
          radius: 4,
          enableShades: false,
          colorScale: { ranges: [...heatRanges()] },
        },
      };

    default:
      return {};
  }
}
