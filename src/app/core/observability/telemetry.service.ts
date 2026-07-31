import { Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CLOCK } from '../platform/platform.tokens';
import { AppEvent, EventBus } from '../state/event-bus';

export interface TelemetryEntry {
  readonly type: string;
  readonly at: number;
  readonly payload: unknown;
}

const BUFFER_SIZE = 200;

/**
 * Hafif telemetri: olay akışını halka tamponda tutar, geliştirici panelinde gösterilir.
 * Dışarıya veri göndermez, konsolu kirletmez.
 */
@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly clock = inject(CLOCK);
  private readonly buffer = signal<readonly TelemetryEntry[]>([]);

  readonly entries = this.buffer.asReadonly();
  readonly count = computed(() => this.buffer().length);

  constructor() {
    inject(EventBus)
      .all$.pipe(takeUntilDestroyed())
      .subscribe((event) => this.append(event));
  }

  private append(event: AppEvent): void {
    const entry: TelemetryEntry = {
      type: event.type,
      at: this.clock.now(),
      payload: event.payload,
    };
    this.buffer.update((entries) => [entry, ...entries].slice(0, BUFFER_SIZE));
  }
}
