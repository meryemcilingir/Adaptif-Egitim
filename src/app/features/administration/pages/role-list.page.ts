import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { Permission } from '../../../core/auth/permission.model';
import { ROLE_DESCRIPTION_MAX, ROLE_NAME_LIMITS } from '../../../core/auth/role-definition';
import { AppButtonComponent } from '../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../shared/components/app-card/app-card.component';
import { AppDialogComponent } from '../../../shared/components/app-dialog/app-dialog.component';
import { DialogService } from '../../../shared/components/app-dialog/dialog.service';
import {
  AppDropdownComponent,
  DropdownItem,
} from '../../../shared/components/app-dropdown/app-dropdown.component';
import { AppEmptyStateComponent } from '../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../shared/components/app-error-state/app-error-state.component';
import {
  ExportMenuComponent,
  ExportTable,
} from '../../../shared/components/app-export-menu/app-export-menu.component';
import { AppFormFieldComponent } from '../../../shared/components/app-form-field/app-form-field.component';
import { AppIconComponent } from '../../../shared/components/app-icon/app-icon.component';
import { AppInputComponent } from '../../../shared/components/app-input/app-input.component';
import { AppLoadingStateComponent } from '../../../shared/components/app-loading-state/app-loading-state.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTextareaComponent } from '../../../shared/components/app-textarea/app-textarea.component';
import { PermissionMatrixComponent } from '../components/permission-matrix.component';
import { RoleRow } from '../models/admin.model';
import { AdminFacade } from '../data-access/admin.facade';

/**
 * Rol ve izin yönetimi (Sprint 9 §4).
 *
 * Roller solda listelenir, seçilen rolün izin matrisi sağda açılır. İki ayrı
 * ekran (liste + düzenleme) yerine tek ekran seçildi çünkü yönetici genellikle
 * rolleri KARŞILAŞTIRARAK düzenler: "eğitmende var mı?" diye bakıp geri dönmesi
 * gerekmez.
 *
 * Sistem rolleri silinemez ve adları değişmez; izinleri düzenlenebilir. Bu kural
 * ekranda gizlenmez, rozetle ve devre dışı alanlarla gösterilir.
 */
@Component({
  selector: 'app-role-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppDialogComponent,
    AppDropdownComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppFormFieldComponent,
    AppIconComponent,
    AppInputComponent,
    AppLoadingStateComponent,
    AppStatusBadgeComponent,
    AppTextareaComponent,
    ExportMenuComponent,
    PermissionMatrixComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './role-list.page.html',
  styleUrl: './role-list.page.scss',
})
export class RoleListPage implements OnInit {
  protected readonly facade = inject(AdminFacade);
  private readonly dialog = inject(DialogService);

  private readonly selectedIdState = signal<string | null>(null);
  private readonly permissionsState = signal<readonly Permission[]>([]);
  private readonly creatingState = signal(false);
  /** Forma en son hangi rolün yazıldığı — gereksiz tazelemeyi önler. */
  private readonly syncedIdState = signal<string | null>(null);

  readonly nameLimits = ROLE_NAME_LIMITS;
  readonly descriptionMax = ROLE_DESCRIPTION_MAX;

  readonly roles = this.facade.roles;
  readonly saving = this.facade.saving;
  readonly error = this.facade.rolesError;
  readonly isLoading = computed(
    () => this.facade.rolesStatus() === 'loading' && this.facade.roles().length === 0,
  );
  readonly hasError = computed(() => this.facade.rolesStatus() === 'error');
  readonly isCreating = this.creatingState.asReadonly();

  readonly selected = computed<RoleRow | null>(() => {
    const id = this.selectedIdState();
    return this.roles().find((role) => role.id === id) ?? this.roles()[0] ?? null;
  });

  /** Matriste gösterilen izinler — kaydedilmemiş taslak da dâhil. */
  readonly draftPermissions = this.permissionsState.asReadonly();

