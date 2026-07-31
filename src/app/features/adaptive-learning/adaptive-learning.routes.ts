import { Routes } from '@angular/router';

import { permissionGuard } from '../../core/auth/guards/permission.guard';

/**
 * Adaptif öğrenme modülünün rotaları.
 *
 * · Her rota lazy yüklenir.
 * · Yetki kontrolü `canMatch` ile yapılır → yetkisiz kullanıcı bundle'ı indirmez (ADR-007).
 * · Henüz geliştirilmemiş ekranlar `ModulePlaceholderPage` ile açıkça işaretlenir;
 *   böylece rota/menü/yetki akışı baştan doğru kurulur (ROADMAP.md Faz 2+).
 */
export const ADAPTIVE_LEARNING_ROUTES: Routes = [
  {
    path: 'learning/dashboard',
    title: 'Panel · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:student')],
    loadComponent: () =>
      import('./pages/learning-dashboard/learning-dashboard.page').then(
        (module) => module.LearningDashboardPage,
      ),
  },

  {
    path: 'programs',
    title: 'Programlar · Adaptif Eğitim',
    canMatch: [permissionGuard('course:read')],
    loadComponent: () =>
      import('./pages/programs/program-list.page').then((module) => module.ProgramListPage),
  },
  {
    path: 'programs/:id',
    title: 'Program Detayı · Adaptif Eğitim',
    canMatch: [permissionGuard('course:read')],
    loadComponent: () =>
      import('./pages/programs/program-detail.page').then((module) => module.ProgramDetailPage),
  },

  {
    path: 'courses',
    title: 'Dersler · Adaptif Eğitim',
    canMatch: [permissionGuard('course:read')],
    loadComponent: () =>
      import('./pages/courses/course-list.page').then((module) => module.CourseListPage),
  },
  {
    path: 'courses/:id',
    title: 'Ders Detayı · Adaptif Eğitim',
    canMatch: [permissionGuard('course:read')],
    loadComponent: () =>
      import('./pages/courses/course-detail.page').then((module) => module.CourseDetailPage),
  },
  {
    // Ders detayından gelen kısayol; yol ekranı tüm dersleri sekme olarak gösterir.
    path: 'courses/:id/path',
    redirectTo: 'learning/path',
  },

  {
    path: 'learning/path',
    title: 'Öğrenme Yolu · Adaptif Eğitim',
    canMatch: [permissionGuard('content:read')],
    loadComponent: () =>
      import('./pages/learning-path/learning-path.page').then((module) => module.LearningPathPage),
  },

  {
    path: 'contents',
    title: 'İçerikler · Adaptif Eğitim',
    canMatch: [permissionGuard('content:read')],
    loadComponent: () =>
      import('./pages/contents/content-list.page').then((module) => module.ContentListPage),
  },
  {
    path: 'contents/:id',
    title: 'İçerik Detayı · Adaptif Eğitim',
    canMatch: [permissionGuard('content:read')],
    loadComponent: () =>
      import('./pages/contents/content-detail.page').then((module) => module.ContentDetailPage),
  },

  {
    // Özgül yol, `:id` kalıbından ÖNCE tanımlanmalıdır.
    path: 'outcomes/map',
    title: 'Kazanım Haritası · Adaptif Eğitim',
    canMatch: [permissionGuard('outcome:read')],
    loadComponent: () =>
      import('./pages/outcomes/outcome-map.page').then((module) => module.OutcomeMapPage),
  },
  {
    path: 'outcomes',
    title: 'Kazanımlar · Adaptif Eğitim',
    canMatch: [permissionGuard('outcome:read')],
    loadComponent: () =>
      import('./pages/outcomes/outcome-list.page').then((module) => module.OutcomeListPage),
  },
  {
    path: 'outcomes/:id',
    title: 'Kazanım Detayı · Adaptif Eğitim',
    canMatch: [permissionGuard('outcome:read')],
    loadComponent: () =>
      import('./pages/outcomes/outcome-detail.page').then((module) => module.OutcomeDetailPage),
  },

  {
    path: 'question-bank',
    title: 'Soru Bankası · Adaptif Eğitim',
    canMatch: [permissionGuard('question:read')],
    loadComponent: () =>
      import('./pages/questions/question-list.page').then((module) => module.QuestionListPage),
  },
  {
    // Özgül yollar `:id` kalıbından ÖNCE tanımlanmalıdır.
    path: 'questions/new',
    title: 'Yeni Soru · Adaptif Eğitim',
    canMatch: [permissionGuard('question:write')],
    loadComponent: () =>
      import('./pages/questions/question-editor.page').then((module) => module.QuestionEditorPage),
  },
  {
    path: 'questions/:id/edit',
    title: 'Soruyu Düzenle · Adaptif Eğitim',
    canMatch: [permissionGuard('question:write')],
    loadComponent: () =>
      import('./pages/questions/question-editor.page').then((module) => module.QuestionEditorPage),
  },
  {
    path: 'questions/:id',
    title: 'Soru Detayı · Adaptif Eğitim',
    canMatch: [permissionGuard('question:read')],
    loadComponent: () =>
      import('./pages/questions/question-detail.page').then((module) => module.QuestionDetailPage),
  },

  {
    path: 'blueprints',
    title: 'Ölçme Planları · Adaptif Eğitim',
    canMatch: [permissionGuard('blueprint:read')],
    loadComponent: () =>
      import('./pages/blueprints/blueprint-list.page').then((module) => module.BlueprintListPage),
  },
  {
    path: 'blueprints/:id',
    title: 'Ölçme Planı · Adaptif Eğitim',
    canMatch: [permissionGuard('blueprint:read')],
    loadComponent: () =>
      import('./pages/blueprints/blueprint-detail.page').then(
        (module) => module.BlueprintDetailPage,
      ),
  },

  {
    path: 'exams',
    title: 'Sınavlar · Adaptif Eğitim',
    canMatch: [permissionGuard('exam:read')],
    loadComponent: () =>
      import('./pages/exams/exam-list.page').then((module) => module.ExamListPage),
  },
  {
    // Sihirbaz `:id` kalıbından ÖNCE gelmelidir.
    path: 'exams/:id/wizard',
    title: 'Sınav Sihirbazı · Adaptif Eğitim',
    canMatch: [permissionGuard('exam:write')],
    loadComponent: () =>
      import('./pages/exams/exam-wizard.page').then((module) => module.ExamWizardPage),
  },
  {
    path: 'exams/:id',
    title: 'Sınav Detayı · Adaptif Eğitim',
    canMatch: [permissionGuard('exam:read')],
    loadComponent: () =>
      import('./pages/exams/exam-detail.page').then((module) => module.ExamDetailPage),
  },

  {
    path: 'grading',
    title: 'Değerlendirme · Adaptif Eğitim',
    canMatch: [permissionGuard('attempt:grade')],
    loadComponent: () =>
      import('../system/pages/module-placeholder/module-placeholder.page').then(
        (module) => module.ModulePlaceholderPage,
      ),
    data: {
      title: 'Değerlendirme kuyruğu',
      summary: 'Açık uçlu cevapların rubrikle puanlanması.',
      phase: 6,
      scope: [
        'Kuyruk + filtre',
        'RubricGrader',
        'Zorunlu gerekçe (BR-12)',
        'Optimistic + rollback',
      ],
    },
  },
  {
    path: 'grading/:attemptId',
    title: 'Puanlama · Adaptif Eğitim',
    canMatch: [permissionGuard('attempt:grade')],
    loadComponent: () =>
      import('../system/pages/module-placeholder/module-placeholder.page').then(
        (module) => module.ModulePlaceholderPage,
      ),
    data: {
      title: 'Deneme puanlama',
      summary: 'Kriter bazlı puanlama ve yeniden değerlendirme geçmişi.',
      phase: 6,
      scope: ['Rubrik puanlama', 'Puan geçmişi', 'Toplam hesabı (BR-13)'],
    },
  },

  {
    path: 'student/:id/analytics',
    title: 'Öğrenci Analitiği · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:student')],
    loadComponent: () =>
      import('../system/pages/module-placeholder/module-placeholder.page').then(
        (module) => module.ModulePlaceholderPage,
      ),
    data: {
      title: 'Öğrenci analitiği',
      summary: 'Kazanım kırılımı, ilerleme trendi ve deneme geçmişi.',
      phase: 8,
      scope: ['Ustalık kırılımı', 'Trend grafiği', 'Deneme geçmişi'],
    },
  },
  {
    path: 'cohort-analytics',
    title: 'Cohort Analitiği · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:cohort')],
    loadComponent: () =>
      import('../system/pages/module-placeholder/module-placeholder.page').then(
        (module) => module.ModulePlaceholderPage,
      ),
    data: {
      title: 'Cohort analitiği',
      summary: 'Gruplar arası karşılaştırma ve gizlilik eşiği.',
      phase: 8,
      scope: ['Cohort karşılaştırma', 'Minimum grup kuralı (BR-17)', 'Kazanım kırılımı'],
    },
  },
  {
    path: 'item-analysis',
    title: 'Madde Analizi · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:item')],
    loadComponent: () =>
      import('../system/pages/module-placeholder/module-placeholder.page').then(
        (module) => module.ModulePlaceholderPage,
      ),
    data: {
      title: 'Madde analizi',
      summary: 'Zorluk, ayırt edicilik ve çeldirici analizi.',
      phase: 8,
      scope: ['Zorluk / ayırt edicilik', 'Çeldirici dağılımı', 'Kalite bayrakları (BR-19)'],
    },
  },

  {
    path: 'audit-log',
    title: 'Denetim Kaydı · Adaptif Eğitim',
    canMatch: [permissionGuard('audit:read')],
    loadComponent: () =>
      import('../system/pages/module-placeholder/module-placeholder.page').then(
        (module) => module.ModulePlaceholderPage,
      ),
    data: {
      title: 'Denetim kaydı',
      summary: 'İşlem tipi, kullanıcı, zaman ve eski/yeni değer geçmişi.',
      phase: 9,
      scope: ['Çoklu filtre', 'Eski ↔ yeni değer diff', 'Gerçek zamanlı akış'],
    },
  },
];
