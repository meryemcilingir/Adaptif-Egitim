import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TemplateRef } from '@angular/core';

import { ApiError } from '../../../../core/api/api-error';
import { PublishState } from '../../models/common.model';
import { PermissionService } from '../../../../core/auth/permission.service';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppFilterBarComponent } from '../../../../shared/components/app-filter-bar/app-filter-bar.component';
import { FilterDefinition } from '../../../../shared/components/app-filter-bar/filter-definition';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../../shared/components/app-table/column-def';
import {
  AppDropdownComponent,
  DropdownItem,
} from '../../../../shared/components/app-dropdown/app-dropdown.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import { SelectOption } from '../../../../shared/components/app-select/app-select.component';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { PUBLISH_STATE_LABELS, PUBLISH_STATES } from '../../models/common.model';
import { Program, ProgramCreateRequest } from '../../models/program.model';
import { availableActions } from '../../domain/publish-workflow';
import { ProgramFacade } from '../../data-access/program.facade';
import { ReferenceRepository } from '../../data-access/catalog.repository';
import { ProgramFormComponent } from './program-form.component';

/**
 * Program listesi.
 *
 * Arama, çoklu filtre, kolon sıralaması ve sayfalama `AppTable` + `AppFilterBar`
 * bileşenlerinden gelir; sayfa yalnızca kolon/filtre tanımını ve kullanıcı
 * eylemlerini facade komutlarına çevirir (SRP).
 */
@Component({
  selector: 'app-program-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDropdownComponent,
    AppFilterBarComponent,
    AppStatusBadgeComponent,
    AppTableComponent,
    ProgramFormComponent,
  ],
  templateUrl: './program-list.page.html',
  styleUrl: './program-list.page.scss',
})
export class ProgramListPage implements OnInit {
  protected readonly facade = inject(ProgramFacade);
  private readonly reference = inject(ReferenceRepository);
  private readonly dialogs = inject(DialogService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  private readonly stateCell = viewChild.required<TemplateRef<{ $implicit: Program }>>('stateCell');
  private readonly nameCell = viewChild.required<TemplateRef<{ $implicit: Program }>>('nameCell');
  private readonly actionsCell =
    viewChild.required<TemplateRef<{ $implicit: Program }>>('actionsCell');

  private readonly coordinatorState = signal<readonly SelectOption[]>([]);
  private readonly formOpenState = signal(false);
  private readonly editingState = signal<Program | null>(null);

  readonly coordinators = this.coordinatorState.asReadonly();
  readonly isFormOpen = this.formOpenState.asReadonly();
  readonly editing = this.editingState.asReadonly();

  readonly canWrite = computed(() => this.permissions.can('course:write'));
  readonly canPublish = computed(() => this.permissions.can('course:publish'));

  readonly columns = computed<readonly ColumnDef<Program>[]>(() => [
    { key: 'code', header: 'Kod', sortable: true, width: '110px', value: (row) => row.code },
    { key: 'name', header: 'Program', sortable: true, cell: this.nameCell() },
    {
      key: 'coordinatorName',
      header: 'Koordinatör',
      sortable: true,
      hideBelow: 'laptop',
      value: (row) => row.coordinatorName,
    },
    {
      key: 'courseCount',
      header: 'Ders',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '90px',
      value: (row) => row.courseCount,
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
    {
      key: 'studentCount',
      header: 'Öğrenci',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '100px',
      hideBelow: 'laptop',
      value: (row) => row.studentCount,
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
      key: 'coordinatorId',
      label: 'Koordinatör',
      kind: 'single',
      options: this.coordinatorState().map((option) => ({
        value: option.value,
        label: option.label,
      })),
    },
  ]);

  ngOnInit(): void {
    this.facade.load();
    this.reference.staff('PROGRAM_MANAGER').subscribe({
      next: (staff) =>
        this.coordinatorState.set(staff.map((user) => ({ value: user.id, label: user.fullName }))),
    });
  }

  toneFor(state: string) {
    return statusPresentation(state);
  }

  rowActions(program: Program): readonly DropdownItem[] {
    const items: DropdownItem[] = [{ id: 'detail', label: 'Detayı aç', icon: 'external-link' }];

    if (this.canWrite()) {
      items.push({
        id: 'edit',
        label: 'Düzenle',
        icon: 'pencil-line',
        disabled: program.state === 'PUBLISHED' || program.state === 'ARCHIVED',
      });
    }

    if (this.canPublish()) {
      for (const action of availableActions(program.state)) {
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
        disabled: program.state !== 'DRAFT',
      });
    }

    return items;
  }

  onRowAction(program: Program, item: DropdownItem): void {
    if (item.id === 'detail') {
      this.openDetail(program);
      return;
    }
    if (item.id === 'edit') {
      this.openForm(program);
      return;
    }
    if (item.id === 'delete') {
      void this.confirmDelete(program);
      return;
    }
    if (item.id.startsWith('state:')) {
      void this.runTransition(program, item.id.slice('state:'.length) as PublishState);
    }
  }

  openDetail(program: Program): void {
    void this.router.navigate(['/programs', program.id]);
  }

  openForm(program: Program | null): void {
    this.editingState.set(program);
    this.formOpenState.set(true);
  }

  closeForm(): void {
    this.formOpenState.set(false);
    this.editingState.set(null);
  }

  onSave(payload: ProgramCreateRequest, form: ProgramFormComponent): void {
    const editing = this.editingState();
    const request = editing ? this.facade.update(editing, payload) : this.facade.create(payload);

    request.subscribe({
      next: () => {
        this.closeForm();
        this.facade.load();
      },
      // Alan hataları forma yazılır; genel mesajı facade toast ile gösterir.
      error: (error: ApiError) => form.applyServerErrors(error),
    });
  }

  private async confirmDelete(program: Program): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'Programı sil',
      message: `"${program.name}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (confirmed) this.facade.remove(program).subscribe({ error: () => undefined });
  }

  private async runTransition(program: Program, state: PublishState): Promise<void> {
    const action = availableActions(program.state).find((item) => item.target === state);
    if (!action) return;

    if (action.requiresConfirmation) {
      const result = await this.dialogs.ask({
        title: action.label,
        message: `"${program.name}" — ${action.description}`,
        confirmLabel: action.label,
        tone: action.tone === 'warning' ? 'warning' : 'primary',
        requireReason: true,
        reasonLabel: 'Gerekçe',
        reasonHint: 'Bu açıklama denetim kaydına yazılır. En az 10 karakter girin.',
      });

      if (!result.confirmed) return;
      this.facade.transition(program, state, result.reason).subscribe({ error: () => undefined });
      return;
    }

    this.facade.transition(program, state).subscribe({ error: () => undefined });
  }
}
