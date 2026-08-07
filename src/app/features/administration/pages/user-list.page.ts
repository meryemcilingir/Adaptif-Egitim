import { ChangeDetectionStrategy, Component, OnInit, computed, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TemplateRef } from '@angular/core';

import { ApiError } from '../../../core/api/api-error';
import { FilterValue } from '../../../core/api/page-request';
import { ROLES, ROLE_LABELS, Role } from '../../../core/auth/permission.model';
import { DialogService } from '../../../shared/components/app-dialog/dialog.service';
import { AppButtonComponent } from '../../../shared/components/app-button/app-button.component';
import {
  AppDropdownComponent,
  DropdownItem,
} from '../../../shared/components/app-dropdown/app-dropdown.component';
import { AppFilterBarComponent } from '../../../shared/components/app-filter-bar/app-filter-bar.component';
import { FilterDefinition } from '../../../shared/components/app-filter-bar/filter-definition';
import {
  ExportMenuComponent,
  ExportTable,
} from '../../../shared/components/app-export-menu/app-export-menu.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../shared/components/app-table/column-def';
import {
  USER_STATES,
  USER_STATE_LABELS,
  User,
  UserState,
} from '../../adaptive-learning/models/user.model';
import { AdminFacade } from '../data-access/admin.facade';
import { LifecycleAction, UserAdminFacade } from '../data-access/user-admin.facade';

/** Durum → rozet tonu. Tek yerde tanımlanır, üç ekran aynı renkleri kullanır. */
const STATE_TONES: Readonly<Record<UserState, 'success' | 'warning' | 'danger' | 'neutral'>> = {
  ACTIVE: 'success',
  INVITED: 'neutral',
  SUSPENDED: 'warning',
  ARCHIVED: 'danger',
};

/**
 * Kullanıcı yönetimi listesi (Sprint 9 §2).
 *
 * Sayfalama, arama, çoklu filtre ve sıralama ortak `AppTable` altyapısından
 * gelir (§16); bu ekran yalnızca kolonları ve satır işlemlerini tanımlar.
 *
 * Yıkıcı işlemler (askıya alma, arşivleme) onay diyaloğu ister; geri
 * alınabilir olanlar (etkinleştirme, kilit açma) istemez — her tıklamada onay
 * sormak, onayı anlamsız bir refleks hâline getirir.
 */
@Component({
  selector: 'app-user-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDropdownComponent,
    AppFilterBarComponent,
    AppStatusBadgeComponent,
    AppTableComponent,
    ExportMenuComponent,
  ],
  templateUrl: './user-list.page.html',
  styleUrl: './user-list.page.scss',
})
export class UserListPage implements OnInit {
  protected readonly facade = inject(UserAdminFacade);
  private readonly admin = inject(AdminFacade);
  private readonly dialog = inject(DialogService);
  private readonly router = inject(Router);

  private readonly identityCell = viewChild.required<TemplateRef<{ $implicit: User }>>('identityCell');
  private readonly rolesCell = viewChild.required<TemplateRef<{ $implicit: User }>>('rolesCell');
  private readonly stateCell = viewChild.required<TemplateRef<{ $implicit: User }>>('stateCell');
  private readonly actionsCell = viewChild.required<TemplateRef<{ $implicit: User }>>('actionsCell');

  readonly items = this.facade.items;
  readonly total = this.facade.total;
  readonly status = this.facade.status;
  readonly error = this.facade.error;
  readonly query = this.facade.query;
  readonly isFiltered = this.facade.isFiltered;

  readonly columns = computed<readonly ColumnDef<User>[]>(() => [
    { key: 'fullName', header: 'Kullanıcı', sortable: true, cell: this.identityCell() },
    {
      key: 'department',
      header: 'Birim',
      sortable: true,
      width: '180px',
      hideBelow: 'laptop',
      value: (row) => row.department || '—',
    },
    { key: 'roles', header: 'Roller', width: '210px', cell: this.rolesCell() },
    {
      key: 'lastLoginAt',
      header: 'Son giriş',
      sortable: true,
      width: '140px',
      hideBelow: 'tablet',
      value: (row) => formatDate(row.lastLoginAt),
    },
    {
      key: 'createdAt',
      header: 'Oluşturma',
      sortable: true,
      width: '130px',
      hideBelow: 'laptop',
      value: (row) => formatDate(row.createdAt),
    },
    { key: 'state', header: 'Durum', width: '120px', cell: this.stateCell() },
    { key: 'actions', header: '', width: '52px', align: 'end', cell: this.actionsCell() },
  ]);

  /** Filtre seçenekleri sabit listelerden gelir; ekran kendi listesini uydurmaz. */
  readonly filters: readonly FilterDefinition[] = [
    {
      key: 'role',
      label: 'Rol',
      kind: 'multi',
      options: ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
    },
    {
      key: 'state',
      label: 'Durum',
      kind: 'multi',
      options: USER_STATES.map((state) => ({ value: state, label: USER_STATE_LABELS[state] })),
    },
  ];

  readonly canManage = computed(() => this.admin.can('admin:manage'));

