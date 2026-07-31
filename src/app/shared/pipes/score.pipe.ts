import { Pipe, PipeTransform } from '@angular/core';

/**
 * Puanları tutarlı biçimde gösterir: gereksiz ondalık basılmaz,
 * ondalık ayırıcı Türkçe biçimde (virgül) yazılır.
 */
@Pipe({ name: 'appScore' })
export class ScorePipe implements PipeTransform {
  private readonly formatter = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

  transform(value: number | null | undefined, maxValue?: number): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';

    const formatted = this.formatter.format(value);
    return maxValue === undefined ? formatted : `${formatted} / ${this.formatter.format(maxValue)}`;
  }
}
