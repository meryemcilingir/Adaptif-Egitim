import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { ExamQuestionView } from '../../models/exam.model';

/**
 * Sınav önizlemesi — öğrencinin göreceği hâle yakın gösterim.
 *
 * Sayaç ve gezinme MOCK'tur: gerçek oturum (süre yönetimi, otomatik gönderim,
 * cevap kaydı) Sprint 7'de gelir. Buradaki amaç, ölçme uzmanının sınavı
 * yayınlamadan önce öğrenci gözüyle görmesidir.
 */
@Component({
  selector: 'app-exam-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppIconComponent],
  templateUrl: './exam-preview.component.html',
  styleUrl: './exam-preview.component.scss',
})
export class ExamPreviewComponent {
  readonly title = input.required<string>();
  readonly courseCode = input('');
  readonly instructions = input('');
  readonly durationMinutes = input(0);
  readonly totalPoints = input(0);
  readonly questions = input.required<readonly ExamQuestionView[]>();

  private readonly indexState = signal(0);
  readonly index = this.indexState.asReadonly();

  readonly current = computed<ExamQuestionView | null>(
    () => this.questions()[this.indexState()] ?? null,
  );

  readonly hasPrevious = computed(() => this.indexState() > 0);
  readonly hasNext = computed(() => this.indexState() < this.questions().length - 1);

  /** Sayaç yalnızca gösterim amaçlıdır; geri saymaz. */
  readonly mockTimer = computed(() => {
    const total = this.durationMinutes();
    const hours = Math.floor(total / 60);
    const minutes = total % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  });

  goTo(index: number): void {
    if (index < 0 || index >= this.questions().length) return;
    this.indexState.set(index);
  }

  next(): void {
    this.goTo(this.indexState() + 1);
  }

  previous(): void {
    this.goTo(this.indexState() - 1);
  }
}
