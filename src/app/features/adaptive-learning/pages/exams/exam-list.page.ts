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
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../../shared/components/app-table/column-def';
import { SelectOption } from '../../../../shared/components/app-select/app-select.component';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { PUBLISH_STATES, PUBLISH_STATE_LABELS, PublishState } from '../../models/common.model';
import { ExamBlueprint } from '../../models/blueprint.model';
import { EXAM_RUNTIME_LABELS, Exam, ExamRuntimeStatus } from '../../models/exam.model';
import { availableActions } from '../../domain/publish-workflow';
import { examRuntimeStatus } from '../../domain/exam-runtime';
import { CourseRepository } from '../../data-access/catalog.repository';
import { ExamFacade } from '../../data-access/exam.facade';
import { BlueprintRepository } from '../../data-access/exam.repository';

/**
 * Sınav listesi.
 *
 * Yazım durumu (taslak/yayında) ile çalışma durumu (planlandı/devam ediyor/kapandı)
 * AYRI iki rozette gösterilir; ikisi farklı sorulara cevap verir ve karıştırılmaz.
 */
@Component({
  selector: 'app-exam-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDropdownComponent,
    AppFilterBarComponent,
    AppStatusBadgeComponent,
    AppTableComponent,
  ],
  templateUrl: './exam-list.page.html',
  styleUrl: './exam-list.page.scss',
})
export class ExamListPage implements OnInit {
  protected readonly facade = inject(ExamFacade);
  private readonly courses = inject(CourseRepository);
  private readonly blueprints = inject(BlueprintRepository);
  private readonly permissions = inject(PermissionService);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);

  readonly courseId = input<string | null>(null);

  private readonly titleCell = viewChild.required<TemplateRef<{ $implicit: Exam }>>('titleCell');
  private readonly stateCell = viewChild.required<TemplateRef<{ $implicit: Exam }>>('stateCell');
  private readonly runtimeCell =
    viewChild.required<TemplateRef<{ $implicit: Exam }>>('runtimeCell');
  private readonly actionsCell =
    viewChild.required<TemplateRef<{ $implicit: Exam }>>('actionsCell');

  private readonly courseOptionsState = signal<readonly SelectOption[]>([]);
  private readonly blueprintListState = signal<readonly ExamBlueprint[]>([]);
  private readonly creatingState = signal(false);

  readonly canWrite = computed(() => this.permissions.can('exam:write'));
  /** İş akışı geçişleri ayrı yetkidir; sunucu her geçişte bunu arar. */
  readonly canPublish = computed(() => this.permissions.can('exam:publish'));
  readonly isCreating = this.creatingState.asReadonly();

  /** Şablonda çalışma durumu — tarihlerden türetilir, saklanmaz. */
  private readonly nowMs = Date.now();

  runtimeOf(exam: Exam): ExamRuntimeStatus {
    return examRuntimeStatus(exam, this.nowMs);
  }

  runtimeLabel(exam: Exam): string {
    return EXAM_RUNTIME_LABELS[this.runtimeOf(exam)];
  }

  runtimeTone(exam: Exam): 'neutral' | 'info' | 'primary' | 'success' {
    switch (this.runtimeOf(exam)) {
      case 'scheduled':
        return 'info';
      case 'active':
        return 'primary';
      case 'closed':
        return 'success';
      default:
        return 'neutral';
    }
  }

  toneFor(state: string) {
    return statusPresentation(state);
  }

  readonly columns = computed<readonly ColumnDef<Exam>[]>(() => [
    { key: 'title', header: 'Sınav', sortable: true, cell: this.titleCell() },
    { key: 'state', header: 'Durum', sortable: true, width: '140px', cell: this.stateCell() },
    { key: 'runtime', header: 'Takvim', width: '140px', cell: this.runtimeCell() },
    {
      key: 'questionCount',
      header: 'Soru',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '80px',
      hideBelow: 'tablet',
      value: (row) => row.questions.length,
    },
    {
      key: 'totalPoints',
      header: 'Puan',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '80px',
      hideBelow: 'tablet',
      value: (row) => row.totalPoints,
    },
    {
      key: 'durationMinutes',
      header: 'Süre',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '90px',
      hideBelow: 'laptop',
      value: (row) => `${row.durationMinutes} dk`,
    },
    {
      key: 'opensAt',
      header: 'Açılış',
      sortable: true,
      width: '130px',
      hideBelow: 'laptop',
      value: (row) => new Date(row.opensAt).toLocaleDateString('tr-TR'),
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
      options: this.courseOptionsState().map((option) => ({
        value: option.value,
        label: option.label,
      })),
    },
    {
      key: 'blueprintId',
      label: 'Blueprint',
      kind: 'single',
      options: this.blueprintListState().map((blueprint) => ({
        value: blueprint.id,
        label: blueprint.name,
      })),
    },
  ]);

  ngOnInit(): void {
    const courseId = this.courseId();
    if (courseId) this.facade.setFilter('courseId', courseId);
    else this.facade.load();

    this.loadReferences();
  }

  /* ── Satır işlemleri ─────────────────────────────────────────────────── */

  rowActions(exam: Exam): readonly DropdownItem[] {
    const items: DropdownItem[] = [
      { id: 'detail', label: 'Detayı aç', icon: 'external-link' },
      { id: 'preview', label: 'Önizle', icon: 'eye' },
    ];

    if (this.canWrite()) {
      items.push(
        {
          id: 'edit',
          label: 'Sihirbazda düzenle',
          icon: 'square-pen',
          disabled: exam.state === 'PUBLISHED' || exam.state === 'ARCHIVED',
        },
        { id: 'clone', label: 'Klonla (sorularıyla)', icon: 'copy' },
        { id: 'duplicate', label: 'Kopyala (yalnızca iskelet)', icon: 'file-text' },
      );

      if (this.canPublish()) {
        for (const action of availableActions(exam.state)) {
          items.push({ id: `state:${action.target}`, label: action.label, icon: action.icon });
        }
      }

      items.push({
        id: 'delete',
        label: 'Sil',
        icon: 'trash-2',
        tone: 'danger',
        separatorBefore: true,
        disabled: exam.state !== 'DRAFT',
      });
    }

    return items;
  }

  onRowAction(exam: Exam, item: DropdownItem): void {
    switch (item.id) {
      case 'detail':
        return this.openDetail(exam);
      case 'preview':
        return void this.router.navigate(['/exams', exam.id], { fragment: 'preview' });
      case 'edit':
        return this.openWizard(exam);
      case 'clone':
        return void this.facade.duplicate(exam, 'clone').subscribe({ error: () => undefined });
      case 'duplicate':
        return void this.facade.duplicate(exam, 'duplicate').subscribe({ error: () => undefined });
      case 'delete':
        return void this.confirmDelete(exam);
      default:
        if (item.id.startsWith('state:')) {
          void this.runTransition(exam, item.id.slice('state:'.length) as PublishState);
        }
    }
  }

  openDetail(exam: Exam): void {
    void this.router.navigate(['/exams', exam.id]);
  }

  openWizard(exam: Exam): void {
    void this.router.navigate(['/exams', exam.id, 'wizard']);
  }

  /**
   * Yeni sınav: önce boş bir taslak oluşturulur, sonra sihirbaz açılır.
   * Sihirbazın otomatik kaydı bir kayıt kimliği gerektirir.
   */
  async createExam(): Promise<void> {
    const courses = this.courseOptionsState();
    const courseId = this.currentCourseFilter() ?? courses[0]?.value;
    if (!courseId) return;

    this.creatingState.set(true);
    const opens = new Date();
    opens.setDate(opens.getDate() + 7);
    const closes = new Date(opens.getTime() + 4 * 60 * 60 * 1000);

    this.facade
      .create({
        title: `Yeni sınav ${new Date().toLocaleDateString('tr-TR')}`,
        description: '',
        instructions:
          'Sınav süresince sekme değiştirmeyiniz. Tüm soruları yanıtladıktan sonra "Gönder" butonuna basınız.',
        courseId,
        blueprintId: null,
        cohortIds: [],
        durationMinutes: 60,
        opensAt: opens.toISOString(),
        closesAt: closes.toISOString(),
        questions: [],
        rules: {
          shuffleQuestions: true,
          shuffleOptions: false,
          allowBackNavigation: true,
          showResultImmediately: false,
          passingScore: 50,
          maxAttempts: 1,
          autoSubmit: true,
        },
      })
      .subscribe({
        next: (exam) => {
          this.creatingState.set(false);
          this.openWizard(exam);
        },
        error: (_error: ApiError) => this.creatingState.set(false),
      });
  }

  currentCourseFilter(): string | null {
    const value = this.facade.query().filters['courseId'];
    return typeof value === 'string' ? value : null;
  }

  private async confirmDelete(exam: Exam): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'Sınavı sil',
      message: `"${exam.title}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (confirmed) this.facade.remove(exam).subscribe({ error: () => undefined });
  }

  private async runTransition(exam: Exam, state: PublishState): Promise<void> {
    const action = availableActions(exam.state).find((item) => item.target === state);
    if (!action) return;

    if (!action.requiresConfirmation) {
      this.facade.transition(exam, state).subscribe({ error: () => undefined });
      return;
    }

    const result = await this.dialogs.ask({
      title: action.label,
      message: `"${exam.title}" — ${action.description}`,
      confirmLabel: action.label,
      tone: action.tone === 'warning' ? 'warning' : 'primary',
      requireReason: true,
      reasonLabel: 'Gerekçe',
      reasonHint: 'Bu açıklama denetim kaydına yazılır. En az 10 karakter girin.',
    });

    if (result.confirmed) {
      this.facade.transition(exam, state, result.reason).subscribe({ error: () => undefined });
    }
  }

  private loadReferences(): void {
    forkJoin({
      courses: this.courses.list(createPageRequest({ size: 200 })),
      blueprints: this.blueprints.list(createPageRequest({ size: 200 })),
    }).subscribe({
      next: ({ courses, blueprints }) => {
        this.courseOptionsState.set(
          courses.items.map((course) => ({
            value: course.id,
            label: `${course.code} · ${course.name}`,
          })),
        );
        this.blueprintListState.set(blueprints.items);
      },
    });
  }
}