  readonly hasChanges = computed(() => {
    const role = this.selected();
    if (!role) return false;

    const current = [...this.permissionsState()].sort().join(',');
    return current !== [...role.permissions].sort().join(',');
  });

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(ROLE_NAME_LIMITS.min),
        Validators.maxLength(ROLE_NAME_LIMITS.max),
      ],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(ROLE_DESCRIPTION_MAX)],
    }),
  });

  readonly createForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(ROLE_NAME_LIMITS.min),
        Validators.maxLength(ROLE_NAME_LIMITS.max),
      ],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(ROLE_DESCRIPTION_MAX)],
    }),
  });

  readonly exportTable = computed<ExportTable | null>(() => {
    const rows = this.roles();
    if (rows.length === 0) return null;

    return {
      fileName: 'roller',
      columns: ['Rol', 'Anahtar', 'Tür', 'İzin sayısı', 'Kullanıcı', 'Durum', 'Açıklama'],
      rows: rows.map((role) => [
        role.name,
        role.key,
        role.system ? 'Sistem rolü' : 'Özel rol',
        role.permissions.length,
        role.userCount,
        role.archivedAt ? 'Arşiv' : 'Etkin',
        role.description,
      ]),
    };
  });

  ngOnInit(): void {
    this.facade.loadRoles();
  }

  constructor() {
    /*
     * Seçili rol değişince form ve matris tazelenir.
     *
     * Bunu yalnızca `select()` içinde yapmak yetmiyordu: liste ilk yüklendiğinde
     * sağ panel otomatik olarak ilk rolü gösteriyor ama hiçbir tıklama olmadığı
     * için form boş kalıyordu — 20 izinli bir rol "0 izin seçili" görünüyordu.
     */
    effect(() => {
      const role = this.selected();
      if (!role || role.id === this.syncedIdState()) return;

      untracked(() => this.syncForm(role));
    });
  }

  select(role: RoleRow): void {
    this.selectedIdState.set(role.id);
  }

  onTogglePermission(event: { permission: Permission; checked: boolean }): void {
    this.permissionsState.update((current) =>
      event.checked
        ? [...current, event.permission]
        : current.filter((permission) => permission !== event.permission),
    );
  }

  onToggleGroup(event: { permissions: readonly Permission[]; checked: boolean }): void {
    this.permissionsState.update((current) => {
      const set = new Set(current);

      for (const permission of event.permissions) {
        if (event.checked) set.add(permission);
        else set.delete(permission);
      }

      return [...set];
    });
  }

  save(): void {
    const role = this.selected();
    if (!role) return;

    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    this.facade
      .updateRole(
        role.id,
        {
          name: this.form.controls.name.value.trim(),
          description: this.form.controls.description.value.trim(),
          permissions: this.permissionsState(),
        },
        role.version,
      )
      .subscribe({
        next: (updated) => {
          this.syncedIdState.set(null);
          this.syncForm(updated);
        },
        error: () => undefined,
      });
  }

  reset(): void {
    const role = this.selected();
    if (role) this.syncForm(role);
  }

  /** Yeni rol oluşturulunca form yeniden doldurulmalı. */
  private resync(role: RoleRow): void {
    this.syncedIdState.set(null);
    this.syncForm(role);
  }

  actionsFor(role: RoleRow): readonly DropdownItem[] {
    const items: DropdownItem[] = [{ id: 'duplicate', label: 'Kopyala', icon: 'copy' }];

    if (!role.system) {
      items.push({
        id: 'archive',
        label: role.archivedAt ? 'Arşivden çıkar' : 'Arşivle',
        icon: role.archivedAt ? 'rotate-ccw' : 'archive',
        tone: role.archivedAt ? 'default' : 'danger',
      });
    }

    return items;
  }

  async onAction(item: DropdownItem, role: RoleRow): Promise<void> {
    if (item.id === 'duplicate') {
      this.facade.duplicateRole(role.id);
      return;
    }

    if (!role.archivedAt) {
      const confirmed = await this.dialog.confirm({
        title: 'Rol arşivlensin mi?',
        message: `“${role.name}” arşivlenecek. Bu role atanmış kullanıcı varsa işlem reddedilir.`,
        confirmLabel: 'Arşivle',
        tone: 'danger',
      });

      if (!confirmed) return;
    }

    this.facade.toggleRoleArchive(role.id);
  }

  openCreate(): void {
    this.createForm.reset({ name: '', description: '' });
    this.creatingState.set(true);
  }

  closeCreate(): void {
    this.creatingState.set(false);
  }

  submitCreate(): void {
    this.createForm.markAllAsTouched();
    if (this.createForm.invalid) return;

    this.facade
      .createRole({
        name: this.createForm.controls.name.value.trim(),
        description: this.createForm.controls.description.value.trim(),
        /*
         * Yeni rol EN AZ bir izinle başlar.
         *
         * Sunucu izinsiz rolü reddeder; kullanıcıyı formu doldurup hata almaya
         * göndermek yerine en zararsız izinle (ders görüntüleme) başlatılır ve
         * matristen genişletilir.
         */
        permissions: ['course:read'],
      })
      .subscribe({
        next: (role) => {
          this.creatingState.set(false);
          this.selectedIdState.set(role.id);
          this.resync(role);
        },
        error: () => undefined,
      });
  }

  private syncForm(role: RoleRow): void {
    this.syncedIdState.set(role.id);
    this.permissionsState.set(role.permissions);
    this.form.setValue({ name: role.name, description: role.description });

    // Sistem rolünün adı değişmez; alan kilitlenir ki kaydedince reddedilmesin.
    if (role.system) this.form.controls.name.disable();
    else this.form.controls.name.enable();
  }
}