  readonly exportTable = computed<ExportTable | null>(() => {
    const rows = this.items();
    if (rows.length === 0) return null;

    return {
      fileName: 'kullanicilar',
      columns: [
        'Ad soyad',
        'E-posta',
        'Kullanıcı adı',
        'Birim',
        'Ünvan',
        'Roller',
        'Durum',
        'Son giriş',
        'Oluşturma',
      ],
      rows: rows.map((user) => [
        user.fullName,
        user.email,
        user.username,
        user.department,
        user.title,
        user.roles.map((role) => ROLE_LABELS[role]).join(' | '),
        USER_STATE_LABELS[user.state],
        formatDate(user.lastLoginAt),
        formatDate(user.createdAt),
      ]),
    };
  });

  ngOnInit(): void {
    this.facade.load();
  }

  toneOf(state: string): 'success' | 'warning' | 'danger' | 'neutral' {
    return STATE_TONES[state as UserState] ?? 'neutral';
  }

  /** Satır menüsü duruma göre değişir: askıdaki bir hesaba "askıya al" gösterilmez. */
  actionsFor(user: User): readonly DropdownItem[] {
    const items: DropdownItem[] = [
      { id: 'view', label: 'Detayı aç', icon: 'eye' },
      { id: 'edit', label: 'Düzenle', icon: 'pencil-line' },
    ];

    if (!this.canManage()) return [items[0]!];

    if (user.state === 'ACTIVE' || user.state === 'INVITED') {
      items.push({ id: 'disable', label: 'Askıya al', icon: 'lock', separatorBefore: true });
    } else if (user.state === 'SUSPENDED') {
      items.push({ id: 'enable', label: 'Etkinleştir', icon: 'lock-open', separatorBefore: true });
    }

    if (user.state === 'ARCHIVED') {
      items.push({ id: 'restore', label: 'Arşivden çıkar', icon: 'rotate-ccw' });
    } else {
      items.push({ id: 'archive', label: 'Arşivle', icon: 'archive', tone: 'danger' });
    }

    items.push({ id: 'delete', label: 'Sil', icon: 'trash-2', tone: 'danger' });

    return items;
  }

  async onAction(item: DropdownItem, user: User): Promise<void> {
    if (item.id === 'view') {
      void this.router.navigate(['/admin/users', user.id]);
      return;
    }

    if (item.id === 'edit') {
      void this.router.navigate(['/admin/users', user.id, 'edit']);
      return;
    }

    if (item.id === 'delete') {
      const confirmed = await this.dialog.confirm({
        title: 'Kullanıcı kalıcı olarak silinsin mi?',
        message: `“${user.fullName}” kalıcı olarak silinecek. Bu işlem GERİ ALINAMAZ — kayıt geri getirilemez. Geri alınabilir bir devre dışı bırakma istiyorsanız bunun yerine "Arşivle"yi kullanın.`,
        confirmLabel: 'Kalıcı olarak sil',
        tone: 'danger',
      });

      if (!confirmed) return;

      this.facade.delete(user.id).subscribe({ error: () => undefined });
      return;
    }

    const action = item.id as LifecycleAction;

    /*
     * Onay YALNIZCA geri alınması zor işlemlerde istenir.
     *
     * Her işlemde sormak, kullanıcıyı diyaloğu okumadan onaylamaya alıştırır ve
     * asıl tehlikeli işlemde de aynı refleksle geçmesine yol açar.
     */
    if (action === 'disable' || action === 'archive') {
      const confirmed = await this.dialog.confirm({
        title: action === 'archive' ? 'Kullanıcı arşivlensin mi?' : 'Hesap askıya alınsın mı?',
        message:
          action === 'archive'
            ? `“${user.fullName}” arşivlenecek ve giriş yapamayacak. Kayıtları korunur, arşivden çıkarılabilir.`
            : `“${user.fullName}” geçici olarak giriş yapamayacak.`,
        confirmLabel: action === 'archive' ? 'Arşivle' : 'Askıya al',
        tone: action === 'archive' ? 'danger' : 'warning',
      });

      if (!confirmed) return;
    }

    this.facade.lifecycle(user.id, action);
  }

  openRow(user: User): void {
    void this.router.navigate(['/admin/users', user.id]);
  }

  create(): void {
    void this.router.navigate(['/admin/users/new']);
  }

  onSearch(term: string): void {
    this.facade.search(term);
  }

  onFilter(key: string, value: FilterValue): void {
    this.facade.setFilter(key, value);
  }

  onClearFilters(): void {
    this.facade.clearFilters();
  }

  onSort(field: string): void {
    this.facade.sort(field);
  }

  onPage(page: number): void {
    this.facade.goToPage(page);
  }

  onSize(size: number): void {
    this.facade.setPageSize(size);
  }

  retry(): void {
    this.facade.load();
  }

  /** Şablonlar tipsiz satır alır; etiket çevirileri burada yapılır. */
  roleNames(roles: readonly string[]): string[] {
    return roles.map((role) => ROLE_LABELS[role as Role] ?? role);
  }

  stateLabel(state: string): string {
    return USER_STATE_LABELS[state as UserState] ?? state;
  }

  errorOf(): ApiError | null {
    return this.error();
  }
}

/** Tarih yoksa "—"; "hiç giriş yapmadı" ile "bugün girdi" karıştırılmamalı. */
function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
