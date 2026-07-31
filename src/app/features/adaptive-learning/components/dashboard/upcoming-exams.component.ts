import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';

import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { DurationPipe } from '../../../../shared/pipes/duration.pipe';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { UpcomingExamCard } from '../../models/dashboard.model';

/** Yaklaşan sınavlar listesi — öğrenci, eğitmen ve yönetici panellerinde ortak. */
@Component({
  selector: 'app-upcoming-exams',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppEmptyStateComponent,
    AppIconComponent,
    AppStatusBadgeComponent,
    DatePipe,
    DurationPipe,
  ],
  template: `
    @if (exams().length === 0) {
      <app-empty-state
        icon="calendar"
        title="Planlanmış sınav yok"
        description="Takvimde yaklaşan bir sınav bulunmuyor."
      />
    } @else {
      <ul class="exams">
        @for (exam of exams(); track exam.id) {
          <li class="exams__item">
            <button type="button" class="exams__button" (click)="examSelect.emit(exam)">
              <span class="exams__head">
                <span class="text-body-strong truncate">{{ exam.title }}</span>
                <app-status-badge [label]="tone(exam.state).label" [tone]="tone(exam.state).tone" />
              </span>

              <span class="exams__meta text-xs text-muted">
                <span><app-icon name="library" [size]="12" /> {{ exam.courseCode }}</span>
                <span>
                  <app-icon name="calendar" [size]="12" />
                  {{ exam.opensAt | date: 'd MMM, HH:mm' }}
                </span>
                <span>
                  <app-icon name="clock" [size]="12" />
                  {{ exam.durationMinutes | appDuration }}
                </span>
                <span
                  ><app-icon name="circle-help" [size]="12" /> {{ exam.questionCount }} soru</span
                >
              </span>

              @if (showCohorts() && exam.cohortNames.length > 0) {
                <span class="exams__cohorts text-xs text-subtle">
                  <app-icon name="users" [size]="12" /> {{ exam.cohortNames.join(', ') }}
                </span>
              }
            </button>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './upcoming-exams.component.scss',
})
export class UpcomingExamsComponent {
  readonly exams = input.required<readonly UpcomingExamCard[]>();
  /** Öğrenci panelinde cohort bilgisi anlamsızdır; yönetici panellerinde gösterilir. */
  readonly showCohorts = input(false);
  readonly examSelect = output<UpcomingExamCard>();

  tone(state: string) {
    return statusPresentation(state);
  }
}
