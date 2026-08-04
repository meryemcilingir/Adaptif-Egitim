import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { GRADING_LIMITS, RubricCriterionScore } from '../../models/attempt.model';
import { Rubric } from '../../models/rubric.model';
import { criterionMaxPoints, evaluateRubric } from '../../domain/rubric.calculator';

/**
 * Rubrik tabanlı puanlayıcı.
 *
 * Puan ELLE GİRİLMEZ: değerlendirici her kriter için bir seviye seçer, toplam
 * seçimlerden hesaplanır (BR-13). Böylece "kriterlerin toplamı ile verilen puan
 * tutmuyor" durumu yapısal olarak imkânsız hâle gelir.
 *
 * Hesap `domain/rubric.calculator.ts` içindeki saf fonksiyondan gelir; sunucu da
 * kaydederken aynı fonksiyonu çalıştırır.
 */
@Component({
  selector: 'app-rubric-grader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, AppProgressBarComponent],
  templateUrl: './rubric-grader.component.html',
  styleUrl: './rubric-grader.component.scss',
})
export class RubricGraderComponent {
  readonly rubric = input.required<Rubric>();
  readonly scores = input.required<readonly RubricCriterionScore[]>();
  readonly questionPoints = input.required<number>();
  readonly disabled = input(false);

  /**
   * TEK bir kriterin değişimi yayılır, listenin tamamı değil.
   *
   * Bileşen kendi yaydığı listeyi geri okusaydı, arka arkaya yapılan iki seçim
   * arasında girdi henüz tazelenmemiş olacağı için ilk seçim kaybolurdu. Birleştirme
   * listenin gerçek sahibinde (üst bileşen) yapılır.
   */
  readonly criterionChange = output<RubricCriterionScore>();

  readonly commentLimit = GRADING_LIMITS.comment.max;

  readonly evaluation = computed(() =>
    evaluateRubric(this.rubric(), this.scores(), this.questionPoints()),
  );

  maxOf(criterionId: string): number {
    const criterion = this.rubric().criteria.find((item) => item.id === criterionId);
    return criterion ? criterionMaxPoints(criterion) : 0;
  }

  selectedLevel(criterionId: string): string {
    return this.scores().find((score) => score.criterionId === criterionId)?.levelId ?? '';
  }

  commentFor(criterionId: string): string {
    return this.scores().find((score) => score.criterionId === criterionId)?.comment ?? '';
  }

  isMissing(criterionId: string): boolean {
    return this.evaluation().missingCriterionIds.includes(criterionId);
  }

  /**
   * Seviye seçimi.
   *
   * `points` alanı burada da yazılır ama KAYNAK DEĞİLDİR: sunucu onu seviye
   * kimliğinden yeniden türetir. Burada tutulması yalnızca anlık gösterim içindir.
   */
  selectLevel(criterionId: string, levelId: string): void {
    if (this.disabled()) return;

    const criterion = this.rubric().criteria.find((item) => item.id === criterionId);
    const level = criterion?.levels.find((item) => item.id === levelId);
    if (!criterion || !level) return;

    this.criterionChange.emit({
      criterionId,
      levelId,
      points: Math.round(level.points * criterion.weight * 100) / 100,
      comment: this.commentFor(criterionId),
    });
  }

  setComment(criterionId: string, comment: string): void {
    if (this.disabled()) return;

    const existing = this.scores().find((score) => score.criterionId === criterionId);
    // Seviye seçilmeden yorum yazılamaz; yoksa kayıt oluşturmanın anlamı yok.
    if (!existing) return;

    this.criterionChange.emit({ ...existing, comment: comment.slice(0, this.commentLimit) });
  }
}
