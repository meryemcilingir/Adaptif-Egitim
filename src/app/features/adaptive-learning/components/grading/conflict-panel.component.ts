import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { GRADING_LIMITS, GradingConflict, ResolveConflictRequest } from '../../models/attempt.model';

/**
 * Değerlendirici çakışması.
 *
 * İki uzman aynı cevaba farklı puan verdiğinde durum GİZLENMEZ: her iki puan da
 * kimin verdiğiyle birlikte gösterilir ve karar bir insana bırakılır. Otomatik
 * ortalama almak cazip görünür ama ölçme açısından yanlıştır — puanlar arasındaki
 * fark çoğu zaman rubriğin farklı yorumlanmasından gelir ve bu ancak konuşularak
 * çözülür.
 *
 * Nihai puan için önerilen değerler kolaylık olsun diye sunulur; gerekçe zorunludur.
 */
@Component({
  selector: 'app-conflict-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppIconComponent, AppStatusBadgeComponent],
  templateUrl: './conflict-panel.component.html',
  styleUrl: './conflict-panel.component.scss',
})
export class ConflictPanelComponent {
  readonly conflict = input.required<GradingConflict>();
  readonly maxPoints = input.required<number>();
  readonly canResolve = input(false);
  readonly busy = input(false);
  /** Yetki var ama deneme kilitliyse (sonuç açıklandı) `false` gelir. */
  readonly hasPermission = input(false);
  readonly locked = input(false);

  readonly resolve = output<ResolveConflictRequest>();

  private readonly pointsState = signal<number | null>(null);
  private readonly reasonState = signal('');

  readonly reasonLimit = GRADING_LIMITS.resolutionNote.max;
  readonly reason = this.reasonState.asReadonly();

  readonly isResolved = computed(() => this.conflict().resolvedPoints !== null);

  /** Karar verilemiyorsa GERÇEK sebebi söyler — kullanıcı hatayı kendinde aramasın. */
  readonly lockReason = computed(() => {
    if (this.locked()) {
      return 'Sonuç öğrenciye açıklandığı için deneme kilitli; puan yalnızca itiraz akışıyla değiştirilebilir.';
    }
    if (!this.hasPermission()) {
      return 'Çakışmayı sonuçlandırma yetkisi rolünüzde yok. Program yöneticisi karar verebilir.';
    }
    return 'Bu çakışma şu anda sonuçlandırılamıyor.';
  });

  /** Seçili puan; henüz seçilmediyse ortada bir değer önerilir. */
  readonly points = computed(() => {
    const explicit = this.pointsState();
    if (explicit !== null) return explicit;

    const conflict = this.conflict();
    return Math.round(((conflict.minPoints + conflict.maxPoints) / 2) * 100) / 100;
  });

  /** Hızlı seçim: her değerlendiricinin verdiği puan + ortalama. */
  readonly suggestions = computed(() => {
    const conflict = this.conflict();
    const midpoint = Math.round(((conflict.minPoints + conflict.maxPoints) / 2) * 100) / 100;

    const values = new Set<number>([
      ...conflict.scores.map((score) => score.points),
      midpoint,
    ]);

    return [...values].sort((a, b) => a - b);
  });

  readonly canSubmit = computed(
    () =>
      this.canResolve() &&
      !this.busy() &&
      this.reasonState().trim().length >= 10 &&
      this.points() >= 0 &&
      this.points() <= this.maxPoints(),
  );

  setPoints(value: number): void {
    this.pointsState.set(value);
  }

  setPointsFromInput(raw: string): void {
    const parsed = Number(raw.replace(',', '.'));
    if (raw.trim() === '' || Number.isNaN(parsed)) return;
    this.pointsState.set(parsed);
  }

  setReason(raw: string): void {
    this.reasonState.set(raw.slice(0, this.reasonLimit));
  }

  submit(): void {
    if (!this.canSubmit()) return;

    this.resolve.emit({
      questionId: this.conflict().questionId,
      points: this.points(),
      reason: this.reasonState().trim(),
    });
  }
}
