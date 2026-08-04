import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { ToastStore } from '../../../core/observability/toast.store';
import {
  AppDropdownComponent,
  DropdownItem,
} from '../app-dropdown/app-dropdown.component';


export const EXPORT_FORMATS = ['csv', 'excel', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const EXPORT_FORMAT_LABELS: Readonly<Record<ExportFormat, string>> = {
  csv: 'CSV',
  excel: 'Excel (örnek)',
  pdf: 'PDF (örnek)',
};

/** Dışa aktarılacak tablo: başlıklar + satırlar. */
export interface ExportTable {
  readonly fileName: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly (string | number)[])[];
}

/**
 * Dışa aktarım (Sprint 8 §16, Sprint 9 §12).
 *
 * CSV GERÇEKTEN üretilir ve indirilir — tarayıcıda ek kütüphane gerektirmeyen,
 * her yerde açılan biçim budur. Excel ve PDF bu sprintte ÖRNEKTİR: kullanıcıya
 * açıkça söylenir ve CSV'ye yönlendirilir. Çalışmayan bir düğmeyi çalışıyormuş
 * gibi göstermek, raporun kendisine duyulan güveni zedeler.
 */
@Component({
  selector: 'app-export-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppDropdownComponent],
  template: `
    <app-dropdown
      [items]="items"
      triggerLabel="Dışa aktar"
      triggerIcon="download"
      triggerText="Dışa aktar"
      triggerVariant="secondary"
      (itemSelect)="onSelect($event)"
    />
  `,
})
export class ExportMenuComponent {
  private readonly toast = inject(ToastStore);

  readonly table = input.required<ExportTable>();

  readonly items: readonly DropdownItem[] = [
    { id: 'csv', label: EXPORT_FORMAT_LABELS.csv, icon: 'file-text' },
    { id: 'excel', label: EXPORT_FORMAT_LABELS.excel, icon: 'chart-column' },
    { id: 'pdf', label: EXPORT_FORMAT_LABELS.pdf, icon: 'file-check' },
  ];

  onSelect(item: DropdownItem): void {
    const format = item.id as ExportFormat;
    const table = this.table();

    if (table.rows.length === 0) {
      this.toast.warning('Dışa aktarılacak veri yok.', 'Filtreleri genişletmeyi deneyin.');
      return;
    }

    if (format !== 'csv') {
      this.toast.info(
        `${EXPORT_FORMAT_LABELS[format]} bu sürümde örnektir.`,
        'Aynı veriyi CSV olarak indirebilirsiniz.',
      );
      return;
    }

    downloadCsv(table);
    this.toast.success('Rapor indirildi.', `${table.rows.length} satır dışa aktarıldı.`);
  }
}

/**
 * CSV üretir ve indirir.
 *
 * Ayırıcı olarak NOKTALI VİRGÜL kullanılır: Türkçe yerel ayarında Excel virgülü
 * ondalık ayırıcı sayar ve virgülle ayrılmış dosyayı tek sütuna yığar. BOM
 * eklenir, aksi hâlde Türkçe karakterler Excel'de bozuk görünür.
 */
export function downloadCsv(table: ExportTable): void {
  const lines = [table.columns, ...table.rows].map((row) =>
    row.map((cell) => escapeCell(cell)).join(';'),
  );

  const content = `﻿${lines.join('\r\n')}`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${table.fileName}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

/** Ayırıcı, tırnak veya satır sonu içeren hücreler tırnaklanır. */
function escapeCell(value: string | number): string {
  const text = String(value ?? '');
  if (!/[;"\r\n]/.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
}
