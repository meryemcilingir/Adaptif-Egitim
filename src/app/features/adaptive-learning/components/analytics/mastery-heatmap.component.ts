import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { MatrixCell, MatrixData } from '../../models/analytics.model';

/** Isı haritası hücresine tıklandığında yayılan bilgi (drill-down, §15). */
export interface HeatmapSelection {
  readonly rowId: string;
  readonly rowLabel: string;
  readonly columnLabel: string;
  readonly value: number;
}

/**
 * Ustalık ısı haritası (§7).
 *
 * ApexCharts'ın hazır heatmap'i yerine ELLE tablo çizilir. Nedeni: bir öğretim
 * yöneticisi için satır (kazanım) etiketlerinin tam metni ve hücreye tıklayıp
 * detaya inebilmek, grafiğin kendisinden daha önemli. Apex heatmap uzun
 * etiketleri kırpıyor, hücre tıklaması ise ek yapılandırma gerektiriyor.
 *
 * Veri olmayan hücre BOŞ bırakılır (`null`), sıfır yazılmaz: "ölçülmedi" ile
 * "başarısız" farklı şeylerdir ve ikincisi haksız bir yargıdır.
 */
@Component({
  selector: 'app-mastery-heatmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mastery-heatmap.component.html',
  styleUrl: './mastery-heatmap.component.scss',
})
export class MasteryHeatmapComponent {
  readonly matrix = input.required<MatrixData>();
  readonly select = output<HeatmapSelection>();

  /** Satır kimliği → sütun etiketi → hücre. Şablonda hızlı erişim için. */
  private readonly index = computed(() => {
    const map = new Map<string, Map<string, MatrixCell>>();

    for (const cell of this.matrix().cells) {
      const row = map.get(cell.rowId) ?? new Map<string, MatrixCell>();
      row.set(cell.columnLabel, cell);
      map.set(cell.rowId, row);
    }

    return map;
  });

  readonly hasData = computed(() =>
    this.matrix().cells.some((cell) => cell.value !== null),
  );

  cellAt(rowId: string, column: string): MatrixCell | null {
    return this.index().get(rowId)?.get(column) ?? null;
  }

  /**
   * Ustalık bandı.
   *
   * Beş kademe kullanılır; üç kademe (kırmızı/sarı/yeşil) 60 ile 75 arasındaki
   * farkı gizler ve "iyileşiyor mu?" sorusunu yanıtsız bırakır.
   */
  bandOf(value: number | null): string {
    if (value === null) return 'empty';
    if (value >= 85) return 'excellent';
    if (value >= 70) return 'good';
    if (value >= 55) return 'fair';
    if (value >= 40) return 'weak';
    return 'critical';
  }

  labelOf(cell: MatrixCell | null, rowLabel: string, column: string): string {
    if (!cell || cell.value === null) return `${rowLabel} · ${column}: ölçüm yok`;
    return `${rowLabel} · ${column}: %${cell.value} (${cell.sampleSize} kayıt)`;
  }

  onSelect(cell: MatrixCell | null): void {
    if (!cell || cell.value === null) return;

    this.select.emit({
      rowId: cell.rowId,
      rowLabel: cell.rowLabel,
      columnLabel: cell.columnLabel,
      value: cell.value,
    });
  }
}
