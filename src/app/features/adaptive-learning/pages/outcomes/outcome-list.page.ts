import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  TemplateRef,
  computed,
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
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import {
  AppDropdownComponent,
  DropdownItem,
} from '../../../../shared/components/app-dropdown/app-dropdown.component';
import { AppFilterBarComponent } from '../../../../shared/components/app-filter-bar/app-filter-bar.component';
import { FilterDefinition } from '../../../../shared/components/app-filter-bar/filter-definition';
import { MultiSelectOption } from '../../../../shared/components/app-multi-select/app-multi-select.component';
import { SelectOption } from '../../../../shared/components/app-select/app-select.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../../shared/components/app-table/column-def';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import {
  COGNITIVE_LEVELS,
  COGNITIVE_LEVEL_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  PUBLISH_STATES,
  PUBLISH_STATE_LABELS,
  PublishState,
} from '../../models/common.model';
import { LearningOutcome, OutcomeCreateRequest } from '../../models/learning-outcome.model';
import { availableActions } from '../../domain/publish-workflow';
import { buildPrerequisiteOptions } from '../../domain/prerequisite-options';
import { CourseRepository, OutcomeRepository } from '../../data-access/catalog.repository';
import { OutcomeFacade } from '../../data-access/outcome.facade';
import { OutcomeFormComponent } from './outcome-form.component';

/**
 * Kazanım listesi — arama, çoklu filtre (durum, seviye, zorluk, ders, etiket),
 * kolon sıralaması ve sayfalama.
 */
