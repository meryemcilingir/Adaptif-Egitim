import { describe, expect, it } from 'vitest';

import {
  MatrixData,
  NamedSeries,
  TimeSeriesPoint,
} from '../../features/adaptive-learning/models/analytics.model';
import {
  toBarSeries,
  toDonutSeries,
  toHeatmapSeries,
  toMultiCategories,
  toMultiSeries,
  toTimeSeries,
} from './chart-adapters';

function point(date: string, value: number): TimeSeriesPoint {
  return { date, value, sampleSize: 1 };
}

describe('chart-adapters', () => {
  it('zaman serisini tek seriye çevirir', () => {
    const series = toTimeSeries('Başarı', [point('2026-07-01', 40), point('2026-07-02', 60)]);

    expect(series).toEqual([{ name: 'Başarı', data: [40, 60] }]);
  });

  it('kategorik değerleri tek bar serisine çevirir', () => {
    const series = toBarSeries('Adet', [
      { label: 'Kolay', value: 3 },
      { label: 'Zor', value: 7 },
    ]);

    expect(series).toEqual([{ name: 'Adet', data: [3, 7] }]);
  });

  it('donut serisini düz sayı dizisi olarak üretir', () => {
    expect(
      toDonutSeries([
        { label: 'A', value: 2 },
        { label: 'B', value: 5 },
      ]),
    ).toEqual([2, 5]);
  });

  it('çoklu seride kategori olarak en uzun seriyi kullanır', () => {
    const series: NamedSeries[] = [
      { name: 'MAT101', points: [point('2026-07-01', 10)] },
      { name: 'FIZ102', points: [point('2026-07-01', 20), point('2026-07-02', 30)] },
    ];

    expect(toMultiSeries(series)).toHaveLength(2);
    expect(toMultiCategories(series)).toHaveLength(2);
  });

  it('boş çoklu seride kategori üretmeye çalışırken hata vermez', () => {
    expect(toMultiCategories([])).toEqual([]);
  });

  it('matrisi satır başına bir seri olacak şekilde heatmap biçimine çevirir', () => {
    const matrix: MatrixData = {
      columns: ['1. Hafta', '2. Hafta'],
      rows: [{ id: 'out_1', label: 'K1', title: 'Kazanım 1' }],
      cells: [
        {
          rowId: 'out_1',
          rowLabel: 'K1',
          columnLabel: '1. Hafta',
          value: 75,
          sampleSize: 4,
        },
      ],
    };

    const series = toHeatmapSeries(matrix);

    expect(series).toEqual([
      {
        name: 'K1',
        data: [
          { x: '1. Hafta', y: 75 },
          // Veri olmayan hücre 0 gönderilir; ApexCharts null kabul etmez.
          { x: '2. Hafta', y: 0 },
        ],
      },
    ]);
  });
});
