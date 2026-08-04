import {
  CONTENT_TYPE_ICONS,
  CONTENT_TYPE_LABELS,
  ContentItem,
  ContentProgress,
  ContentType,
  isAssessmentContent,
} from '../../../../../features/adaptive-learning/models/content-item.model';
import { MatrixData } from '../../../../../features/adaptive-learning/models/analytics.model';
import {
  AchievementCard,
  ActivityEntry,
  ContinueLearningCard,
  DailyGoal,
  DailyGoalTask,
  HeroCard,
  OutcomeHighlight,
  ProgressCard,
  QuickAction,
  RecentContentEntry,
  StatisticEntry,
  StudentDashboard,
  WeeklyProgress,
} from '../../../../../features/adaptive-learning/models/dashboard.model';
import { LearningPath } from '../../../../../features/adaptive-learning/models/learning-path.model';
import { LEARNING_THRESHOLDS } from '../../../../../features/adaptive-learning/domain/learning-rules';
import {
  buildAchievements,
  buildWeeklyStudy,
  calculateStreak,
} from '../../../../../features/adaptive-learning/domain/engagement';
import { AppIconName } from '../../../../../shared/icons/app-icons';
import {
  StudentLearningContext,
  buildStudentLearningContext,
  buildStudentPaths,
  buildStudentRecommendations,
} from '../learning/learning-context';
import {
  DashboardScope,
  average,
  buildNotifications,
  buildRecentActivity,
  buildScoreTrend,
  buildUpcomingExams,
  kpi,
  percent,
} from './dashboard-context';

const WEEKLY_STUDY_GOAL_MINUTES = 300;
const DAILY_GOAL_MINUTES = 45;
const DAILY_GOAL_MAX_TASKS = 4;
const HEATMAP_PERIODS = ['1. Hafta', '2. Hafta', '3. Hafta', '4. Hafta', '5. Hafta', '6. Hafta'];
const HEATMAP_OUTCOME_LIMIT = 10;
const DAY_MS = 86_400_000;

/**
 * Öğrenci öğrenme paneli (Sprint 4).
 *
 * Adaptif bloklar (öğrenme yolu, öneriler) ile öğrenme yolu ekranı AYNI
 * `learning-context` derlemesini kullanır; iki ekran farklı sonuç gösteremez.
 * Oyunlaştırma göstergeleri gerçek çalışma verisinden türetilir — uydurma sayı
 * üretilmez (`domain/engagement.ts`).
 *
 * Öğrenci yalnızca kendi verisini görür; kapsam `buildScope` ile daraltılmıştır.
 */
