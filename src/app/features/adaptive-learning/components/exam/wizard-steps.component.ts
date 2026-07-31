import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import {
  EXAM_WIZARD_STEPS,
  EXAM_WIZARD_STEP_HINTS,
  EXAM_WIZARD_STEP_LABELS,
  ExamWizardStep,
} from '../../models/exam.model';

/**
 * Wizard adım göstergesi.
 *
 * Kilitli adımlar tıklanamaz — kullanıcı önceki adımın asgari koşulunu
 * sağlamadan ilerleyemez. Tamamlanan adımlar tik ile işaretlenir, böylece
 * "nerede kaldım" sorusu tek bakışta yanıtlanır.
 */
@Component({
  selector: 'app-wizard-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  templateUrl: './wizard-steps.component.html',
  styleUrl: './wizard-steps.component.scss',
})
export class WizardStepsComponent {
  readonly current = input.required<ExamWizardStep>();
  readonly availability = input.required<Readonly<Record<ExamWizardStep, boolean>>>();

  readonly stepSelect = output<ExamWizardStep>();

  readonly labels = EXAM_WIZARD_STEP_LABELS;
  readonly hints = EXAM_WIZARD_STEP_HINTS;

  readonly steps = computed(() => {
    const currentIndex = EXAM_WIZARD_STEPS.indexOf(this.current());
    const availability = this.availability();

    return EXAM_WIZARD_STEPS.map((step, index) => ({
      step,
      index,
      number: index + 1,
      isCurrent: index === currentIndex,
      // Geçilmiş VE erişilebilir adım tamamlanmış sayılır.
      isComplete: index < currentIndex && availability[step],
      isLocked: !availability[step],
    }));
  });
}
