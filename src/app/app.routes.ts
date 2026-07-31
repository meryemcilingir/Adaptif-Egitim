import { Routes } from '@angular/router';

import { anonymousGuard, authGuard } from './core/auth/guards/auth.guard';

/**
 * Uygulama rota ağacı.
 *
 * · Kimlik doğrulaması gereken her şey `ShellComponent` altındadır.
 * · Sınav oturumu bilinçli olarak shell DIŞINDADIR — tam ekran odak modu kullanır
 *   (ARCHITECTURE.md §7).
 * · Tüm feature'lar lazy yüklenir.
 */
export const routes: Routes = [
  {
    path: 'auth/login',
    canMatch: [anonymousGuard],
    title: 'Giriş · Adaptif Eğitim',
    loadComponent: () =>
      import('./features/auth/pages/login/login.page').then((module) => module.LoginPage),
  },

  {
    // Süreli sınav ekranı: sidebar/header yok, dikkat dağıtan öğe yok.
    path: 'exam-session/:token',
    canMatch: [authGuard],
    title: 'Sınav Oturumu · Adaptif Eğitim',
    loadComponent: () =>
      import('./features/system/pages/module-placeholder/module-placeholder.page').then(
        (module) => module.ModulePlaceholderPage,
      ),
    data: {
      title: 'Sınav oturumu',
      summary: 'Süreli oturum, autosave ve bağlantı kaybı yönetimi.',
      phase: 5,
      scope: [
        'Sunucu zamanlı sayaç (BR-07)',
        'Autosave + çakışma (BR-09)',
        'Offline kuyruk (BR-10)',
        'Tek aktif oturum (BR-06)',
      ],
    },
  },

  {
    path: '',
    canMatch: [authGuard],
    loadComponent: () =>
      import('./layout/shell/shell.component').then((module) => module.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'learning/dashboard' },

      {
        path: '',
        loadChildren: () =>
          import('./features/adaptive-learning/adaptive-learning.routes').then(
            (module) => module.ADAPTIVE_LEARNING_ROUTES,
          ),
      },

      {
        path: 'users',
        title: 'Kullanıcılar · Adaptif Eğitim',
        loadComponent: () =>
          import('./features/system/pages/module-placeholder/module-placeholder.page').then(
            (module) => module.ModulePlaceholderPage,
          ),
        data: {
          title: 'Kullanıcı yönetimi',
          summary: 'Rol, izin ve hesap durumu yönetimi.',
          phase: 10,
          scope: ['Kullanıcı listesi', 'Rol atama', 'Hesap durumu', 'Denetim izi'],
        },
      },

      {
        path: 'dev-tools',
        title: 'Geliştirici Paneli · Adaptif Eğitim',
        loadComponent: () =>
          import('./features/system/pages/dev-tools/dev-tools.page').then(
            (module) => module.DevToolsPage,
          ),
      },

      {
        path: '403',
        title: 'Yetkisiz Erişim · Adaptif Eğitim',
        loadComponent: () =>
          import('./features/system/pages/forbidden/forbidden.page').then(
            (module) => module.ForbiddenPage,
          ),
      },

      {
        path: '**',
        title: 'Sayfa Bulunamadı · Adaptif Eğitim',
        loadComponent: () =>
          import('./features/system/pages/not-found/not-found.page').then(
            (module) => module.NotFoundPage,
          ),
      },
    ],
  },

  { path: '**', redirectTo: 'auth/login' },
];
