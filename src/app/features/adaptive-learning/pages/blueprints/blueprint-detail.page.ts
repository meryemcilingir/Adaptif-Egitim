import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { PermissionService } from '../../../../core/auth/permission.service';
import { AppBreadcrumbComponent } from '../../../../shared/components/app-breadcrumb/app-breadcrumb.component';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppFormFieldComponent } from '../../../../shared/components/app-form-field/app-form-field.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppInputComponent } from '../../../../shared/components/app-input/app-input.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppNumberInputComponent } from '../../../../shared/components/app-number-input/app-number-input.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTextareaComponent } from '../../../../shared/components/app-textarea/app-textarea.component';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { PublishState } from '../../models/common.model';
import { BLUEPRINT_LIMITS, BlueprintOutcomeRow } from '../../models/blueprint.model';
import { alignRows } from '../../domain/blueprint.rules';
import { availableActions } from '../../domain/publish-workflow';
import {
  BlueprintEditorComponent,
  CellChange,
} from '../../components/exam/blueprint-editor.component';
import {
  PublishActionsComponent,
  TransitionRequest,
} from '../../components/publish-actions/publish-actions.component';
import { BlueprintFacade } from '../../data-access/blueprint.facade';

/**
 * Blueprint detayı ve editörü.
 *
 * Taslak durumdayken tablo düzenlenebilir; yayına alınmış plan salt okunurdur.
 * Özet, sunucuya gitmeden `summarizeBlueprint` ile yerelde hesaplanır — kullanıcı
 * her hücre değişiminde sonucu anında görür.
 */
@Component({
  selector: 'app-blueprint-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AppBreadcrumbComponent,
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppFormFieldComponent,
    AppIconComponent,
    AppInputComponent,
    AppLoadingStateComponent,
    AppNumberInputComponent,
    AppStatusBadgeComponent,
    AppTextareaComponent,
    BlueprintEditorComponent,
    PublishActionsComponent,
  ],
  templateUrl: './blueprint-detail.page.html',
  styleUrl: './blueprint-detail.page.scss',
})
export class BlueprintDetailPage implements OnInit, OnDestroy {
  protected readonly facade = inject(BlueprintFacade);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly id = input.required<string>();
  readonly limits = BLUEPRINT_LIMITS;

  private readonly rowsState = signal<readonly BlueprintOutcomeRow[]>([]);
  /**
   * Hedefler formda tutulur ama özet bir `computed`; Reactive Forms sinyal
   * yaymadığı için değerler `valueChanges` üzerinden sinyale aynalanır.
   */
  private readonly targetsState = signal({ points: 100, duration: 60 });
  private readonly dirtyState = signal(false);
  private readonly savingState = signal(false);
  private readonly pendingTargetState = signal<PublishState | null>(null);

  readonly rows = this.rowsState.asReadonly();
  readonly targets = this.targetsState.asReadonly();
  readonly isDirty = this.dirtyState.asReadonly();
  readonly isSaving = this.savingState.asReadonly();
  readonly pendingTarget = this.pendingTargetState.asReadonly();

  readonly detail = this.facade.blueprintDetail;
  readonly blueprint = computed(() => this.detail()?.blueprint ?? null);

  readonly canWrite = computed(() => this.permissions.can('exam:write'));
  /*
   * Sorunun/sınavın aksine blueprint'in yayındaki içeriği hiçbir yerde donmuş
   * bir referans (snapshot) olarak KULLANILMAZ — sınavlar auto-select
   * sırasında satırları okuyup kendi soru listesini saklar; blueprint sonradan
   * değişse bile geçmiş sınavlar etkilenmez. Bu yüzden "yayındaki kayıt
   * donar" kuralı burada uygulanmaz; Ölçme Uzmanı hedef sayıları istediği
   * zaman güncelleyebilir. Yalnızca arşivlenmiş bir plan kilitli kalır.
   */
  readonly canEdit = computed(() => this.canWrite() && this.blueprint()?.state !== 'ARCHIVED');

  readonly form = this.fb.nonNullable.group({
    name: [
      '',
      [
        Validators.required,
        Validators.minLength(BLUEPRINT_LIMITS.name.min),
        Validators.maxLength(BLUEPRINT_LIMITS.name.max),
      ],
    ],
    description: ['', [Validators.maxLength(BLUEPRINT_LIMITS.description.max)]],
    targetTotalPoints: [
      100,
      [
        Validators.required,
        Validators.min(BLUEPRINT_LIMITS.targetTotalPoints.min),
        Validators.max(BLUEPRINT_LIMITS.targetTotalPoints.max),
      ],
    ],
    targetDurationMinutes: [
      60,
      [
        Validators.required,
        Validators.min(BLUEPRINT_LIMITS.targetDurationMinutes.min),
        Validators.max(BLUEPRINT_LIMITS.targetDurationMinutes.max),
      ],
    ],
  });

