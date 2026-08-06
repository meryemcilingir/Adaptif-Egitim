import { Routes } from '@angular/router';

import { anonymousGuard, authGuard } from './core/auth/guards/auth.guard';
import { permissionGuard } from './core/auth/guards/permission.guard';

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
    path: 'session/:token',
    canMatch: [authGuard],
    title: 'Sınav Oturumu · Adaptif Eğitim',
    loadComponent: () =>
      import('./features/adaptive-learning/pages/session/exam-session.page').then(
        (module) => module.ExamSessionPage,
      ),
  },
  {
    /*
     * Teslim makbuzu da kabuk dışındadır: öğrenci sınavdan yeni çıkmıştır ve
     * ekranın tek işi teslimin gerçekleştiğini göstermektir.
     */
    path: 'session/:token/submitted',
    canMatch: [authGuard],
    title: 'Sınav Teslim Edildi · Adaptif Eğitim',
    loadComponent: () =>
      import('./features/adaptive-learning/pages/session/exam-submitted.page').then(
        (module) => module.ExamSubmittedPage,
      ),
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
        path: '',
        loadChildren: () =>
          import('./features/administration/administration.routes').then(
            (module) => module.ADMINISTRATION_ROUTES,
          ),
      },

      /* Eski `/users` yolu, yönetim modülündeki gerçek ekrana yönlendirilir. */
      { path: 'users', pathMatch: 'full', redirectTo: 'admin/users' },

      {
        /*
         * Geliştirici paneli veritabanını sıfırlayabildiği için `admin:manage`
         * ister. Menüde zaten yalnızca yöneticiye gösteriliyordu, ancak rota
         * korumasız olduğu için adres çubuğundan herkes erişebiliyordu.
         */
        path: 'dev-tools',
        title: 'Geliştirici Paneli · Adaptif Eğitim',
        canMatch: [permissionGuard('admin:manage')],
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
