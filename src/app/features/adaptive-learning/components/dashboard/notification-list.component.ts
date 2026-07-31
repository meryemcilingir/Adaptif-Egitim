import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { NOTIFICATION_PRESENTATION, Notification } from '../../models/notification.model';

/**
 * Bildirim listesi.
 * Okunmamış bildirimler görsel olarak ayrılır ve tıklanınca ilgili ekrana götürür.
 */
@Component({
  selector: 'app-notification-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppEmptyStateComponent, AppIconComponent, RelativeTimePipe, RouterLink],
  template: `
    @if (notifications().length === 0) {
      <app-empty-state
        icon="bell"
        title="Bildirim yok"
        description="Yeni bir gelişme olduğunda burada göreceksin."
      />
    } @else {
      <ul class="notifications">
        @for (notification of notifications(); track notification.id) {
          <li class="notifications__item" [class.is-unread]="!notification.read">
            <a
              class="notifications__link"
              [routerLink]="notification.link ?? '.'"
              (click)="markRead.emit(notification)"
            >
              <span
                class="notifications__icon"
                [class]="'notifications__icon--' + presentation(notification).tone"
              >
                <app-icon [name]="presentation(notification).icon" [size]="14" />
              </span>

              <span class="notifications__body">
                <span class="notifications__head">
                  <span class="text-body-strong truncate">{{ notification.title }}</span>
                  <time class="text-xs text-subtle" [attr.datetime]="notification.createdAt">
                    {{ notification.createdAt | appRelativeTime }}
                  </time>
                </span>
                <span class="text-sm text-muted clamp-2">{{ notification.message }}</span>
              </span>

              @if (!notification.read) {
                <span class="notifications__dot" aria-label="Okunmadı"></span>
              }
            </a>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './notification-list.component.scss',
})
export class NotificationListComponent {
  readonly notifications = input.required<readonly Notification[]>();
  readonly markRead = output<Notification>();

  presentation(notification: Notification) {
    return NOTIFICATION_PRESENTATION[notification.kind];
  }
}