@Component({
  selector: 'app-outcome-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDropdownComponent,
    AppFilterBarComponent,
    AppStatusBadgeComponent,
    AppTableComponent,
    OutcomeFormComponent,
  ],
  templateUrl: './outcome-list.page.html',
})
export class OutcomeListPage implements OnInit {
  protected readonly facade = inject(OutcomeFacade);
  private readonly outcomes = inject(OutcomeRepository);
  private readonly courses = inject(CourseRepository);
  private readonly dialogs = inject(DialogService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  /** Route'tan gelen ders filtresi (ders detayından "tümünü yönet" ile). */
  readonly courseId = input<string | null>(null);

  private readonly titleCell =
    viewChild.required<TemplateRef<{ $implicit: LearningOutcome }>>('titleCell');
  private readonly metaCell =
    viewChild.required<TemplateRef<{ $implicit: LearningOutcome }>>('metaCell');
  private readonly tagsCell =
    viewChild.required<TemplateRef<{ $implicit: LearningOutcome }>>('tagsCell');
  private readonly stateCell =
    viewChild.required<TemplateRef<{ $implicit: LearningOutcome }>>('stateCell');
  private readonly actionsCell =
    viewChild.required<TemplateRef<{ $implicit: LearningOutcome }>>('actionsCell');

  private readonly courseOptionsState = signal<readonly SelectOption[]>([]);
  private readonly allOutcomesState = signal<readonly LearningOutcome[]>([]);
  private readonly formOpenState = signal(false);
  private readonly editingState = signal<LearningOutcome | null>(null);

  readonly courseOptions = this.courseOptionsState.asReadonly();
  readonly isFormOpen = this.formOpenState.asReadonly();
  readonly editing = this.editingState.asReadonly();

  readonly canWrite = computed(() => this.permissions.can('outcome:write'));
  readonly canCreate = computed(() => this.canWrite() && this.courseOptionsState().length > 0);

  /*
   * Şablon hücreleri (`ng-template let-outcome`) tipsizdir; etiket çözümü bu
   * yardımcılar üzerinden yapılır ki `strictTemplates` altında güvenli kalsın.
   */
  levelLabel(value: string): string {
    return COGNITIVE_LEVEL_LABELS[value as keyof typeof COGNITIVE_LEVEL_LABELS] ?? value;
  }

  difficultyLabel(value: string): string {
    return DIFFICULTY_LABELS[value as keyof typeof DIFFICULTY_LABELS] ?? value;
  }

  /** Tüm kazanımlardan toplanan etiket havuzu — filtre ve öneri listesi. */
  readonly tagPool = computed(() =>
    [...new Set(this.allOutcomesState().flatMap((outcome) => outcome.tags))].sort((a, b) =>
      a.localeCompare(b, 'tr-TR'),
    ),
  );

  /**
   * Önkoşul adayları. Döngü oluşturacak kazanımlar devre dışı bırakılır ve
   * nedeni yazılır — kontrol istemcide de sunucudakiyle AYNI saf fonksiyonla yapılır.
   */
  readonly prerequisiteOptions = computed<readonly MultiSelectOption[]>(() =>
    buildPrerequisiteOptions(this.allOutcomesState(), this.editingState()?.id ?? null),
  );

  readonly columns = computed<readonly ColumnDef<LearningOutcome>[]>(() => [
    { key: 'code', header: 'Kod', sortable: true, width: '140px', value: (row) => row.code },
    { key: 'title', header: 'Kazanım', sortable: true, cell: this.titleCell() },
    { key: 'level', header: 'Seviye / Zorluk', width: '170px', cell: this.metaCell() },
    {
      key: 'estimatedDurationMinutes',
      header: 'Süre',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '90px',
      hideBelow: 'tablet',
      value: (row) => `${row.estimatedDurationMinutes} dk`,
    },
    {
      key: 'prerequisiteCount',
      header: 'Önkoşul',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '100px',
      hideBelow: 'laptop',
      value: (row) => row.prerequisiteIds.length,
    },
    {
      key: 'tags',
      header: 'Etiketler',
      width: '200px',
      hideBelow: 'laptop',
      cell: this.tagsCell(),
    },
    { key: 'state', header: 'Durum', sortable: true, width: '150px', cell: this.stateCell() },
    { key: 'actions', header: '', align: 'end', width: '60px', cell: this.actionsCell() },
  ]);

  readonly filters = computed<readonly FilterDefinition[]>(() => [
    {
      key: 'state',
      label: 'Durum',
      kind: 'multi',
      options: PUBLISH_STATES.map((state) => ({
        value: state,
        label: PUBLISH_STATE_LABELS[state],
      })),
    },
    {
      key: 'courseId',
      label: 'Ders',
      kind: 'single',
      options: this.courseOptionsState().map((option) => ({
        value: option.value,
        label: option.label,
      })),
    },
    {
      key: 'difficulty',
      label: 'Zorluk',
      kind: 'multi',
      options: DIFFICULTIES.map((value) => ({ value, label: DIFFICULTY_LABELS[value] })),
    },
    {
      key: 'level',
      label: 'Bilişsel seviye',
      kind: 'multi',
      options: COGNITIVE_LEVELS.map((value) => ({ value, label: COGNITIVE_LEVEL_LABELS[value] })),
    },
    {
      key: 'tags',
      label: 'Etiket',
      kind: 'multi',
      options: this.tagPool().map((tag) => ({ value: tag, label: tag })),
    },
  ]);

  ngOnInit(): void {
    const courseId = this.courseId();
    if (courseId) this.facade.setFilter('courseId', courseId);
    else this.facade.load();

    this.loadReferences();
  }

  toneFor(state: string) {
    return statusPresentation(state);
  }

  rowActions(outcome: LearningOutcome): readonly DropdownItem[] {
    const items: DropdownItem[] = [{ id: 'detail', label: 'Detayı aç', icon: 'external-link' }];

    if (this.canWrite()) {
      items.push({
        id: 'edit',
        label: 'Düzenle',
        icon: 'pencil-line',
        disabled: outcome.state === 'PUBLISHED' || outcome.state === 'ARCHIVED',
      });

      for (const action of availableActions(outcome.state)) {
        items.push({ id: `state:${action.target}`, label: action.label, icon: action.icon });
      }

      items.push({
        id: 'delete',
        label: 'Sil',
        icon: 'x',
        tone: 'danger',
        separatorBefore: true,
        disabled: outcome.state !== 'DRAFT',
      });
    }

    return items;
  }

  onRowAction(outcome: LearningOutcome, item: DropdownItem): void {
    if (item.id === 'detail') return this.openDetail(outcome);
    if (item.id === 'edit') return this.openForm(outcome);
    if (item.id === 'delete') return void this.confirmDelete(outcome);
    if (item.id.startsWith('state:')) {
      void this.runTransition(outcome, item.id.slice('state:'.length) as PublishState);
    }
  }

  openDetail(outcome: LearningOutcome): void {
    void this.router.navigate(['/outcomes', outcome.id]);
  }

  openGraph(): void {
    const courseId = this.facade.query().filters['courseId'];
    void this.router.navigate(['/outcomes/map'], {
      queryParams: typeof courseId === 'string' ? { courseId } : undefined,
    });
  }

  openForm(outcome: LearningOutcome | null): void {
    this.editingState.set(outcome);
    this.formOpenState.set(true);
  }

  closeForm(): void {
    this.formOpenState.set(false);
    this.editingState.set(null);
  }

  onSave(payload: OutcomeCreateRequest, form: OutcomeFormComponent): void {
    const editing = this.editingState();
    const request = editing ? this.facade.update(editing, payload) : this.facade.create(payload);

    request.subscribe({
      next: () => {
        this.closeForm();
        this.facade.load();
        this.loadReferences();
      },
      error: (error: ApiError) => form.applyServerErrors(error),
    });
  }

  currentCourseFilter(): string | null {
    const value = this.facade.query().filters['courseId'];
    return typeof value === 'string' ? value : null;
  }

  private async confirmDelete(outcome: LearningOutcome): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'Kazanımı sil',
      message: `"${outcome.title}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (confirmed) {
      this.facade.remove(outcome).subscribe({
        next: () => this.loadReferences(),
        error: () => undefined,
      });
    }
  }

  private async runTransition(outcome: LearningOutcome, state: PublishState): Promise<void> {
    const action = availableActions(outcome.state).find((item) => item.target === state);
    if (!action) return;

    if (!action.requiresConfirmation) {
      this.facade.transition(outcome, state).subscribe({ error: () => undefined });
      return;
    }

    const result = await this.dialogs.ask({
      title: action.label,
      message: `"${outcome.title}" — ${action.description}`,
      confirmLabel: action.label,
      tone: action.tone === 'warning' ? 'warning' : 'primary',
      requireReason: true,
      reasonLabel: 'Gerekçe',
      reasonHint: 'Bu açıklama denetim kaydına yazılır. En az 10 karakter girin.',
    });

    if (result.confirmed) {
      this.facade.transition(outcome, state, result.reason).subscribe({ error: () => undefined });
    }
  }

  /** Form açılır listeleri ve önkoşul grafiği için tüm kazanımlar/dersler. */
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
