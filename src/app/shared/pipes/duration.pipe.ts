import { Pipe, PipeTransform } from '@angular/core';

/**
 * Dakika ya da saniye değerini okunabilir süreye çevirir.
 * Sınav sayacı için `mm:ss` biçimi de desteklenir.
 */
@Pipe({ name: 'appDuration' })
export class DurationPipe implements PipeTransform {
  transform(
    value: number | null | undefined,
    unit: 'minutes' | 'seconds' = 'minutes',
    format: 'text' | 'clock' = 'text',
  ): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';

    const totalSeconds = unit === 'minutes' ? Math.round(value * 60) : Math.round(value);
    if (totalSeconds < 0) return format === 'clock' ? '00:00' : '0 dk';

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (format === 'clock') {
      const parts = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds];
      return parts.map((part) => String(part).padStart(2, '0')).join(':');
    }

    if (hours > 0) return minutes > 0 ? `${hours} sa ${minutes} dk` : `${hours} sa`;
    if (minutes > 0) return `${minutes} dk`;
    return `${seconds} sn`;
  }
}
