import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AppIconName } from '../../icons/app-icons';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { AppIconComponent } from '../app-icon/app-icon.component';

export type TimelineTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'primary';

export interface TimelineItem {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly at: string;
  readonly icon: AppIconName;
  readonly tone: TimelineTone;
  readonly actor?: string;
}

/** Dikey zaman çizelgesi — son işlemler ve denetim geçmişinde kullanılır. */
@Component({
  selector: 'app-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, RelativeTimePipe],
  template: `
    <ol class="timeline">
      @for (item of items(); track item.id) {
        <li class="timeline__item">
          <span class="timeline__marker" [class]="'timeline__marker--' + item.tone">
            <app-icon [name]="item.icon" [size]="13" />
          </span>

          <div class="timeline__content">
            <div class="timeline__head">
              <span class="text-body-strong truncate">{{ item.title }}</span>
              <time class="text-xs text-subtle" [attr.datetime]="item.at">
                {{ item.at | appRelativeTime }}
              </time>
            </div>

            @if (item.description) {
              <p class="text-sm text-muted">{{ item.description }}</p>
            }
            @if (item.actor) {
              <p class="text-xs text-subtle">{{ item.actor }}</p>
            }
          </div>
        </li>
      }
    </ol>

    @if (items().length === 0) {
      <p class="timeline__empty text-sm text-muted">{{ emptyMessage() }}</p>
    }
  `,
  styleUrl: './app-timeline.component.scss',
})
export class AppTimelineComponent {
  readonly items = input.required<readonly TimelineItem[]>();
  readonly emptyMessage = input('Henüz bir işlem kaydı yok.');
  readonly itemSelect = output<TimelineItem>();
}
