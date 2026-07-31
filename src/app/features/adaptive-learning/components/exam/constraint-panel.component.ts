import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { ConstraintSnapshot, ExamWizardStep, ValidationIssue } from '../../models/exam.model';

/**
 * Canlı kısıt paneli — wizard boyunca sağda sabit durur.
 *
 * Tüm sayılar `buildConstraintSnapshot()` çıktısındandır; bileşen hesap yapmaz,
 * yalnızca gösterir. Kural ihlalleri anında ve GEREKÇESİYLE listelenir; her
 * ihlal kullanıcıyı düzeltmesi gereken adıma götürür.
 */
@Component({
  selector: 'app-constraint-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, AppProgressBarComponent],
  templateUrl: './constraint-panel.component.html',
  styleUrl: './constraint-panel.component.scss',
})
export class ConstraintPanelComponent {
  readonly snapshot = input.required<ConstraintSnapshot>();
  /** İhlale tıklanınca ilgili adıma gidilir. */
  readonly issueSelect = output<ExamWizardStep>();

  readonly validation = computed(() => this.snapshot().validation);

  readonly errors = computed<readonly ValidationIssue[]>(() =>
    this.validation().issues.filter((issue) => issue.severity === 'error'),
  );
  readonly warnings = computed<readonly ValidationIssue[]>(() =>
    this.validation().issues.filter((issue) => issue.severity === 'warning'),
  );

  /** Hedefe göre durum: eşitse tamam, altındaysa eksik, üstündeyse fazla. */
  toneFor(actual: number, target: number): 'ok' | 'under' | 'over' {
    if (target === 0) return actual === 0 ? 'ok' : 'over';
    if (actual === target) return 'ok';
    return actual < target ? 'under' : 'over';
  }

  iconFor(actual: number, target: number) {
    const tone = this.toneFor(actual, target);
    return tone === 'ok' ? 'circle-check-big' : tone === 'under' ? 'arrow-down' : 'arrow-up';
  }
}
