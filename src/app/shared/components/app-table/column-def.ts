import { TemplateRef } from '@angular/core';

/**
 * Tablo kolon tanımı.
 *
 * Open/Closed: yeni bir hücre görünümü gerektiğinde `AppTable` içine `if` eklenmez;
 * çağıran taraf `cell` şablonu geçer.
 */
export interface ColumnDef<T> {
  readonly key: string;
  readonly header: string;
  readonly sortable?: boolean;
  readonly width?: string;
  readonly align?: 'start' | 'center' | 'end';
  /** Basit metin hücreleri için — şablon yazmaya gerek kalmaz. */
  readonly value?: (row: T) => string | number | null;
  /** Zengin hücreler (rozet, avatar, aksiyon) için şablon. */
  readonly cell?: TemplateRef<{ $implicit: T }>;
  /** Dar ekranda gizlenecek kolonlar. */
  readonly hideBelow?: 'tablet' | 'laptop';
  /** Sayısal kolonlarda hizalı görünüm. */
  readonly numeric?: boolean;
}

export function columnValue<T>(column: ColumnDef<T>, row: T): string {
  const raw = column.value?.(row);
  return raw === null || raw === undefined ? '—' : String(raw);
}