export function buildStudentDashboard(scope: DashboardScope): StudentDashboard {
  const { db, caller } = scope;

  const learning = buildStudentLearningContext(db, caller.userId, scope.now);
  const paths = buildStudentPaths(learning);
  const recommendations = buildStudentRecommendations(learning);

  const contentById = new Map(learning.contents.map((content) => [content.id, content] as const));
  const courseCodeById = new Map(
    learning.courses.map((entry) => [entry.course.id, entry.course.code] as const),
  );

  const completedContent = learning.progress.filter((item) => item.state === 'completed');
  const inProgressContent = learning.progress.filter((item) => item.state === 'in_progress');
  const totalMinutes = learning.progress.reduce((sum, item) => sum + item.spentMinutes, 0);

  const streak = calculateStreak(
    learning.progress
      .map((item) => item.lastAccessedAt)
      .filter((value): value is string => value !== null),
    scope.now,
  );
  const weeklyProgress = buildWeeklyProgress(learning, contentById, scope.now);

  // Öğrencinin "aktif" dersi: devam edilebilir adımı olan ilk yol.
  const currentPath = paths.find((path) => path.currentStep !== null) ?? paths[0] ?? null;
  const continueLearning = buildContinueLearning(currentPath, learning, contentById);

  const activeSessions = db
    .collection('sessions')
    .filter((session) => session.studentId === caller.userId && session.state === 'IN_PROGRESS');

  const masteryScores = scope.mastery.map((score) => score.score);
  const averageMastery = average(masteryScores);
  const scoreValues = scope.attempts
    .slice()
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt))
    .map((attempt) => attempt.scorePercent);

  const isNewLearner = learning.progress.length === 0 && scope.attempts.length === 0;

  return {
    role: 'STUDENT',
    generatedAt: scope.nowIso,
    headline: 'Çalışma planın hazır',
    subline: `${learning.courses.length} ders · ${scope.mastery.length} kazanım ölçümü`,

    hero: buildHero(scope, currentPath, continueLearning, streak.currentStreak, isNewLearner),
    continueLearning,
    dailyGoal: buildDailyGoal(currentPath, learning, scope.now),
    streak,
    weeklyProgress,
    achievements: buildAchievementCards(learning, completedContent, paths),

    kpis: [
      kpi({
        key: 'mastery',
        label: 'Ortalama ustalık',
        value: averageMastery,
        unit: '%',
        icon: 'target',
        caption: `${scope.mastery.length} kazanım ölçümü`,
        series: masteryScores,
      }),
      kpi({
        key: 'exam-score',
        label: 'Sınav başarı ortalaması',
        value: average(scoreValues),
        unit: '%',
        icon: 'trending-up',
        caption: `${scope.attempts.length} tamamlanmış deneme`,
        series: scoreValues,
      }),
      kpi({
        key: 'completed-content',
        label: 'Tamamlanan içerik',
        value: completedContent.length,
        icon: 'circle-check-big',
        caption: `${inProgressContent.length} içerik devam ediyor`,
        series: weeklyProgress.days.map((day) => day.completedCount),
      }),
      kpi({
        key: 'weekly-study',
        label: 'Bu haftaki çalışma',
        value: weeklyProgress.totalMinutes,
        unit: 'dk',
        icon: 'clock',
        caption:
          streak.currentStreak === 0
            ? 'Bugün çalışarak seriyi başlat'
            : `${streak.currentStreak} günlük seri sürüyor`,
        series: weeklyProgress.days.map((day) => day.minutes),
      }),
    ],

    quickActions: buildQuickActions(
      learning,
      recommendations.length,
      activeSessions[0]?.token ?? null,
    ),
    notifications: buildNotifications(db, caller.userId),
    recentActivity: buildStudentActivity(scope, learning, contentById),
    statistics: buildStatistics(scope, averageMastery, totalMinutes),

    progress: buildProgress(scope, learning, completedContent.length),
    masteryTrend: buildScoreTrend(scope.attempts),
    masteryHeatmap: buildMasteryHeatmap(scope),
    recommendations,
    currentPath,
    upcomingExams: buildUpcomingExams(scope),
    recentContent: buildRecentContent(learning, contentById, courseCodeById),
    weakOutcomes: buildOutcomeHighlights(scope, learning, 'weak'),
    strongOutcomes: buildOutcomeHighlights(scope, learning, 'strong'),
    isNewLearner,
  };
}

/* ── Hero ve devam kartı ─────────────────────────────────────────────────── */

function buildHero(
  scope: DashboardScope,
  currentPath: LearningPath | null,
  continueLearning: ContinueLearningCard | null,
  currentStreak: number,
  isNewLearner: boolean,
): HeroCard {
  const name = scope.db.collection('users').findById(scope.caller.userId)?.fullName ?? '';
  const firstName = name.split(' ')[0] ?? '';
  const hour = new Date(scope.now).getHours();
  const greeting =
    hour < 6 ? 'İyi geceler' : hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';

  const message = isNewLearner
    ? 'Henüz çalışma kaydın yok. Öğrenme yolundaki ilk adımla başlayabilirsin.'
    : continueLearning
      ? `"${continueLearning.title}" içeriğine kaldığın yerden devam et.`
      : currentStreak > 0
        ? `${currentStreak} günlük serini sürdürüyorsun. Bugünkü hedefini tamamla.`
        : 'Tüm adımlarını tamamladın. Yeni içerikler eklendiğinde burada göreceksin.';

  return {
    greeting: firstName ? `${greeting}, ${firstName}` : greeting,
    headline: currentPath
      ? `${currentPath.courseCode} · ${currentPath.courseName}`
      : 'Öğrenme yolun',
    message,
    continueContentId: continueLearning?.contentId ?? null,
    continueCourseId: continueLearning?.courseId ?? null,
    progressPercent: currentPath?.completionPercent ?? 0,
  };
}

