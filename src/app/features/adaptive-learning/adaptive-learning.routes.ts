import { Routes } from '@angular/router';

import { permissionGuard, roleGuard } from '../../core/auth/guards/permission.guard';
import { unsavedChangesGuard } from '../../core/auth/guards/unsaved-changes.guard';

/**
 * Adaptif öğrenme modülünün rotaları.
 *
 * · Her rota lazy yüklenir.
 * · Yetki kontrolü `canMatch` ile yapılır → yetkisiz kullanıcı bundle'ı indirmez (ADR-007).
 * · Sprint 9 itibarıyla yer tutucu ekran kalmadı; her rota gerçek bir bileşene
 *   bağlıdır. `ModulePlaceholderPage` bu nedenle kaldırıldı.
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
    /*
     * `course:read` iznini Ölçme Uzmanı da taşır (blueprint/soru ekranlarındaki
     * ders filtreleri için) — bu yüzden izin tek başına yetmez. RolesPermissions.md
     * "Courses" ekranını yalnızca Öğrenci, Eğitmen ve Program Yöneticisi için tanımlar.
     */
    path: 'courses',
    title: 'Dersler · Adaptif Eğitim',
    canMatch: [permissionGuard('course:read'), roleGuard('STUDENT', 'INSTRUCTOR', 'PROGRAM_MANAGER')],
    loadComponent: () =>
      import('./pages/courses/course-list.page').then((module) => module.CourseListPage),
  },
  {
    path: 'courses/:id',
    title: 'Ders Detayı · Adaptif Eğitim',
    canMatch: [permissionGuard('course:read'), roleGuard('STUDENT', 'INSTRUCTOR', 'PROGRAM_MANAGER')],
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
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () =>
      import('./pages/questions/question-editor.page').then((module) => module.QuestionEditorPage),
  },
  {
    path: 'questions/:id/edit',
    title: 'Soruyu Düzenle · Adaptif Eğitim',
    canMatch: [permissionGuard('question:write')],
    canDeactivate: [unsavedChangesGuard],
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
    /*
     * Sınav YAZIM listesi — öğrenciye kapalıdır.
     *
     * `exam:read` iznini öğrenci de taşır (bekleme odası ve sınav detayı için
     * gerekli), bu yüzden izin tek başına yetmiyor. Öğrencinin kendi sınavları
     * `/my-exams` ve `/exam-results` ekranlarındadır; bu ekranın açıklaması
     * "sınavları oluşturun, doğrulayın ve yayına alın" der ve hedef kitlesi
     * personeldir.
     *
     * `pathMatch: 'full'` ZORUNLU (ADR-076): aksi hâlde Router, varsayılan
     * `prefix` eşleşmesiyle bu adayı `/exams/:id/waiting-room` gibi daha
     * özgül alt rotalardan ÖNCE dener. `canMatch` reddi bir UrlTree (yönlendirme)
     * döndürdüğü için Router bunu koşulsuz uygular ve öğrenci — `exam:read`e
     * sahip olsa bile — sınava girerken/detayına bakarken 403'e düşer.
     */
    path: 'exams',
    pathMatch: 'full',
    title: 'Sınavlar · Adaptif Eğitim',
    canMatch: [
      permissionGuard('exam:read'),
      /*
       * PLATFORM_ADMIN burada YOK: ADR-077 ile akademik kapsamdan çıkarıldı,
       * zaten `exam:read` iznini taşımıyor. PROGRAM_MANAGER ve OBSERVER da
       * burada YOK: RolesPermissions.md sidebar'larında "Exams" ekranı yok —
       * her ikisi de `exam:read` iznini (arama/kapsam gibi başka amaçlarla)
       * taşıyor olsa da bu, sınav yönetim ekranına erişim vermez. Rol listesi
       * yine de tutulur çünkü `exam:read`i öğrenci de taşır — asıl filtre budur.
       */
      roleGuard('INSTRUCTOR', 'ASSESSMENT_SPECIALIST'),
    ],
    loadComponent: () =>
      import('./pages/exams/exam-list.page').then((module) => module.ExamListPage),
  },
  {
    path: 'my-exams',
    title: 'Sınavlarım · Adaptif Eğitim',
    canMatch: [permissionGuard('exam:read')],
    loadComponent: () =>
      import('./pages/session/my-exams.page').then((module) => module.MyExamsPage),
  },
  {
    path: 'exam-results',
    title: 'Sonuçlarım · Adaptif Eğitim',
    canMatch: [permissionGuard('exam:read')],
    loadComponent: () =>
      import('./pages/session/exam-results.page').then((module) => module.ExamResultsPage),
  },
  {
    /* Bekleme odası ve sihirbaz, `exams/:id` kalıbından ÖNCE gelmelidir. */
    path: 'exams/:id/waiting-room',
    title: 'Sınav Bekleme Odası · Adaptif Eğitim',
    canMatch: [permissionGuard('exam:read')],
    loadComponent: () =>
      import('./pages/session/exam-waiting-room.page').then(
        (module) => module.ExamWaitingRoomPage,
      ),
  },
  {
    path: 'exams/:id/wizard',
    title: 'Sınav Sihirbazı · Adaptif Eğitim',
    canMatch: [permissionGuard('exam:write')],
    canDeactivate: [unsavedChangesGuard],
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
    /*
     * `pathMatch: 'full'` ZORUNLU (ADR-076): varsayılan `prefix` eşleşmesiyle
     * bu aday `/grading/conflicts` gibi alt yolları da yakalar. `canMatch`
     * reddi bir UrlTree (yönlendirme) döndürdüğü için Router bunu koşulsuz
     * uygular ve program yöneticisi — çakışma ekranına yetkisi olmasına
     * rağmen — 403'e düşerdi.
     */
    path: 'grading',
    pathMatch: 'full',
    title: 'Değerlendirme · Adaptif Eğitim',
    canMatch: [permissionGuard('attempt:grade')],
    loadComponent: () =>
      import('./pages/grading/grading-queue.page').then((module) => module.GradingQueuePage),
  },
  {
    /*
     * Çakışma hakemliği — puanlama kuyruğundan AYRI, `attempt:override` ile.
     * `grading/:attemptId` kalıbından ÖNCE gelmelidir, aksi hâlde "conflicts"
     * bir deneme kimliği sanılırdı.
     */
    path: 'grading/conflicts',
    title: 'Çakışmalar · Adaptif Eğitim',
    canMatch: [permissionGuard('attempt:override')],
    loadComponent: () =>
      import('./pages/grading/conflict-list.page').then((module) => module.ConflictListPage),
  },
  {
    /*
     * Deneme puanlama/hakemlik ekranı.
     *
     * İki farklı iş için iki farklı izin kabul edilir (`canAny`): puanlayan
     * eğitmen `attempt:grade`, çakışmayı karara bağlayan program yöneticisi
     * `attempt:override` ile girer. Ekran içindeki kontroller zaten ayrı ayrı
     * gated: puanlama alanları `canGrade()`, çakışma paneli `canOverride()` —
     * yani hakem puanlama araçlarını görmez.
     */
    path: 'grading/:attemptId',
    title: 'Puanlama · Adaptif Eğitim',
    canMatch: [permissionGuard('attempt:grade', 'attempt:override')],
    loadComponent: () =>
      import('./pages/grading/grading-detail.page').then((module) => module.GradingDetailPage),
  },

  {
    /*
     * Tüm öğrencilerin denemelerini listeleyen ekran — RolesPermissions.md
     * yalnızca Eğitmen'e "View student submissions" yetkisi tanır. `attempt:read`
     * iznini Ölçme Uzmanı, Program Yöneticisi ve Gözlemci de (madde analizi/kapsam
     * gibi başka amaçlarla) taşıyor olsa da bu liste ekranını hiç görmez.
     */
    path: 'attempts',
    title: 'Denemeler · Adaptif Eğitim',
    canMatch: [permissionGuard('attempt:read'), roleGuard('INSTRUCTOR')],
    loadComponent: () =>
      import('./pages/attempts/attempt-list.page').then((module) => module.AttemptListPage),
  },
  {
    /*
     * Aynı ekran ikili amaçlıdır: Öğrenci KENDİ sonucunu inceler
     * (`exam-results.page.ts` buraya yönlendirir), Eğitmen ise kendi dersindeki
     * herhangi bir öğrencinin denemesini — veri kapsamı (`isWithinScope`,
     * course/own) sunucu tarafında zaten sınırlıyor. Bu yüzden liste ekranından
     * farklı olarak STUDENT de rol listesinde kalır.
     */
    path: 'attempts/:attemptId',
    title: 'Deneme Detayı · Adaptif Eğitim',
    canMatch: [permissionGuard('attempt:read'), roleGuard('STUDENT', 'INSTRUCTOR')],
    loadComponent: () =>
      import('./pages/attempts/attempt-detail.page').then((module) => module.AttemptDetailPage),
  },

  {
    path: 'analytics',
    title: 'Analitik · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:student')],
    loadComponent: () =>
      import('./pages/analytics/analytics-overview.page').then(
        (module) => module.AnalyticsOverviewPage,
      ),
  },
  {
    /*
     * `analytics:cohort` iznini Eğitmen, Ölçme Uzmanı ve Gözlemci de taşır,
     * ama RolesPermissions.md "Trends"i yalnızca Program Yöneticisi'nin
     * analitik listesinde tanımlar.
     */
    path: 'analytics/trends',
    title: 'Trend Analizi · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:cohort'), roleGuard('PROGRAM_MANAGER')],
    loadComponent: () =>
      import('./pages/analytics/trend-analytics.page').then(
        (module) => module.TrendAnalyticsPage,
      ),
  },
  {
    path: 'analytics/outcomes',
    title: 'Kazanım Analitiği · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:cohort')],
    loadComponent: () =>
      import('./pages/analytics/outcome-analytics.page').then(
        (module) => module.OutcomeAnalyticsPage,
      ),
  },
  {
    path: 'analytics/mastery',
    title: 'Kazanım Isı Haritası · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:cohort')],
    loadComponent: () =>
      import('./pages/analytics/mastery-heatmap.page').then(
        (module) => module.MasteryHeatmapPage,
      ),
  },
  {
    path: 'analytics/difficulty',
    title: 'Soru Zorluk Analizi · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:item')],
    loadComponent: () =>
      import('./pages/analytics/difficulty-analytics.page').then(
        (module) => module.DifficultyAnalyticsPage,
      ),
  },
  {
    // Aynı gerekçe: RolesPermissions.md "Recommendation Analytics"i yalnızca Program Yöneticisi'ne verir.
    path: 'analytics/recommendations',
    title: 'Öneri Motoru Analizi · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:cohort'), roleGuard('PROGRAM_MANAGER')],
    loadComponent: () =>
      import('./pages/analytics/recommendation-analytics.page').then(
        (module) => module.RecommendationAnalyticsPage,
      ),
  },
  {
    // Aynı gerekçe: RolesPermissions.md "Learning Velocity"yi yalnızca Program Yöneticisi'ne verir.
    path: 'analytics/velocity',
    title: 'Öğrenme Hızı · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:cohort'), roleGuard('PROGRAM_MANAGER')],
    loadComponent: () =>
      import('./pages/analytics/velocity-analytics.page').then(
        (module) => module.VelocityAnalyticsPage,
      ),
  },
  {
    // Aynı gerekçe: RolesPermissions.md "Success Dashboard"ı yalnızca Program Yöneticisi'ne verir.
    path: 'analytics/performers',
    title: 'Başarı Panosu · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:cohort'), roleGuard('PROGRAM_MANAGER')],
    loadComponent: () =>
      import('./pages/analytics/performers.page').then((module) => module.PerformersPage),
  },
  {
    path: 'analytics/compare',
    title: 'Karşılaştırmalı Analiz · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:cohort')],
    loadComponent: () =>
      import('./pages/analytics/compare-analytics.page').then(
        (module) => module.CompareAnalyticsPage,
      ),
  },
  {
    path: 'analytics/reports',
    title: 'Kayıtlı Raporlar · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:student')],
    loadComponent: () =>
      import('./pages/analytics/saved-reports.page').then((module) => module.SavedReportsPage),
  },

  {
    path: 'student/:id/analytics',
    title: 'Öğrenci Analitiği · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:student')],
    loadComponent: () =>
      import('./pages/analytics/student-analytics.page').then(
        (module) => module.StudentAnalyticsPage,
      ),
  },
  {
    /*
     * `analytics:cohort` iznini Eğitmen ve Ölçme Uzmanı da taşır, ama
     * RolesPermissions.md "Cohorts"u yalnızca Program Yöneticisi ve
     * Gözlemci'nin sidebar'ında tanımlar.
     */
    path: 'cohort-analytics',
    title: 'Cohort Analitiği · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:cohort'), roleGuard('PROGRAM_MANAGER', 'OBSERVER')],
    loadComponent: () =>
      import('./pages/analytics/cohort-analytics.page').then(
        (module) => module.CohortAnalyticsPage,
      ),
  },
  {
    path: 'item-analysis',
    title: 'Madde Analizi · Adaptif Eğitim',
    canMatch: [permissionGuard('analytics:item')],
    loadComponent: () =>
      import('./pages/analytics/item-analysis.page').then((module) => module.ItemAnalysisPage),
  },

];