  readonly nameControl = this.form.controls.name;
  readonly descriptionControl = this.form.controls.description;
  readonly pointsControl = this.form.controls.targetTotalPoints;
  readonly durationControl = this.form.controls.targetDurationMinutes;

  readonly statusView = computed(() => statusPresentation(this.blueprint()?.state ?? 'DRAFT'));

  readonly breadcrumbs = computed(() => [
    { label: 'Ölçme planları', link: '/blueprints' },
    { label: this.blueprint()?.name ?? 'Plan' },
  ]);

  constructor() {
    // Detay geldiğinde formu ve satırları doldur; dersin tüm kazanımları için
    // eksik satırlar sıfırla tamamlanır ki tablo tam görünsün.
    effect(() => {
      const detail = this.detail();
      if (!detail) return;

      untracked(() => {
        this.form.reset({
          name: detail.blueprint.name,
          description: detail.blueprint.description,
          targetTotalPoints: detail.blueprint.targetTotalPoints,
          targetDurationMinutes: detail.blueprint.targetDurationMinutes,
        });
        this.targetsState.set({
          points: detail.blueprint.targetTotalPoints,
          duration: detail.blueprint.targetDurationMinutes,
        });
        this.rowsState.set(
          alignRows(
            detail.blueprint.rows,
            detail.outcomes.map((outcome) => outcome.id),
          ),
        );
        this.dirtyState.set(false);
      });
    });

    this.form.valueChanges.subscribe((value) => {
      this.dirtyState.set(true);
      this.targetsState.set({
        points: value.targetTotalPoints ?? 0,
        duration: value.targetDurationMinutes ?? 0,
      });
    });
  }

  ngOnInit(): void {
    this.facade.loadBlueprintDetail(this.id());
  }

  ngOnDestroy(): void {
    this.facade.clearBlueprintDetail();
  }

  reload(): void {
    this.facade.loadBlueprintDetail(this.id());
  }

  /* ── Tablo düzenleme ─────────────────────────────────────────────────── */

  onCellChange(change: CellChange): void {
    const clamped = Math.max(
      BLUEPRINT_LIMITS.questionsPerCell.min,
      Math.min(BLUEPRINT_LIMITS.questionsPerCell.max, Math.trunc(change.value) || 0),
    );

    this.rowsState.update((rows) =>
      rows.map((row) =>
        row.outcomeId === change.outcomeId ? { ...row, [change.difficulty]: clamped } : row,
      ),
    );
    this.dirtyState.set(true);
  }

  /* ── Kaydetme ve iş akışı ────────────────────────────────────────────── */

  save(): void {
    const blueprint = this.blueprint();
    if (!blueprint || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.savingState.set(true);
    const value = this.form.getRawValue();

    this.facade
      .update(blueprint, {
        name: value.name.trim(),
        description: value.description.trim(),
        courseId: blueprint.courseId,
        cohortId: blueprint.cohortId,
        // Boş satırlar saklanmaz; tablo görünümü `alignRows` ile yeniden kurulur.
        rows: this.rowsState().filter((row) => row.easy + row.medium + row.hard > 0),
        targetTotalPoints: value.targetTotalPoints,
        targetDurationMinutes: value.targetDurationMinutes,
      })
      .subscribe({
        next: () => {
          this.savingState.set(false);
          this.dirtyState.set(false);
          this.reload();
        },
        error: () => this.savingState.set(false),
      });
  }

  onTransition(request: TransitionRequest): void {
    const blueprint = this.blueprint();
    if (!blueprint) return;

    this.pendingTargetState.set(request.state);
    this.facade.transition(blueprint, request.state, request.reason).subscribe({
      next: () => {
        this.pendingTargetState.set(null);
        this.reload();
      },
      error: () => this.pendingTargetState.set(null),
    });
  }

  hasWorkflowActions(state: PublishState): boolean {
    return availableActions(state).length > 0;
  }

  async confirmDelete(): Promise<void> {
    const detail = this.detail();
    if (!detail) return;

    const usage =
      detail.examCount > 0
        ? ` Bu plana bağlı ${detail.examCount} sınav var; bağlantıları kopacak.`
        : '';

    const confirmed = await this.dialogs.confirm({
      title: 'Planı sil',
      message: `"${detail.blueprint.name}" kalıcı olarak silinecek.${usage} Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (confirmed) {
      this.facade.remove(detail.blueprint).subscribe({
        next: () => void this.router.navigate(['/blueprints']),
        error: () => undefined,
      });
    }
  }
}
