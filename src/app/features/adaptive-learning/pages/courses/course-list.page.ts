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
import { SelectOption } from '../../../../shared/components/app-select/app-select.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../../shared/components/app-table/column-def';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { PUBLISH_STATES, PUBLISH_STATE_LABELS, PublishState } from '../../models/common.model';
import {
  COURSE_CATEGORIES,
  COURSE_CATEGORY_LABELS,
  COURSE_LEVELS,
  COURSE_LEVEL_LABELS,
  Course,
  CourseCreateRequest,
} from '../../models/course.model';
import { availableActions } from '../../domain/publish-workflow';
import { CourseFacade } from '../../data-access/course.facade';
import { ProgramRepository, ReferenceRepository } from '../../data-access/catalog.repository';
import { CourseFormComponent } from './course-form.component';

/**
 * Ders listesi — arama, çoklu filtre (durum, program, kategori, seviye, eğitmen),
 * kolon sıralaması ve sayfalama.
 */
@Component({
  selector: 'app-course-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDropdownComponent,
    AppFilterBarComponent,
    AppStatusBadgeComponent,
    AppTableComponent,
    CourseFormComponent,
  ],
  templateUrl: './course-list.page.html',
  styleUrl: './course-list.page.scss',
})
export class CourseListPage implements OnInit {
  protected readonly facade = inject(CourseFacade);
  private readonly programs = inject(ProgramRepository);
  private readonly reference = inject(ReferenceRepository);
  private readonly dialogs = inject(DialogService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  private readonly nameCell = viewChild.required<TemplateRef<{ $implicit: Course }>>('nameCell');
  private readonly stateCell = viewChild.required<TemplateRef<{ $implicit: Course }>>('stateCell');
  private readonly metaCell = viewChild.required<TemplateRef<{ $implicit: Course }>>('metaCell');
  private readonly actionsCell =
    viewChild.required<TemplateRef<{ $implicit: Course }>>('actionsCell');

  private readonly programOptionsState = signal<readonly SelectOption[]>([]);
  private readonly termOptionsState = signal<readonly SelectOption[]>([]);
  private readonly instructorOptionsState = signal<readonly SelectOption[]>([]);
  private readonly formOpenState = signal(false);
  private readonly editingState = signal<Course | null>(null);

  readonly programOptions = this.programOptionsState.asReadonly();
  readonly termOptions = this.termOptionsState.asReadonly();
  readonly instructorOptions = this.instructorOptionsState.asReadonly();
  readonly isFormOpen = this.formOpenState.asReadonly();
  readonly editing = this.editingState.asReadonly();

  readonly canWrite = computed(() => this.permissions.can('course:write'));
  readonly canPublish = computed(() => this.permissions.can('course:publish'));
  readonly canCreate = computed(() => this.canWrite() && this.programOptionsState().length > 0);

  readonly columns = computed<readonly ColumnDef<Course>[]>(() => [
    { key: 'code', header: 'Kod', sortable: true, width: '110px', value: (row) => row.code },
    { key: 'name', header: 'Ders', sortable: true, cell: this.nameCell() },
    {
      key: 'instructorName',
      header: 'Eğitmen',
      sortable: true,
      hideBelow: 'laptop',
      value: (row) => row.instructorName,
    },
    { key: 'category', header: 'Kategori / Seviye', width: '190px', cell: this.metaCell() },
    {
      key: 'estimatedDurationHours',
      header: 'Süre',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '90px',
      hideBelow: 'tablet',
      value: (row) => `${row.estimatedDurationHours} sa`,
    },
    {
      key: 'outcomeCount',
      header: 'Kazanım',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '100px',
      hideBelow: 'tablet',
      value: (row) => row.outcomeCount,
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
      key: 'programId',
      label: 'Program',
      kind: 'single',
      options: this.programOptionsState().map((option) => ({
        value: option.value,
        label: option.label,
      })),
    },
    {
      key: 'category',
      label: 'Kategori',
      kind: 'multi',
      options: COURSE_CATEGORIES.map((value) => ({
        value,
        label: COURSE_CATEGORY_LABELS[value],
      })),
    },
    {
      key: 'level',
      label: 'Seviye',
      kind: 'multi',
      options: COURSE_LEVELS.map((value) => ({ value, label: COURSE_LEVEL_LABELS[value] })),
    },
    {
      key: 'instructorId',
      label: 'Eğitmen',
      kind: 'single',
      options: this.instructorOptionsState().map((option) => ({
        value: option.value,
        label: option.label,
      })),
    },
  ]);

  ngOnInit(): void {
    this.facade.load();

    forkJoin({
      programs: this.programs.list(createPageRequest({ size: 100 })),
      terms: this.reference.terms(),
      instructors: this.reference.staff('INSTRUCTOR'),
    }).subscribe({
      next: ({ programs, terms, instructors }) => {
        this.programOptionsState.set(
          programs.items.map((program) => ({
            value: program.id,
            label: `${program.code} · ${program.name}`,
          })),
        );
        this.termOptionsState.set(terms.map((term) => ({ value: term.id, label: term.name })));
        this.instructorOptionsState.set(
          instructors.map((user) => ({ value: user.id, label: user.fullName })),
        );
      },
    });
  }

  /*
   * Şablon hücreleri (`ng-template let-course`) tipsizdir; etiket çözümü bu
   * yardımcılar üzerinden yapılır ki `strictTemplates` altında güvenli kalsın.
   */
  categoryLabel(value: string): string {
    return COURSE_CATEGORY_LABELS[value as keyof typeof COURSE_CATEGORY_LABELS] ?? value;
  }

  levelLabel(value: string): string {
    return COURSE_LEVEL_LABELS[value as keyof typeof COURSE_LEVEL_LABELS] ?? value;
  }

  toneFor(state: string) {
    return statusPresentation(state);
  }

  rowActions(course: Course): readonly DropdownItem[] {
    const items: DropdownItem[] = [{ id: 'detail', label: 'Detayı aç', icon: 'external-link' }];

    if (this.canWrite()) {
      items.push({
        id: 'edit',
        label: 'Düzenle',
        icon: 'pencil-line',
        disabled: course.state === 'PUBLISHED' || course.state === 'ARCHIVED',
      });
    }

    if (this.canPublish()) {
      for (const action of availableActions(course.state)) {
        items.push({ id: `state:${action.target}`, label: action.label, icon: action.icon });
      }
    }

    if (this.canWrite()) {
      items.push({
        id: 'delete',
        label: 'Sil',
        icon: 'x',
        tone: 'danger',
        separatorBefore: true,
        disabled: course.state !== 'DRAFT',
      });
    }

    return items;
  }

  onRowAction(course: Course, item: DropdownItem): void {
    if (item.id === 'detail') return this.openDetail(course);
    if (item.id === 'edit') return this.openForm(course);
    if (item.id === 'delete') return void this.confirmDelete(course);
    if (item.id.startsWith('state:')) {
      void this.runTransition(course, item.id.slice('state:'.length) as PublishState);
    }
  }

  openDetail(course: Course): void {
    void this.router.navigate(['/courses', course.id]);
  }

  openForm(course: Course | null): void {
    this.editingState.set(course);
    this.formOpenState.set(true);
  }

  closeForm(): void {
    this.formOpenState.set(false);
    this.editingState.set(null);
  }

  onSave(payload: CourseCreateRequest, form: CourseFormComponent): void {
    const editing = this.editingState();
    const request = editing ? this.facade.update(editing, payload) : this.facade.create(payload);

    request.subscribe({
      next: () => {
        this.closeForm();
        this.facade.load();
      },
      error: (error: ApiError) => form.applyServerErrors(error),
    });
  }

  private async confirmDelete(course: Course): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'Dersi sil',
      message: `"${course.name}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (confirmed) this.facade.remove(course).subscribe({ error: () => undefined });
  }

  private async runTransition(course: Course, state: PublishState): Promise<void> {
    const action = availableActions(course.state).find((item) => item.target === state);
    if (!action) return;

    if (!action.requiresConfirmation) {
      this.facade.transition(course, state).subscribe({ error: () => undefined });
      return;
    }

    const result = await this.dialogs.ask({
      title: action.label,
      message: `"${course.name}" — ${action.description}`,
      confirmLabel: action.label,
      tone: action.tone === 'warning' ? 'warning' : 'primary',
      requireReason: true,
      reasonLabel: 'Gerekçe',
      reasonHint: 'Bu açıklama denetim kaydına yazılır. En az 10 karakter girin.',
    });

    if (result.confirmed) {
      this.facade.transition(course, state, result.reason).subscribe({ error: () => undefined });
    }
  }
}
