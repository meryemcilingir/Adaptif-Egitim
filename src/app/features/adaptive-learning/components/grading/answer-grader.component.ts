import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import {
  GRADING_LIMITS,
  GradingAnswerView,
  RubricCriterionScore,
} from '../../models/attempt.model';
import { Rubric } from '../../models/rubric.model';
import { evaluateRubric } from '../../domain/rubric.calculator';
import { validateScore } from '../../domain/grading.rules';
import { RubricGraderComponent } from './rubric-grader.component';

/** Bir cevabın puanlanmış hâli — üst ekran bunları toplayıp kaydeder. */
export interface AnswerGrade {
  readonly questionId: string;
  readonly awardedPoints: number;
  readonly feedback: string;
  readonly rubricScores: readonly RubricCriterionScore[];
}

/**
 * Tek bir cevabın değerlendirme kartı.
 *
 * Üç durumu vardır ve ayrımı sorunun kendisi belirler:
 * · Otomatik puanlanmış → yalnızca gösterilir, puan kutusu açılmaz.
 * · Rubrikli → puan rubrikten hesaplanır, elle girilemez (BR-13).
 * · Rubriksiz elle puanlanan → değerlendirici puanı doğrudan girer.
 *
 * Puan sınırı (`0 … maxPoints`) burada da denetlenir; sunucu aynı kuralı
 * çalıştırır, bu yüzden "kaydet" düğmesi aktifken reddedilme olmaz.
 */
@Component({
  selector: 'app-answer-grader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, AppStatusBadgeComponent, RubricGraderComponent],
  templateUrl: './answer-grader.component.html',
  styleUrl: './answer-grader.component.scss',
})
export class AnswerGraderComponent {
  readonly answer = input.required<GradingAnswerView>();
  readonly rubric = input<Rubric | null>(null);
  readonly disabled = input(false);
  /** Değiştirilmiş taslak değerler — üst ekran tutar, kart yalnızca gösterir. */
  readonly draft = input.required<AnswerGrade>();

  readonly draftChange = output<AnswerGrade>();
  /**
   * Rubrik kriteri değişimi YUKARI aktarılır, burada birleştirilmez.
   *
   * Birleştirme, taslak listesinin gerçek sahibi olan sayfada ve kendi sinyali
   * üzerinden yapılır. Bileşen kendi girdisine bakarak birleştirseydi, arka
   * arkaya yapılan iki seçim arasında girdi henüz tazelenmemiş olacağı için
   * ilki kaybolurdu.
   */
  readonly criterionChange = output<RubricCriterionScore>();

  readonly feedbackLimit = GRADING_LIMITS.feedback.max;

  readonly isRubricGraded = computed(() => this.rubric() !== null);

  /** Rubrik varsa puan ondan gelir; yoksa değerlendiricinin girdiği değerdir. */
  readonly effectivePoints = computed(() => {
    const rubric = this.rubric();
    if (!rubric) return this.draft().awardedPoints;

    return evaluateRubric(rubric, this.draft().rubricScores, this.answer().maxPoints)
      .scaledPoints;
  });

  readonly scoreIssue = computed(() =>
    validateScore(this.effectivePoints(), this.answer().maxPoints, this.answer().questionId),
  );

  readonly feedbackLength = computed(() => this.draft().feedback.length);

  readonly correctnessTone = computed<'success' | 'danger' | 'neutral'>(() => {
    const correct = this.answer().correct;
    if (correct === null) return 'neutral';
    return correct ? 'success' : 'danger';
  });

  readonly correctnessLabel = computed(() => {
    const answer = this.answer();
    if (answer.correct === null) return 'Elle değerlendirilir';
    return answer.correct ? 'Doğru' : 'Yanlış';
  });

  setPoints(raw: string): void {
    if (this.disabled() || this.isRubricGraded()) return;

    const parsed = Number(raw.replace(',', '.'));
    if (raw.trim() !== '' && Number.isNaN(parsed)) return;

    this.draftChange.emit({
      ...this.draft(),
      awardedPoints: raw.trim() === '' ? 0 : parsed,
    });
  }

  setFeedback(raw: string): void {
    if (this.disabled()) return;
    this.draftChange.emit({ ...this.draft(), feedback: raw.slice(0, this.feedbackLimit) });
  }

  onCriterionChange(change: RubricCriterionScore): void {
    if (!this.disabled()) this.criterionChange.emit(change);
  }
}
