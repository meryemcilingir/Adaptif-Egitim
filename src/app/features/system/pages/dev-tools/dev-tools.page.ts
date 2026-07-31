import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { FakeDb } from '../../../../core/api/mock/db/fake-db';
import { MockConfig } from '../../../../core/api/mock/mock-config';
import { ToastStore } from '../../../../core/observability/toast.store';
import { OutboxQueue } from '../../../../core/storage/outbox-queue';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';

/**
 * Geliştirici / demo paneli.
 *
 * Şartnamedeki "yavaş servis, servis hatası, çevrimdışı, yeniden deneme" senaryolarının
 * demo sırasında canlı olarak tetiklenebilmesi için mock backend ayarlarını açar.
 */
@Component({
  selector: 'app-dev-tools-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppCardComponent, AppStatusBadgeComponent],
  templateUrl: './dev-tools.page.html',
  styleUrl: './dev-tools.page.scss',
})
export class DevToolsPage {
  private readonly toast = inject(ToastStore);
  private readonly dialogs = inject(DialogService);
  private readonly db = inject(FakeDb);

  protected readonly config = inject(MockConfig);
  protected readonly outbox = inject(OutboxQueue);

  readonly settings = this.config.settings;
  readonly dbRevision = this.db.changes;

  toggleOffline(): void {
    const next = !this.settings().offline;
    this.config.patch({ offline: next });
    this.toast.info(
      next ? 'Çevrimdışı moda geçildi' : 'Bağlantı geri geldi',
      next
        ? 'Tüm istekler ağ hatası verecek; yazma işlemleri outbox kuyruğuna alınır.'
        : 'İstekler yeniden sunucuya ulaşıyor.',
    );
  }

  setLatency(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.config.patch({ minLatencyMs: Math.round(value / 3), maxLatencyMs: value });
  }

  setErrorRate(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.config.patch({ errorRate: value / 100 });
  }

  async resetDatabase(): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'Demo veriyi sıfırla',
      message:
        'Tüm sınav oturumları, puanlamalar ve denetim kayıtları silinip başlangıç verisi yeniden üretilecek. Bu işlem geri alınamaz.',
      confirmLabel: 'Sıfırla',
      tone: 'danger',
    });

    if (!confirmed) return;

    await this.db.reset();
    this.outbox.clear();
    this.toast.success('Demo veri sıfırlandı', 'Başlangıç veri seti yeniden üretildi.');
  }

  resetSettings(): void {
    this.config.reset();
    this.toast.success('Ayarlar varsayılana döndü');
  }
}