function buildContinueLearning(
  currentPath: LearningPath | null,
  learning: StudentLearningContext,
  contentById: ReadonlyMap<string, ContentItem>,
): ContinueLearningCard | null {
  const step = currentPath?.currentStep;
  if (!currentPath || !step) return null;

  const content = contentById.get(step.contentId);
  const section = currentPath.sections.find((item) =>
    item.steps.some((candidate) => candidate.contentId === step.contentId),
  );
  const progress = learning.progressByContent.get(step.contentId);

  return {
    contentId: step.contentId,
    title: step.title,
    type: CONTENT_TYPE_LABELS[step.type],
    icon: CONTENT_TYPE_ICONS[step.type] as AppIconName,
    courseId: currentPath.courseId,
    courseCode: currentPath.courseCode,
    courseName: currentPath.courseName,
    outcomeCode: section?.outcomeCode ?? '',
    outcomeTitle: section?.outcomeTitle ?? '',
    progressPercent: step.completionPercent,
    estimatedDurationMinutes: content?.estimatedDurationMinutes ?? step.estimatedDurationMinutes,
    lastAccessedAt: progress?.lastAccessedAt ?? null,
  };
}

/* ── Günlük hedef ────────────────────────────────────────────────────────── */

/**
 * Bugünün görevleri: aktif yoldaki devam eden ve önerilen adımlar.
 * Hedef süre görevlerin toplam süresidir (en az `DAILY_GOAL_MINUTES`).
 */
function buildDailyGoal(
  currentPath: LearningPath | null,
  learning: StudentLearningContext,
  now: number,
): DailyGoal {
  const today = Math.floor(now / DAY_MS);

  const candidates = (currentPath?.sections ?? [])
    .flatMap((section) => section.steps)
    .filter((step) => step.state === 'in_progress' || step.state === 'recommended')
    .slice(0, DAILY_GOAL_MAX_TASKS);

  const tasks: DailyGoalTask[] = candidates.map((step) => {
    const progress = learning.progressByContent.get(step.contentId);
    const completedToday =
      progress?.state === 'completed' &&
      progress.completedAt !== null &&
      Math.floor(Date.parse(progress.completedAt) / DAY_MS) === today;

    return {
      contentId: step.contentId,
      title: step.title,
      type: CONTENT_TYPE_LABELS[step.type],
      icon: CONTENT_TYPE_ICONS[step.type] as AppIconName,
      estimatedDurationMinutes: step.estimatedDurationMinutes,
      completed: completedToday,
    };
  });

  // Bugün tamamlanmış tüm içerikler hedefe sayılır, listede olmasalar bile.
  const completedTodayProgress = learning.progress.filter(
    (item) =>
      item.completedAt !== null && Math.floor(Date.parse(item.completedAt) / DAY_MS) === today,
  );
  const minutesToday = learning.progress
    .filter(
      (item) =>
        item.lastAccessedAt !== null &&
        Math.floor(Date.parse(item.lastAccessedAt) / DAY_MS) === today,
    )
    .reduce((sum, item) => sum + item.spentMinutes, 0);

  const plannedMinutes = tasks.reduce((sum, task) => sum + task.estimatedDurationMinutes, 0);

  return {
    tasks,
    targetMinutes: Math.max(DAILY_GOAL_MINUTES, plannedMinutes),
    completedMinutes: minutesToday,
    completedTasks: completedTodayProgress.length,
  };
}

