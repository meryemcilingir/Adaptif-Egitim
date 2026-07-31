import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppDialogComponent } from '../../../../shared/components/app-dialog/app-dialog.component';
import { Question } from '../../models/question.model';
import { QuestionBadgesComponent } from './question-badges.component';
import { QuestionPreviewComponent } from './question-preview.component';

/**
 * Hızlı önizleme diyaloğu.
 *
 * Gösterimin kendisi `QuestionPreviewComponent`'tedir; bu bileşen yalnızca
 * diyalog kabuğunu ve "cevapları göster/gizle" anahtarını ekler. Böylece aynı
 * önizleme editörde satır içi, listede diyalog olarak kullanılabilir.
 */
@Component({
  selector: 'app-question-preview-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDialogComponent,
    QuestionBadgesComponent,
    QuestionPreviewComponent,
  ],
  template: `
    <app-dialog
      [open]="true"
      size="lg"
      title="Soru önizleme"
      description="Öğrencinin göreceği hâle yakın gösterim"
      (closed)="closed.emit()"
    >
      <div class="stack gap-4">
        <app-question-badges [question]="question()" />
        <app-question-preview [question]="question()" [showAnswers]="showAnswers()" />
      </div>

      <div dialog-footer>
        <app-button
          variant="ghost"
          [icon]="showAnswers() ? 'eye' : 'circle-check-big'"
          (pressed)="toggleAnswers()"
        >
          {{ showAnswers() ? 'Öğrenci görünümü' : 'Cevapları göster' }}
        </app-button>
        <app-button variant="secondary" (pressed)="closed.emit()">Kapat</app-button>
        <app-button variant="primary" icon="external-link" (pressed)="openDetail.emit()">
          Detayı aç
        </app-button>
      </div>
    </app-dialog>
  `,
})
export class QuestionPreviewDialogComponent {
  readonly question = input.required<Question>();

  readonly openDetail = output<void>();
  readonly closed = output<void>();

  private readonly answersState = signal(true);
  readonly showAnswers = this.answersState.asReadonly();

  toggleAnswers(): void {
    this.answersState.update((value) => !value);
  }
}
