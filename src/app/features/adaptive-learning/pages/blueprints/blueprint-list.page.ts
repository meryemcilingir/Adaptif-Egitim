import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  TemplateRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { createPageRequest } from '../../../../core/api/page-request';
import { PermissionService } from '../../../../core/auth/permission.service';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import {
  AppDropdownComponent,
  DropdownItem,
} from '../../../../shared/components/app-dropdown/app-dropdown.component';
import { AppFilterBarComponent } from '../../../../shared/components/app-filter-bar/app-filter-bar.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { FilterDefinition } from '../../../../shared/components/app-filter-bar/filter-definition';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../../shared/components/app-table/column-def';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { PUBLISH_STATES, PUBLISH_STATE_LABELS, PublishState } from '../../models/common.model';
import { ExamBlueprint } from '../../models/blueprint.model';
import { blueprintTotalQuestions } from '../../domain/blueprint.rules';
import { availableActions } from '../../domain/publish-workflow';
import { CourseRepository, ReferenceRepository } from '../../data-access/catalog.repository';
import { BlueprintFacade } from '../../data-access/blueprint.facade';

interface Reference {
  readonly id: string;
  readonly label: string;
}

/**
 * Blueprint (ölçme planı) listesi.
 *
 * Ders geneli planlar ile gruba özel (cohort) planlar aynı listede durur; ayrım
 * "Kapsam" sütunu ve `scope` filtresiyle yapılır — iki ayrı ekran açmak, aynı
 * kavramı ikiye böleceği için tercih edilmedi.
 */
@Component({
  selector: 'app-blueprint-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDropdownComponent,
    AppFilterBarComponent,
    AppIconComponent,
    AppStatusBadgeComponent,
    AppTableComponent,
  ],
  templateUrl: './blueprint-list.page.html',
  styleUrl: './blueprint-list.page.scss',
})
export class BlueprintListPage implements OnInit {
  protected readonly facade = inject(BlueprintFacade);
  private readonly courses = inject(CourseRepository);
  private readonly reference = inject(ReferenceRepository);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  private readonly nameCell =
    viewChild.required<TemplateRef<{ $implicit: ExamBlueprint }>>('nameCell');
  private readonly scopeCell =
    viewChild.required<TemplateRef<{ $implicit: ExamBlueprint }>>('scopeCell');
  private readonly stateCell =
    viewChild.required<TemplateRef<{ $implicit: ExamBlueprint }>>('stateCell');
  private readonly actionsCell =
    viewChild.required<TemplateRef<{ $implicit: ExamBlueprint }>>('actionsCell');

  private readonly courseListState = signal<readonly Reference[]>([]);
  private readonly cohortListState = signal<readonly Reference[]>([]);
  private readonly activeCourseId = signal<string | null>(null);

  readonly courseList = this.courseListState.asReadonly();
  readonly canWrite = computed(() => this.permissions.can('exam:write'));

  /*
   * Liste sıralı ama karmaşık duruyordu: ders geneli ve gruba özel onlarca
   * plan aynı büyük tabloda karışıyordu. Soru bankasındaki desenle aynı
   * şekilde önce DERS seçilir, sonra o dersin planları görünür.
   */
  readonly showCourseGrid = computed(
    () => this.activeCourseId() === null && !this.facade.isFiltered(),
  );

  readonly selectedCourseLabel = computed(
    () => this.courseListState().find((course) => course.id === this.activeCourseId())?.label ?? null,
  );

  private readonly cohortNames = computed(
    () => new Map(this.cohortListState().map((cohort) => [cohort.id, cohort.label])),
  );

  private readonly courseNames = computed(
    () => new Map(this.courseListState().map((course) => [course.id, course.label])),
  );

  scopeLabel(blueprint: ExamBlueprint): string {
    if (!blueprint.cohortId) return 'Ders geneli';
    return this.cohortNames().get(blueprint.cohortId) ?? 'Gruba özel';
  }

  courseLabel(blueprint: ExamBlueprint): string {
    return this.courseNames().get(blueprint.courseId) ?? '—';
  }

  questionCount(blueprint: ExamBlueprint): number {
    return blueprintTotalQuestions(blueprint.rows);
  }

  toneFor(state: string) {
    return statusPresentation(state);
  }