/* ── Haftalık ilerleme ───────────────────────────────────────────────────── */

function buildWeeklyProgress(
  learning: StudentLearningContext,
  contentById: ReadonlyMap<string, ContentItem>,
  now: number,
): WeeklyProgress {
  const days = buildWeeklyStudy(learning.progress, now);
  const weekStart = now - 7 * DAY_MS;

  const quizProgress = learning.progress.filter((item) => {
    const content = contentById.get(item.contentId);
    return (
      content !== undefined &&
      isAssessmentContent(content.type) &&
      item.scorePercent !== null &&
      item.completedAt !== null &&
      Date.parse(item.completedAt) >= weekStart
    );
  });

  const passed = quizProgress.filter(
    (item) => (item.scorePercent ?? 0) >= LEARNING_THRESHOLDS.failingScore,
  ).length;

  return {
    days: days.map((day) => ({
      label: day.label,
      minutes: day.minutes,
      completedCount: day.completedCount,
    })),
    totalMinutes: days.reduce((sum, day) => sum + day.minutes, 0),
    completedCount: days.reduce((sum, day) => sum + day.completedCount, 0),
    quizSuccessPercent: percent(passed, quizProgress.length),
  };
}

/* ── Etkinlik akışı ──────────────────────────────────────────────────────── */

/** İçerik türüne göre etkinlik cümlesi — "Video izlendi", "Kısa sınav tamamlandı"… */
const ACTIVITY_VERBS: Readonly<Record<ContentType, { started: string; completed: string }>> = {
  video: { started: 'Video izlenmeye başlandı', completed: 'Video izlendi' },
  presentation: { started: 'Sunum açıldı', completed: 'Sunum tamamlandı' },
  pdf: { started: 'Ders notu açıldı', completed: 'Ders notu okundu' },
  quiz: { started: 'Kısa sınava başlandı', completed: 'Kısa sınav tamamlandı' },
  assignment: { started: 'Ödeve başlandı', completed: 'Ödev tamamlandı' },
  external_link: { started: 'Dış kaynak açıldı', completed: 'Dış kaynak tamamlandı' },
};

/**
 * Öğrencinin etkinlik akışı.
 *
 * İki kaynak birleştirilir: içerik ilerlemesi (ne izledi, neyi tamamladı) ve
 * denemelerine ait denetim kayıtları (puanlama, sonuç açıklama). Yalnızca sınav
 * kayıtları gösterilseydi, çalışma yapan ama sınava girmemiş öğrencinin akışı
 * boş kalırdı.
 */
function buildStudentActivity(
  scope: DashboardScope,
  learning: StudentLearningContext,
  contentById: ReadonlyMap<string, ContentItem>,
): ActivityEntry[] {
  const fromContent: ActivityEntry[] = learning.progress.flatMap((item) => {
    const content = contentById.get(item.contentId);
    const at = item.completedAt ?? item.lastAccessedAt;
    if (!content || !at) return [];

    const completed = item.state === 'completed';
    const verbs = ACTIVITY_VERBS[content.type];

    return [
      {
        id: `act_${item.id}`,
        title: content.title,
        description: completed
          ? `${verbs.completed}${item.scorePercent !== null ? ` · %${item.scorePercent}` : ''}`
          : `${verbs.started} · %${item.completionPercent}`,
        at,
        icon: (completed
          ? 'circle-check-big'
          : CONTENT_TYPE_ICONS[content.type]) as ActivityEntry['icon'],
        tone: completed ? ('success' as const) : ('info' as const),
        actor: 'Sen',
      },
    ];
  });

  const fromAudit = buildRecentActivity(scope.db, (event) =>
    scope.attempts.some((attempt) => attempt.id === event.targetId),
  );

  return [...fromContent, ...fromAudit]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 8);
}

/* ── Başarımlar ──────────────────────────────────────────────────────────── */

