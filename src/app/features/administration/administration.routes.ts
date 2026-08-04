import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/permission.guard';

/**
 * Yönetim modülü rotaları (Sprint 9 §15).
 *
 * Tüm alt rotalar `admin:manage` iznine bağlıdır ve kapı `canMatch` ile
 * kurulur: yetkisiz kullanıcı için rota EŞLEŞMEZ, bileşen hiç yüklenmez.
 * `canActivate` kullanılsaydı bileşen yüklenir, sonra engellenirdi — kod yine
 * de indirilmiş olurdu.
 *
 * Denetim kaydı ayrı bir izinle (`audit:read`) korunur; denetimi okuyabilen
 * herkesin kullanıcı yönetebilmesi gerekmez.
 */
export const ADMINISTRATION_ROUTES: Routes = [
  {
    path: 'admin',
    title: 'Yönetim Panosu · Adaptif Eğitim',
    canMatch: [permissionGuard('admin:manage')],
    loadComponent: () =>
      import('./pages/admin-dashboard.page').then((module) => module.AdminDashboardPage),
  },

  {
    path: 'admin/users',
    title: 'Kullanıcılar · Adaptif Eğitim',
    canMatch: [permissionGuard('admin:manage')],
    loadComponent: () => import('./pages/user-list.page').then((module) => module.UserListPage),
  },

  {
    /* `new`, `:id`den ÖNCE gelmeli; aksi hâlde kimlik olarak yorumlanır. */
    path: 'admin/users/new',
    title: 'Yeni Kullanıcı · Adaptif Eğitim',
    canMatch: [permissionGuard('admin:manage')],
    loadComponent: () => import('./pages/user-editor.page').then((module) => module.UserEditorPage),
  },

  {
    path: 'admin/users/:id/edit',
    title: 'Kullanıcıyı Düzenle · Adaptif Eğitim',
    canMatch: [permissionGuard('admin:manage')],
    loadComponent: () => import('./pages/user-editor.page').then((module) => module.UserEditorPage),
  },

  {
    path: 'admin/users/:id',
    title: 'Kullanıcı Detayı · Adaptif Eğitim',
    canMatch: [permissionGuard('admin:manage')],
    loadComponent: () => import('./pages/user-detail.page').then((module) => module.UserDetailPage),
  },

  {
    path: 'admin/roles',
    title: 'Roller ve İzinler · Adaptif Eğitim',
    canMatch: [permissionGuard('admin:manage')],
    loadComponent: () => import('./pages/role-list.page').then((module) => module.RoleListPage),
  },

  {
    path: 'admin/terms',
    title: 'Akademik Dönemler · Adaptif Eğitim',
    canMatch: [permissionGuard('admin:manage')],
    loadComponent: () => import('./pages/term-list.page').then((module) => module.TermListPage),
  },

  {
    path: 'admin/settings',
    title: 'Sistem Ayarları · Adaptif Eğitim',
    canMatch: [permissionGuard('admin:manage')],
    loadComponent: () =>
      import('./pages/system-settings.page').then((module) => module.SystemSettingsPage),
  },

  {
    path: 'admin/notifications',
    title: 'Bildirim Merkezi · Adaptif Eğitim',
    canMatch: [permissionGuard('admin:manage')],
    loadComponent: () =>
      import('./pages/notification-center.page').then((module) => module.NotificationCenterPage),
  },

  {
    path: 'audit-log',
    title: 'Denetim Kaydı · Adaptif Eğitim',
    canMatch: [permissionGuard('audit:read')],
    loadComponent: () => import('./pages/audit-log.page').then((module) => module.AuditLogPage),
  },
];
