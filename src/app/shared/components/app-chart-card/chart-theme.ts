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

export const CHART_COLORS: readonly string[] = [
  '#4F46E5',
  '#0EA5E9',
  '#10B981',
  '#F59E0B',
  '#F43F5E',
  '#8B5CF6',
  '#14B8A6',
  '#64748B',
];

/** Ustalık ısı haritası aralıkları — düşükten yükseğe. */
export const HEAT_RANGES: readonly { from: number; to: number; color: string; name: string }[] = [
  { from: 0, to: 34, color: '#FEE2E2', name: 'Kritik' },
  { from: 35, to: 49, color: '#FED7AA', name: 'Zayıf' },
  { from: 50, to: 64, color: '#FEF08A', name: 'Gelişiyor' },
  { from: 65, to: 79, color: '#BBF7D0', name: 'Yeterli' },
  { from: 80, to: 100, color: '#22C55E', name: 'Ustalaşmış' },
];

const FONT_FAMILY = 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif';
const BORDER_COLOR = '#E5E7EB';
const LABEL_COLOR = '#6B7280';

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
    borderColor: BORDER_COLOR,
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
    labels: { colors: LABEL_COLOR },
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
      style: { colors: LABEL_COLOR, fontSize: '12px', fontFamily: FONT_FAMILY },
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
  const style = { colors: LABEL_COLOR, fontSize: '12px', fontFamily: FONT_FAMILY };

  if (categorical) return { labels: { style } };

  return {
    labels: {
      style,
      formatter: (value: number) => `${Math.round(value)}${suffix}`,
    },
  };
}

export const BASE_TOOLTIP: ApexTooltip = {
  theme: 'light',
  style: { fontSize: '12px', fontFamily: FONT_FAMILY },
  marker: { show: true },
};

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
          track: { background: '#F3F4F6', strokeWidth: '100%' },
          dataLabels: {
            name: { fontSize: '12px', color: LABEL_COLOR, offsetY: 22 },
            value: {
              fontSize: '24px',
              fontWeight: 650,
              color: '#111827',
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
          colorScale: { ranges: [...HEAT_RANGES] },
        },
      };

    default:
      return {};
  }
}