function buildAchievementCards(
  learning: StudentLearningContext,
  completedContent: readonly ContentProgress[],
  paths: readonly LearningPath[],
): AchievementCard[] {
  const contentById = new Map(learning.contents.map((content) => [content.id, content] as const));

  const completedQuizCount = completedContent.filter((item) => {
    const content = contentById.get(item.contentId);
    return content !== undefined && isAssessmentContent(content.type);
  }).length;

  const streak = calculateStreak(
    learning.progress
      .map((item) => item.lastAccessedAt)
      .filter((value): value is string => value !== null),
    learning.nowMs,
  );

  const masteredOutcomeCount = learning.courses
    .flatMap((entry) => [...entry.mastery.values()])
    .filter((score) => score >= LEARNING_THRESHOLDS.highMastery).length;

  return buildAchievements({
    completedCount: completedContent.length,
    completedQuizCount,
    currentStreak: streak.currentStreak,
    completedCourseCount: paths.filter((path) => path.completionPercent >= 100).length,
    masteredOutcomeCount,
  }).map((achievement) => ({
    ...achievement,
    icon: achievement.icon as AppIconName,
  }));
}

/* ── Kazanım vurguları ───────────────────────────────────────────────────── */

/**
 * Zayıf/güçlü kazanımlar KISA BİR YÖNLENDİRME ile birlikte döner —
 * öğrenci "ne yapmalıyım" sorusuna kartın üzerinde cevap bulur.
 */
function buildOutcomeHighlights(
  scope: DashboardScope,
  learning: StudentLearningContext,
  kind: 'weak' | 'strong',
): OutcomeHighlight[] {
  const courseCodeByOutcome = new Map(
    learning.courses.flatMap((entry) =>
      entry.outcomes.map((outcome) => [outcome.id, entry.course.code] as const),
    ),
  );

  const ranked = [...scope.mastery].sort((a, b) =>
    kind === 'weak' ? a.score - b.score : b.score - a.score,
  );

  return ranked.slice(0, 5).map((score) => {
    // Yönlendirme hedefi: o kazanımın tamamlanmamış ilk içeriği.
    const target = learning.contents.find(
      (content) =>
        content.outcomeId === score.outcomeId &&
        learning.progressByContent.get(content.id)?.state !== 'completed',
    );

    return {
      outcomeId: score.outcomeId,
      outcomeCode: score.outcomeCode,
      outcomeTitle: score.outcomeTitle,
      courseCode: courseCodeByOutcome.get(score.outcomeId) ?? '',
      masteryScore: score.score,
      advice: adviceFor(kind, score.score, target?.title ?? null),
      targetContentId: target?.id ?? null,
    };
  });
}

function adviceFor(kind: 'weak' | 'strong', score: number, targetTitle: string | null): string {
  if (kind === 'weak') {
    if (score < LEARNING_THRESHOLDS.lowMastery) {
      return targetTitle
        ? `Temeli güçlendirmek için "${targetTitle}" ile başla.`
        : 'Bu kazanımın anlatım içeriklerini baştan çalış.';
    }
    return targetTitle
      ? `Pekiştirmek için "${targetTitle}" adımını tamamla.`
      : 'Kısa sınavlarla pekiştirme yap.';
  }

  if (score >= LEARNING_THRESHOLDS.highMastery) {
    return targetTitle
      ? `Bu kazanımda güçlüsün; "${targetTitle}" ile bir sonraki adıma geç.`
      : 'Bu kazanımı tamamladın; sıradaki kazanıma geçebilirsin.';
  }
  return 'İyi gidiyorsun; düzenli tekrarla seviyeni koru.';
}

/* ── Diğer bloklar ───────────────────────────────────────────────────────── */

