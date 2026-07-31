import { Injectable, computed, inject, signal } from '@angular/core';

import { STORAGE_ADAPTER, STORAGE_KEYS } from '../../storage/storage.token';

export interface MockSettings {
  /** Yapay gecikme aralığı (ms) — loading durumlarının gerçekten görülmesi için. */
  readonly minLatencyMs: number;
  readonly maxLatencyMs: number;
  /** 0–1 arası; isteklerin bu oranı 500 ile başarısız olur (retry senaryosu). */
  readonly errorRate: number;
  /** Açıkken tüm istekler ağ hatası verir — offline/outbox senaryosu. */
  readonly offline: boolean;
  /** Aynı endpoint'e saniyede bu sayıdan fazla istek 429 alır. */
  readonly rateLimitPerSecond: number;
  readonly enabled: boolean;
}

export const DEFAULT_MOCK_SETTINGS: MockSettings = {
  minLatencyMs: 180,
  maxLatencyMs: 720,
  errorRate: 0,
  offline: false,
  rateLimitPerSecond: 25,
  enabled: true,
};

/**
 * Mock backend davranışını çalışma zamanında ayarlar.
 * Geliştirici paneli bu store'u kullanarak gecikme/hata/offline senaryolarını
 * demo sırasında canlı olarak tetikler.
 */
@Injectable({ providedIn: 'root' })
export class MockConfig {
  private readonly storage = inject(STORAGE_ADAPTER);
  private readonly state = signal<MockSettings>({
    ...DEFAULT_MOCK_SETTINGS,
    ...(this.storage.get<Partial<MockSettings>>(STORAGE_KEYS.mockConfig) ?? {}),
  });

  readonly settings = this.state.asReadonly();
  readonly isOffline = computed(() => this.state().offline);
  readonly isDegraded = computed(() => this.state().errorRate > 0 || this.state().offline);

  patch(patch: Partial<MockSettings>): void {
    const next = { ...this.state(), ...patch };
    this.state.set(next);
    this.storage.set(STORAGE_KEYS.mockConfig, next);
  }

  reset(): void {
    this.state.set(DEFAULT_MOCK_SETTINGS);
    this.storage.remove(STORAGE_KEYS.mockConfig);
  }

  /** İstek başına uygulanacak rastgele gecikme. */
  nextLatency(): number {
    const { minLatencyMs, maxLatencyMs } = this.state();
    return minLatencyMs + Math.random() * Math.max(0, maxLatencyMs - minLatencyMs);
  }

  shouldFailRandomly(): boolean {
    return Math.random() < this.state().errorRate;
  }
}
