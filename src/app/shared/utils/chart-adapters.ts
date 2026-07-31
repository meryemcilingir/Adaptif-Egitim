import {
  CategoryValue,
  DistributionBucket,
  MatrixData,
  NamedSeries,
  TimeSeriesPoint,
} from '../../features/adaptive-learning/models/analytics.model';
import { AppChartSeries } from '../components/app-chart-card/chart-theme';

/**
 * Domain veri şekillerini ApexCharts serilerine çeviren tek katman.
 *
 * Ekranlar grafik kütüphanesinin veri biçimini bilmez; kütüphane değişirse
 * yalnızca bu dosya güncellenir (DIP + DRY).
 */

const DATE_FORMATTER = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

export function formatDateLabel(isoDate: string): string {
  const parsed = Date.parse(isoDate);
  return Number.isNaN(parsed) ? isoDate : DATE_FORMATTER.format(parsed);
}

/** Tek seriye sahip zaman grafiği (line/area). */
export function toTimeSeries(name: string, points: readonly TimeSeriesPoint[]): AppChartSeries {
  return [{ name, data: points.map((point) => point.value) }];
}

export function toTimeCategories(points: readonly TimeSeriesPoint[]): string[] {
  return points.map((point) => formatDateLabel(point.date));
}

/** Çoklu seri (ör. ders/cohort karşılaştırması). Kategoriler en uzun seriden alınır. */
export function toMultiSeries(series: readonly NamedSeries[]): AppChartSeries {
  return series.map((entry) => ({
    name: entry.name,
    data: entry.points.map((point) => point.value),
  }));
}

export function toMultiCategories(series: readonly NamedSeries[]): string[] {
  const longest = series.reduce<readonly TimeSeriesPoint[]>(
    (best, entry) => (entry.points.length > best.length ? entry.points : best),
    [],
  );
  return toTimeCategories(longest);
}

/** Kategorik değerler → tek seri bar/column grafiği. */
export function toBarSeries(name: string, values: readonly CategoryValue[]): AppChartSeries {
  return [{ name, data: values.map((entry) => entry.value) }];
}

export function toBarCategories(values: readonly CategoryValue[]): string[] {
  return values.map((entry) => entry.label);
}

/** Donut/pie grafiklerde seri düz sayı dizisidir; etiketler ayrı verilir. */
export function toDonutSeries(values: readonly CategoryValue[]): AppChartSeries {
  return values.map((entry) => entry.value);
}

export function toDistributionSeries(
  name: string,
  buckets: readonly DistributionBucket[],
): AppChartSeries {
  return [{ name, data: buckets.map((bucket) => bucket.count) }];
}

export function toDistributionCategories(buckets: readonly DistributionBucket[]): string[] {
  return buckets.map((bucket) => bucket.label);
}

/**
 * Matris → ApexCharts heatmap serisi.
 * Her satır bir seri, hücreler `{ x, y }` çiftleridir. Veri yoksa 0 gönderilir
 * (Apex `null` kabul etmez); örneklem bilgisi tooltip'te ayrıca sunulur.
 */
export function toHeatmapSeries(matrix: MatrixData): AppChartSeries {
  return matrix.rows.map((row) => ({
    name: row.label,
    data: matrix.columns.map((column) => {
      const cell = matrix.cells.find(
        (item) => item.rowId === row.id && item.columnLabel === column,
      );
      return { x: column, y: cell?.value ?? 0 };
    }),
  }));
}

/** Dağılım grafiği (zorluk × ayırt edicilik) için tek seri. */
export function toScatterSeries(
  name: string,
  points: readonly { readonly x: number; readonly y: number }[],
): AppChartSeries {
  return [{ name, data: points.map((point) => ({ x: point.x, y: point.y })) }];
}