function buildQuickActions(
  learning: StudentLearningContext,
  recommendationCount: number,
  activeSessionToken: string | null,
): QuickAction[] {
  const actions: QuickAction[] = [];

  if (activeSessionToken) {
    actions.push({
      /*
       * Sınav listesine götürür, oturuma DOĞRUDAN değil.
       *
       * Önceki bağlantı `/exam-session/:token` idi; böyle bir rota yok
       * (gerçek yol `/session/:token`) ve düğme 404'e düşüyordu. Doğru yola
       * çevirmek de yeterli olmazdı: oturum bekleme odasından açılır — süre,
       * kural özeti ve devam jetonu orada doğrulanır. Sınav listesi her satırı
       * bekleme odasına bağlar, akış bütün kalır.
       */
      id: 'resume-exam',
      label: 'Sınava devam et',
      description: 'Devam eden oturumun var',
      icon: 'timer',
      link: '/my-exams',
      badge: null,
      tone: 'danger',
    });
  }

  actions.push(
    {
      id: 'learning-path',
      label: 'Öğrenme yolum',
      description: 'Sıradaki adımların',
      icon: 'workflow',
      link: '/learning/path',
      badge: null,
      tone: 'primary',
    },
    {
      id: 'recommendations',
      label: 'Önerilen içerikler',
      description: 'Sana özel öneriler',
      icon: 'sparkles',
      link: '/learning/path',
      badge: recommendationCount > 0 ? recommendationCount : null,
      tone: 'info',
    },
    {
      id: 'content-library',
      label: 'İçerik kütüphanesi',
      description: `${learning.contents.length} yayındaki içerik`,
      icon: 'library',
      link: '/contents',
      badge: null,
      tone: 'neutral',
    },
  );

  return actions;
}

function buildProgress(
  scope: DashboardScope,
  learning: StudentLearningContext,
  completedCount: number,
): ProgressCard[] {
  const proficient = scope.mastery.filter(
    (score) => score.band === 'mastered' || score.band === 'proficient',
  ).length;

  const weekAgo = scope.now - 7 * DAY_MS;
  const weeklyMinutes = learning.progress
    .filter((item) => item.lastAccessedAt !== null && Date.parse(item.lastAccessedAt) >= weekAgo)
    .reduce((sum, item) => sum + item.spentMinutes, 0);
  const totalMinutes = learning.progress.reduce((sum, item) => sum + item.spentMinutes, 0);

  return [
    {
      key: 'outcome-coverage',
      label: 'Kazanım kapsaması',
      value: proficient,
      max: Math.max(1, scope.mastery.length),
      caption: `${proficient} / ${scope.mastery.length} kazanım yeterli seviyede`,
      tone: percent(proficient, Math.max(1, scope.mastery.length)) >= 60 ? 'success' : 'warning',
    },
    {
      key: 'content-completion',
      label: 'İçerik tamamlama',
      value: completedCount,
      max: Math.max(1, learning.contents.length),
      caption: `${completedCount} / ${learning.contents.length} içerik tamamlandı`,
      tone: 'primary',
    },
    {
      key: 'study-time',
      label: 'Haftalık çalışma hedefi',
      value: Math.min(WEEKLY_STUDY_GOAL_MINUTES, weeklyMinutes),
      max: WEEKLY_STUDY_GOAL_MINUTES,
      caption: `Son 7 günde ${weeklyMinutes} dk · toplam ${Math.round(totalMinutes / 60)} saat`,
      tone: weeklyMinutes >= WEEKLY_STUDY_GOAL_MINUTES * 0.6 ? 'success' : 'warning',
    },
  ];
}

/**
 * Kazanım × hafta ısı haritası.
 *
 * Gerçek cevap zamanlarından üretilir: her kazanım için o haftaya ait denemelerin
 * doğruluk oranı hesaplanır. Veri yoksa hücre `null` kalır (grafik boşluğu gösterir).
 */
