import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import {
  AppMultiSelectComponent,
  MultiSelectOption,
} from '../../../../shared/components/app-multi-select/app-multi-select.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { LearningOutcome } from '../../models/learning-outcome.model';

/**
 * Önkoşul yönetimi paneli.
 *
 * Üç işlemi tek yerde toplar: görüntüleme, ekleme ve kaldırma. Döngü oluşturacak
 * adaylar seçicide devre dışıdır (BR-01); bağımlı kazanımlar da ayrıca listelenir
 * ki kullanıcı bu kazanımı silmenin/değiştirmenin etkisini görsün.
 */
@Component({
  selector: 'app-prerequisite-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppEmptyStateComponent,
    AppIconComponent,
    AppMultiSelectComponent,
    AppStatusBadgeComponent,
    FormsModule,
  ],
  templateUrl: './prerequisite-editor.component.html',
  styleUrl: './prerequisite-editor.component.scss',
})
export class PrerequisiteEditorComponent {
  readonly prerequisites = input.required<readonly LearningOutcome[]>();
  readonly dependents = input.required<readonly LearningOutcome[]>();
  readonly options = input.required<readonly MultiSelectOption[]>();
  readonly maxPrerequisites = input(10);
  readonly editable = input(true);
  readonly saving = input(false);

  readonly save = output<readonly string[]>();
  readonly outcomeSelect = output<LearningOutcome>();

  private readonly editingState = signal(false);
  private readonly draftState = signal<readonly string[]>([]);

  readonly isEditing = this.editingState.asReadonly();
  readonly draft = this.draftState.asReadonly();

  readonly hasChanges = computed(() => {
    const current = [...this.prerequisites().map((item) => item.id)].sort();
    const draft = [...this.draftState()].sort();
    return current.length !== draft.length || current.some((id, index) => id !== draft[index]);
  });

  toneFor(state: string) {
    return statusPresentation(state);
  }

  startEditing(): void {
    this.draftState.set(this.prerequisites().map((item) => item.id));
    this.editingState.set(true);
  }

  cancelEditing(): void {
    this.editingState.set(false);
    this.draftState.set([]);
  }

  onDraftChange(value: readonly string[]): void {
    this.draftState.set(value);
  }

  commit(): void {
    if (!this.hasChanges()) {
      this.cancelEditing();
      return;
    }
    this.save.emit(this.draftState());
  }

  /** Kaydetme başarılı olduğunda sayfa tarafından çağrılır. */
  finishEditing(): void {
    this.editingState.set(false);
    this.draftState.set([]);
  }

  removeOne(outcome: LearningOutcome): void {
    this.save.emit(
      this.prerequisites()
        .filter((item) => item.id !== outcome.id)
        .map((item) => item.id),
    );
  }
}