  readonly columns = computed<readonly ColumnDef<ExamBlueprint>[]>(() => [
    { key: 'name', header: 'Plan', sortable: true, cell: this.nameCell() },
    { key: 'cohortId', header: 'Kapsam', width: '180px', cell: this.scopeCell() },
    { key: 'state', header: 'Durum', sortable: true, width: '130px', cell: this.stateCell() },
    {
      key: 'questionCount',
      header: 'Soru',
      align: 'end',
      numeric: true,
      width: '80px',
      hideBelow: 'tablet',
      value: (row) => this.questionCount(row),
    },
    {
      key: 'targetTotalPoints',
      header: 'Puan',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '80px',
      hideBelow: 'tablet',
      value: (row) => row.targetTotalPoints,
    },
    {
      key: 'targetDurationMinutes',
      header: 'Süre',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '90px',
      hideBelow: 'laptop',
      value: (row) => `${row.targetDurationMinutes} dk`,
    },
    {
      key: 'updatedAt',
      header: 'Güncelleme',
      sortable: true,
      width: '130px',
      hideBelow: 'laptop',
      value: (row) => new Date(row.updatedAt).toLocaleDateString('tr-TR'),
    },
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
      options: this.courseListState().map((course) => ({
        value: course.id,
        label: course.label,
      })),
    },
    {
      key: 'cohortId',
      label: 'Grup',
      kind: 'single',
      options: this.cohortListState().map((cohort) => ({
        value: cohort.id,
        label: cohort.label,
      })),
    },
  ]);

  ngOnInit(): void {
    this.loadReferences();
  }

  /* ── Ders seçimi (kartlı görünüm) ──────────────────────────────────────── */

  selectCourse(courseId: string): void {
    this.activeCourseId.set(courseId);
    this.facade.setFilter('courseId', courseId);
  }

  backToCourses(): void {
    this.activeCourseId.set(null);
    this.facade.clearFilters();
  }

  /* ── Satır işlemleri ─────────────────────────────────────────────────── */

  rowActions(blueprint: ExamBlueprint): readonly DropdownItem[] {
    const items: DropdownItem[] = [{ id: 'detail', label: 'Detayı aç', icon: 'external-link' }];

    if (this.canWrite()) {
      for (const action of availableActions(blueprint.state)) {
        items.push({ id: `state:${action.target}`, label: action.label, icon: action.icon });
      }

      items.push({
        id: 'delete',
        label: 'Sil',
        icon: 'trash-2',
        tone: 'danger',
        separatorBefore: true,
        disabled: blueprint.state !== 'DRAFT',
      });
    }

    return items;
  }

  onRowAction(blueprint: ExamBlueprint, item: DropdownItem): void {
    if (item.id === 'detail') return this.openDetail(blueprint);
    if (item.id === 'delete') return void this.confirmDelete(blueprint);

    if (item.id.startsWith('state:')) {
      void this.runTransition(blueprint, item.id.slice('state:'.length) as PublishState);
    }
  }

  openDetail(blueprint: ExamBlueprint): void {
    void this.router.navigate(['/blueprints', blueprint.id]);
  }

  createBlueprint(): void {
    const courseId = this.currentCourseFilter() ?? this.courseListState()[0]?.id;
    if (!courseId) return;

    this.facade
      .create({
        name: `Yeni ölçme planı ${new Date().toLocaleDateString('tr-TR')}`,
        description: '',
        courseId,
        cohortId: null,
        rows: [],
        targetTotalPoints: 100,
        targetDurationMinutes: 60,
      })
      .subscribe({
        next: (blueprint) => this.openDetail(blueprint),
        error: () => undefined,
      });
  }

  currentCourseFilter(): string | null {
    const value = this.facade.query().filters['courseId'];
    return typeof value === 'string' ? value : null;
  }

  private async confirmDelete(blueprint: ExamBlueprint): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'Planı sil',
      message: `"${blueprint.name}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (confirmed) this.facade.remove(blueprint).subscribe({ error: () => undefined });
  }

  private async runTransition(blueprint: ExamBlueprint, state: PublishState): Promise<void> {
    const action = availableActions(blueprint.state).find((item) => item.target === state);
    if (!action) return;

    if (!action.requiresConfirmation) {
      this.facade.transition(blueprint, state).subscribe({ error: () => undefined });
      return;
    }

    const result = await this.dialogs.ask({
      title: action.label,
      message: `"${blueprint.name}" — ${action.description}`,
      confirmLabel: action.label,
      tone: action.tone === 'warning' ? 'warning' : 'primary',
      requireReason: true,
      reasonLabel: 'Gerekçe',
      reasonHint: 'Bu açıklama denetim kaydına yazılır. En az 10 karakter girin.',
    });

    if (result.confirmed) {
      this.facade.transition(blueprint, state, result.reason).subscribe({ error: () => undefined });
    }
  }

  private loadReferences(): void {
    forkJoin({
      courses: this.courses.list(createPageRequest({ size: 200 })),
      cohorts: this.reference.cohorts(),
    }).subscribe({
      next: ({ courses, cohorts }) => {
        this.courseListState.set(
          courses.items.map((course) => ({
            id: course.id,
            label: `${course.code} · ${course.name}`,
          })),
        );
        this.cohortListState.set(
          cohorts.map((cohort) => ({ id: cohort.id, label: cohort.name })),
        );
      },
    });
  }
}
