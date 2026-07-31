/**
 * Analitik ekranlarının paylaştığı temel veri şekilleri.
 *
 * Grafik bileşenleri doğrudan ApexCharts tiplerine değil, bu nötr şekillere bağlanır;
 * grafik kütüphanesi değişse bile domain sözleşmesi bozulmaz.
 */

export interface CategoryValue {
  readonly label: string;
  readonly value: number;
}

export interface TimeSeriesPoint {
  readonly date: string;
  readonly value: number;
  /** Nokta arkasındaki örneklem büyüklüğü — tooltip'te güven bilgisi olarak kullanılır. */
  readonly sampleSize: number;
}

export interface NamedSeries {
  readonly name: string;
  readonly points: readonly TimeSeriesPoint[];
}

/** İki boyutlu ısı haritası hücresi (kazanım × dönem, eğitmen × ders vb.). */
export interface MatrixCell {
  readonly rowId: string;
  readonly rowLabel: string;
  readonly columnLabel: string;
  readonly value: number | null;
  readonly sampleSize: number;
}

export interface MatrixData {
  readonly columns: readonly string[];
  readonly rows: readonly { readonly id: string; readonly label: string; readonly title: string }[];
  readonly cells: readonly MatrixCell[];
}

/** Sıralı liste görünümleri (en zayıf kazanımlar, en yavaş sorular…). */
export interface RankedEntry {
  readonly id: string;
  readonly label: string;
  readonly sublabel: string;
  readonly value: number;
  readonly unit: string;
  /** 0–100 arası; liste içindeki göreli bar genişliği. */
  readonly ratio: number;
  readonly tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
}

export interface DistributionBucket {
  readonly label: string;
  readonly count: number;
  readonly percent: number;
}

/** Karşılaştırmalı özet: bir metriğin geçmiş dönemle farkı. */
export interface MetricDelta {
  readonly current: number;
  readonly previous: number;
  readonly changePercent: number;
  readonly direction: 'up' | 'down' | 'flat';
}

export function computeDelta(current: number, previous: number): MetricDelta {
  if (previous === 0) {
    return {
      current,
      previous,
      changePercent: current === 0 ? 0 : 100,
      direction: current === 0 ? 'flat' : 'up',
    };
  }

  const changePercent = Math.round(((current - previous) / previous) * 1000) / 10;
  return {
    current,
    previous,
    changePercent: Math.abs(changePercent),
    direction: changePercent > 0.5 ? 'up' : changePercent < -0.5 ? 'down' : 'flat',
  };
}
