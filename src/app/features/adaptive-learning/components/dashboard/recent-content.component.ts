import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { DurationPipe } from '../../../../shared/pipes/duration.pipe';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { RecentContentEntry } from '../../models/dashboard.model';

/** Son kullanılan içerikler — öğrencinin kaldığı yerden devam etmesini kolaylaştırır. */
@Component({
  selector: 'app-recent-content',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppEmptyStateComponent,
    AppIconComponent,
    AppProgressBarComponent,
    DurationPipe,
    RelativeTimePipe,
  ],
  template: `
    @if (entries().length === 0) {
      <app-empty-state
        icon="book-open"
        title="Henüz içerik açmadın"
        description="Çalışmaya başladığında son açtığın içerikler burada listelenir."
      />
    } @else {
      <ul class="recent">
        @for (entry of entries(); track entry.id) {
          <li class="recent__item">
            <button type="button" class="recent__button" (click)="contentSelect.emit(entry)">
              <span class="recent__icon"><app-icon [name]="entry.icon" [size]="15" /></span>

              <span class="recent__body">
                <span class="recent__head">
                  <span class="text-body-strong truncate">{{ entry.title }}</span>
                  <time class="text-xs text-subtle" [attr.datetime]="entry.lastAccessedAt">
                    {{ entry.lastAccessedAt | appRelativeTime }}
                  </time>
                </span>

                <span class="text-xs text-muted">
                  {{ entry.courseCode }} · {{ entry.format }} ·
                  {{ entry.durationMinutes | appDuration }}
                </span>

                <app-progress-bar
                  [value]="entry.progressPercent"
                  [max]="100"
                  [tone]="entry.progressPercent === 100 ? 'success' : 'primary'"
                  [label]="entry.title"
                />
              </span>
            </button>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './recent-content.component.scss',
})
export class RecentContentComponent {
  readonly entries = input.required<readonly RecentContentEntry[]>();
  readonly contentSelect = output<RecentContentEntry>();
}