function buildMasteryHeatmap(scope: DashboardScope): MatrixData {
  const outcomes = scope.mastery
    .slice()
    .sort((a, b) => a.outcomeCode.localeCompare(b.outcomeCode, 'tr-TR'))
    .slice(0, HEATMAP_OUTCOME_LIMIT);

  const questionById = new Map(
    scope.db
      .collection('questions')
      .all()
      .map((question) => [question.id, question] as const),
  );
  const weekMs = 7 * DAY_MS;
  const windowStart = scope.now - HEATMAP_PERIODS.length * weekMs;

  // (kazanım, hafta) → doğru/toplam sayacı
  const buckets = new Map<string, { correct: number; total: number }>();

  for (const attempt of scope.attempts) {
    const submitted = Date.parse(attempt.submittedAt);
    if (submitted < windowStart) continue;

    const weekIndex = Math.min(
      HEATMAP_PERIODS.length - 1,
      Math.floor((submitted - windowStart) / weekMs),
    );

    for (const answer of attempt.answers) {
      const question = questionById.get(answer.questionId);
      if (!question) continue;

      for (const outcomeId of question.outcomeIds) {
        const key = `${outcomeId}|${weekIndex}`;
        const bucket = buckets.get(key) ?? { correct: 0, total: 0 };
        bucket.total += 1;
        if (answer.maxPoints > 0 && answer.awardedPoints >= answer.maxPoints) bucket.correct += 1;
        buckets.set(key, bucket);
      }
    }
  }

  return {
    columns: HEATMAP_PERIODS,
    rows: outcomes.map((score) => ({
      id: score.outcomeId,
      label: score.outcomeCode,
      title: score.outcomeTitle,
    })),
    cells: outcomes.flatMap((score) =>
      HEATMAP_PERIODS.map((columnLabel, weekIndex) => {
        const bucket = buckets.get(`${score.outcomeId}|${weekIndex}`);
        return {
          rowId: score.outcomeId,
          rowLabel: score.outcomeCode,
          columnLabel,
          value: bucket ? Math.round((bucket.correct / bucket.total) * 100) : null,
          sampleSize: bucket?.total ?? 0,
        };
      }),
    ),
  };
}

function buildRecentContent(
  learning: StudentLearningContext,
  contentById: ReadonlyMap<string, ContentItem>,
  courseCodeById: ReadonlyMap<string, string>,
): RecentContentEntry[] {
  return learning.progress
    .filter((item) => item.lastAccessedAt !== null)
    .sort((a, b) => Date.parse(b.lastAccessedAt!) - Date.parse(a.lastAccessedAt!))
    .slice(0, 5)
    .flatMap((item) => {
      const content = contentById.get(item.contentId);
      if (!content) return [];

      return [
        {
          id: content.id,
          title: content.title,
          courseCode: courseCodeById.get(content.courseId) ?? '',
          format: CONTENT_TYPE_LABELS[content.type],
          icon: CONTENT_TYPE_ICONS[content.type] as AppIconName,
          progressPercent: item.completionPercent,
          lastAccessedAt: item.lastAccessedAt!,
          durationMinutes: content.estimatedDurationMinutes,
        },
      ];
    });
}

function buildStatistics(
  scope: DashboardScope,
  averageMastery: number,
  totalMinutes: number,
): StatisticEntry[] {
  const passed = scope.attempts.filter((attempt) => attempt.passed).length;
  const weakest = [...scope.mastery].sort((a, b) => a.score - b.score)[0];

  return [
    {
      label: 'Geçme oranı',
      value: `%${percent(passed, scope.attempts.length)}`,
      hint: `${scope.attempts.length} deneme üzerinden`,
    },
    {
      label: 'En zayıf kazanım',
      value: weakest ? `${weakest.outcomeCode} (${weakest.score})` : '—',
      hint: 'Öncelikli çalışma alanın',
    },
    {
      label: 'Ustalık ortalaması',
      value: `%${averageMastery}`,
      hint: 'Tüm kazanımların ortalaması',
    },
    {
      label: 'Toplam çalışma süresi',
      value: `${Math.round(totalMinutes / 60)} saat`,
      hint: 'Kayıtlı içerik etkileşimi',
    },
  ];
}
