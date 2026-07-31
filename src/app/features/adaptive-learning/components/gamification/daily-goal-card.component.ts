import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { DailyGoal, DailyGoalTask } from '../../models/dashboard.model';

/**
 * Bugünün hedefi.
 *
 * Hedef dakika, öğrenme yolundaki sıradaki adımların toplam süresinden gelir —
 * sabit bir sayı dayatılmaz. Görev listesi boşsa kullanıcıya ne yapacağı söylenir.
 */
@Component({
  selector: 'app-daily-goal-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, AppProgressBarComponent],
  template: `
    @let data = goal();

    <div class="goal__head">
      <div>
        <p class="goal__value tabular">
          {{ data.completedMinutes }}<span class="goal__unit">/ {{ data.targetMinutes }} dk</span>
        </p>
        <p class="text-xs text-subtle">Bugün tamamlanan {{ data.completedTasks }} içerik</p>
      </div>
      @if (isReached()) {
        <span class="goal__badge">
          <app-icon name="circle-check-big" [size]="14" />
          Hedef tamam
        </span>
      }
    </div>

    <app-progress-bar
      [value]="data.completedMinutes"
      [max]="data.targetMinutes"
      [tone]="isReached() ? 'success' : 'primary'"
      label="Günlük hedef"
    />

    @if (data.tasks.length === 0) {
      <p class="text-sm text-subtle">
        Bugün için planlanmış görev yok. Öğrenme yolundan yeni bir adım seçebilirsin.
      </p>
    } @else {
      <ul class="goal__tasks">
        @for (task of data.tasks; track task.contentId) {
          <li>
            <button
              type="button"
              class="goal__task"
              [class.is-done]="task.completed"
              (click)="taskSelect.emit(task)"
            >
              <app-icon [name]="task.completed ? 'circle-check-big' : task.icon" [size]="16" />
              <span class="goal__task-title text-sm">{{ task.title }}</span>
              <span class="text-xs text-subtle">{{ task.estimatedDurationMinutes }} dk</span>
            </button>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './daily-goal-card.component.scss',
})
export class DailyGoalCardComponent {
  readonly goal = input.required<DailyGoal>();
  readonly taskSelect = output<DailyGoalTask>();

  readonly isReached = computed(() => {
    const goal = this.goal();
    return goal.targetMinutes > 0 && goal.completedMinutes >= goal.targetMinutes;
  });
}
