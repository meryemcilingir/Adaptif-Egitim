import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import {
  AppTimelineComponent,
  TimelineItem,
} from '../../../../shared/components/app-timeline/app-timeline.component';
import { ActivityEntry, StatisticEntry } from '../../models/dashboard.model';
import { Notification } from '../../models/notification.model';
import { NotificationListComponent } from './notification-list.component';
import { StatisticsListComponent } from './statistics-list.component';

/**
 * Tüm rollerde ortak olan alt bölüm: son işlemler · bildirimler · özet istatistikler.
 *
 * Altı rol dashboard'unun tamamı bu bileşeni kullanır; böylece ortak blokların
 * yerleşimi ve boş durumları tek yerde tanımlıdır (DRY + tutarlı tasarım dili).
 */
@Component({
  selector: 'app-dashboard-common',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppCardComponent,
    AppTimelineComponent,
    NotificationListComponent,
    StatisticsListComponent,
  ],
  template: `
    <div class="grid grid-3">
      <app-card [title]="activityTitle()" [description]="activityDescription()" padding="compact">
        <app-timeline [items]="timelineItems()" emptyMessage="Görüntülenecek işlem kaydı yok." />
      </app-card>

      <app-card title="Bildirimler" description="Okunmamışlar öne çıkarılır" padding="compact">
        <app-notification-list
          [notifications]="notifications()"
          (markRead)="notificationRead.emit($event)"
        />
      </app-card>

      <app-card title="Özet istatistikler" padding="compact">
        <app-statistics-list [entries]="statistics()" />
      </app-card>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class DashboardCommonComponent {
  readonly activity = input.required<readonly ActivityEntry[]>();
  readonly notifications = input.required<readonly Notification[]>();
  readonly statistics = input.required<readonly StatisticEntry[]>();

  /*
   * Akışın kaynağı role göre değişir: yönetsel rollerde denetim kaydı, öğrencide
   * kendi çalışma hareketleri. Başlık metni bu yüzden dışarıdan verilebilir.
   */
  readonly activityTitle = input('Son işlemler');
  readonly activityDescription = input('Denetim kaydına yazılan son hareketler');

  readonly notificationRead = output<Notification>();

  /** `ActivityEntry` → `TimelineItem` uyarlaması; zaman çizelgesi domain bilmez. */
  readonly timelineItems = computed<TimelineItem[]>(() =>
    this.activity().map((entry) => ({
      id: entry.id,
      title: entry.title,
      description: entry.description,
      at: entry.at,
      icon: entry.icon,
      tone: entry.tone,
      actor: entry.actor,
    })),
  );
}
