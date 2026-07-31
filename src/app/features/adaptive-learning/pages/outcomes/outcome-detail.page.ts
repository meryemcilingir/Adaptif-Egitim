import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ApiError } from '../../../../core/api/api-error';
import { createPageRequest } from '../../../../core/api/page-request';
import { PermissionService } from '../../../../core/auth/permission.service';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import { MultiSelectOption } from '../../../../shared/components/app-multi-select/app-multi-select.component';
import { SelectOption } from '../../../../shared/components/app-select/app-select.component';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { DurationPipe } from '../../../../shared/pipes/duration.pipe';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import {
  PublishActionsComponent,
  TransitionRequest,
} from '../../components/publish-actions/publish-actions.component';
import { CourseRepository, OutcomeRepository } from '../../data-access/catalog.repository';
import { OutcomeFacade } from '../../data-access/outcome.facade';
import { COGNITIVE_LEVEL_LABELS, DIFFICULTY_LABELS } from '../../models/common.model';
import { LearningOutcome, OutcomeCreateRequest } from '../../models/learning-outcome.model';
import { buildPrerequisiteOptions } from '../../domain/prerequisite-options';
import { isEditable } from '../../domain/publish-workflow';
import { OutcomeFormComponent } from './outcome-form.component';
import { PrerequisiteEditorComponent } from './prerequisite-editor.component';

/** Kazanım detayı: künye, yayın iş akışı ve önkoşul yönetimi. */
@Component({
  selector: 'app-outcome-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppErrorStateComponent,
    AppLoadingStateComponent,
    AppStatusBadgeComponent,
    DurationPipe,
    OutcomeFormComponent,
    PrerequisiteEditorComponent,
    PublishActionsComponent,
    RelativeTimePipe,
  ],
  templateUrl: './outcome-detail.page.html',
  styleUrl: './outcome-detail.page.scss',
})
export class OutcomeDetailPage {
  protected readonly facade = inject(OutcomeFacade);
  private readonly outcomes = inject(OutcomeRepository);
  private readonly courses = inject(CourseRepository);
  private readonly dialogs = inject(DialogService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  private readonly editor = viewChild(PrerequisiteEditorComponent);

  private readonly courseOptionsState = signal<readonly SelectOption[]>([]);
  private readonly allOutcomesState = signal<readonly LearningOutcome[]>([]);
  private readonly formOpenState = signal(false);
  private readonly pendingTargetState = signal<TransitionRequest['state'] | null>(null);
  private readonly savingPrerequisitesState = signal(false);

  readonly courseOptions = this.courseOptionsState.asReadonly();
  readonly isFormOpen = this.formOpenState.asReadonly();
  readonly pendingTarget = this.pendingTargetState.asReadonly();
  readonly isSavingPrerequisites = this.savingPrerequisitesState.asReadonly();

  readonly labels = { level: COGNITIVE_LEVEL_LABELS, difficulty: DIFFICULTY_LABELS };

  readonly canWrite = computed(() => this.permissions.can('outcome:write'));
  readonly canEdit = computed(() => {
    const outcome = this.facade.detail();
    return this.canWrite() && outcome !== null && isEditable(outcome.state);
  });

  readonly courseLabel = computed(() => {
    const outcome = this.facade.detail();
    if (!outcome) return '';
    return (
      this.courseOptionsState().find((option) => option.value === outcome.courseId)?.label ?? ''
    );
  });

  readonly tagPool = computed(() =>
    [...new Set(this.allOutcomesState().flatMap((outcome) => outcome.tags))].sort((a, b) =>
      a.localeCompare(b, 'tr-TR'),
    ),
  );

  readonly prerequisiteOptions = computed<readonly MultiSelectOption[]>(() =>
    buildPrerequisiteOptions(this.allOutcomesState(), this.facade.detail()?.id ?? null),
  );

  constructor() {
    effect(() => {
      const id = this.id();
      this.facade.loadDetail(id);
      this.facade.loadPrerequisites(id);
      this.loadReferences();
    });
  }

  toneFor(state: string) {
    return statusPresentation(state);
  }

  goBack(): void {
    void this.router.navigate(['/outcomes']);
  }

  openOutcome(outcome: LearningOutcome): void {
    void this.router.navigate(['/outcomes', outcome.id]);
  }

  openGraph(outcome: LearningOutcome): void {
    void this.router.navigate(['/outcomes/map'], {
      queryParams: { courseId: outcome.courseId, focus: outcome.id },
    });
  }

  openForm(): void {
    this.formOpenState.set(true);
  }

  closeForm(): void {
    this.formOpenState.set(false);
  }

  onSave(payload: OutcomeCreateRequest, form: OutcomeFormComponent): void {
    const outcome = this.facade.detail();
    if (!outcome) return;

    this.facade.update(outcome, payload).subscribe({
      next: () => {
        this.closeForm();
        this.facade.loadPrerequisites(outcome.id);
        this.loadReferences();
      },
      error: (error: ApiError) => form.applyServerErrors(error),
    });
  }

  onSavePrerequisites(prerequisiteIds: readonly string[]): void {
    const outcome = this.facade.detail();
    if (!outcome) return;

    this.savingPrerequisitesState.set(true);
    this.facade.savePrerequisites(outcome, prerequisiteIds).subscribe({
      next: () => {
        this.savingPrerequisitesState.set(false);
        this.editor()?.finishEditing();
        this.loadReferences();
      },
      // Döngü hatası facade tarafından toast ile gösterilir; editör açık kalır.
      error: () => this.savingPrerequisitesState.set(false),
    });
  }

  onTransition(request: TransitionRequest): void {
    const outcome = this.facade.detail();
    if (!outcome) return;

    this.pendingTargetState.set(request.state);
    this.facade.transition(outcome, request.state, request.reason).subscribe({
      next: () => this.pendingTargetState.set(null),
      error: () => this.pendingTargetState.set(null),
    });
  }

  async confirmDelete(): Promise<void> {
    const outcome = this.facade.detail();
    if (!outcome) return;

    const confirmed = await this.dialogs.confirm({
      title: 'Kazanımı sil',
      message: `"${outcome.title}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (!confirmed) return;

    this.facade.remove(outcome).subscribe({
      next: () => this.goBack(),
      error: () => undefined,
    });
  }

  private loadReferences(): void {
    forkJoin({
      courses: this.courses.list(createPageRequest({ size: 200 })),
      outcomes: this.outcomes.list(createPageRequest({ size: 500 })),
    }).subscribe({
      next: ({ courses, outcomes }) => {
        this.courseOptionsState.set(
          courses.items.map((course) => ({
            value: course.id,
            label: `${course.code} · ${course.name}`,
          })),
        );
        this.allOutcomesState.set(outcomes.items);
      },
    });
  }
}
