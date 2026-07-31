import { Pipe, PipeTransform, inject } from '@angular/core';

import { CLOCK } from '../../core/platform/platform.tokens';

const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "3 gün önce", "2 saat sonra" biçiminde göreli zaman. */
@Pipe({ name: 'appRelativeTime' })
export class RelativeTimePipe implements PipeTransform {
  private readonly clock = inject(CLOCK);
  private readonly formatter = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });

  transform(value: string | number | Date | null | undefined): string {
    if (value === null || value === undefined) return '—';

    const timestamp = value instanceof Date ? value.getTime() : Date.parse(String(value));
    if (Number.isNaN(timestamp)) return '—';

    const diff = timestamp - this.clock.now();
    const absolute = Math.abs(diff);

    if (absolute < 45_000) return 'az önce';

    const [unit, size] = UNITS.find(([, ms]) => absolute >= ms) ?? UNITS[UNITS.length - 1]!;
    return this.formatter.format(Math.round(diff / size), unit);
  }
}
