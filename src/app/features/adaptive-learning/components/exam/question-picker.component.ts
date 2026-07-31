import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { DIFFICULTY_LABELS } from '../../models/common.model';
import { ExamQuestionView } from '../../models/exam.model';
import { QUESTION_TYPE_META, Question } from '../../models/question.model';

/**
 * Sınavdaki soruların elle düzenlenmesi.
 *
 * Solda seçili sorular (sıralanabilir, çıkarılabilir), sağda bankadan aday
 * sorular. Aday listesi yalnızca YAYINDAKİ ve henüz eklenmemiş soruları gösterir;
 * "aynı soru iki kez eklenemez" kuralı arayüzde de görünür olur.
 */
@Component({
  selector: 'app-question-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppEmptyStateComponent, AppIconComponent],
  templateUrl: './question-picker.component.html',
  styleUrl: './question-picker.component.scss',
})
export class QuestionPickerComponent {
  readonly selected = input.required<readonly ExamQuestionView[]>();
  /** Dersin yayındaki tüm soruları. */
  readonly pool = input.required<readonly Question[]>();
  readonly busy = input(false);

  readonly add = output<string>();
  readonly remove = output<string>();
  readonly move = output<{ questionId: string; direction: -1 | 1 }>();

  private readonly searchState = signal('');
  readonly search = this.searchState.asReadonly();

  /** Eklenmemiş, aramaya uyan adaylar. */
  readonly candidates = computed(() => {
    const taken = new Set(this.selected().map((question) => question.questionId));
    const term = this.searchState().trim().toLocaleLowerCase('tr-TR');

    return this.pool()
      .filter((question) => !taken.has(question.id))
      .filter(
        (question) =>
          term.length === 0 ||
          question.title.toLocaleLowerCase('tr-TR').includes(term) ||
          question.code.toLocaleLowerCase('tr-TR').includes(term),
      )
      .slice(0, 50);
  });

  readonly totalPoints = computed(() =>
    this.selected().reduce((sum, question) => sum + question.points, 0),
  );

  onSearch(value: string): void {
    this.searchState.set(value);
  }

  typeLabel(question: Question): string {
    return QUESTION_TYPE_META[question.type].shortLabel;
  }

  difficultyLabel(question: Question): string {
    return DIFFICULTY_LABELS[question.difficulty];
  }
}
