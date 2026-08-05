import {
  DistributionBucket,
  NamedSeries,
  RankedEntry,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import {
  CourseProgressEntry,
  GradingQueueEntry,
  InstructorDashboard,
  ProgressCard,
  QuickAction,
  StatisticEntry,
} from '../../../../../features/adaptive-learning/models/dashboard.model';
import {
  QUESTION_STATE_LABELS,
  QuestionState,
} from '../../../../../features/adaptive-learning/models/question.model';
import { examRuntimeStatus } from '../../../../../features/adaptive-learning/domain/exam-runtime';
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

const AT_RISK_THRESHOLD = 45;

/**
 * Eğitmen paneli: değerlendirme kuyruğu, sınıf ilerlemesi ve risk altındaki öğrenciler.
 * Kapsam eğitmenin sorumlu olduğu derslerle sınırlıdır.
 */
export function buildInstructorDashboard(scope: DashboardScope): InstructorDashboard {
  const { db, caller } = scope;

  const pendingAttempts = scope.attempts.filter((attempt) => attempt.state === 'PENDING_MANUAL');
  const scoreValues = scope.attempts
    .slice()
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt))
    .map((attempt) => attempt.scorePercent);

  const questions = db
    .collection('questions')
    .filter((question) => caller.courseIds.includes(question.courseId));

  const studentIds = new Set(scope.attempts.map((attempt) => attempt.studentId));
  const activeSessions = db
    .collection('sessions')
    .filter(
      (session) =>
        session.state === 'IN_PROGRESS' && scope.exams.some((exam) => exam.id === session.examId),
    );

  return {
    role: 'INSTRUCTOR',
    generatedAt: scope.nowIso,
    headline: 'Sınıflarının durumu',
    subline: `${scope.courses.length} ders · ${studentIds.size} öğrenci`,

    kpis: [
      kpi({
        key: 'pending-grading',
        label: 'Bekleyen değerlendirme',
        value: pendingAttempts.length,
        icon: 'clipboard-list',
        caption: 'Açık uçlu cevaplar',
        series: buildPendingSeries(scope),
        higherIsBetter: false,
      }),
      kpi({
        key: 'class-average',
        label: 'Sınıf başarı ortalaması',
        value: average(scoreValues),
        unit: '%',
        icon: 'trending-up',
        caption: `${scope.attempts.length} deneme`,
        series: scoreValues,
      }),
      kpi({
        key: 'class-mastery',
        label: 'Ortalama ustalık',
        value: average(scope.mastery.map((score) => score.score)),
        unit: '%',
        icon: 'target',
        caption: `${scope.mastery.length} kazanım ölçümü`,
        series: scope.mastery.map((score) => score.score),
      }),
      kpi({
        key: 'active-session',
        label: 'Aktif oturum',
        value: activeSessions.length,
        icon: 'timer',
        caption: 'Şu anda sınavda',
        series: [activeSessions.length],
      }),
    ],

    quickActions: buildQuickActions(scope, pendingAttempts.length),
    notifications: buildNotifications(db, caller.userId),
    recentActivity: buildRecentActivity(db, (event) => event.actorId === caller.userId),
    statistics: buildStatistics(scope, pendingAttempts.length),

    progress: buildProgress(scope, pendingAttempts.length),
    gradingQueue: buildGradingQueue(scope, pendingAttempts),
    courseProgress: buildCourseProgress(scope),
    classPerformance: buildClassPerformance(scope),
    outcomeCoverage: buildOutcomeCoverage(scope),
    atRiskStudents: buildAtRiskStudents(scope),
    upcomingExams: buildUpcomingExams(scope),
    questionStates: buildQuestionStates(questions),
  };
}

/** Bekleyen değerlendirmenin son günlerdeki seyri — gerçek gönderim tarihlerinden. */
function buildPendingSeries(scope: DashboardScope): number[] {
  const pending = scope.attempts.filter((attempt) => attempt.state === 'PENDING_MANUAL');
  const dayMs = 86_400_000;

  return Array.from({ length: 7 }, (_, index) => {
    const cutoff = scope.now - (6 - index) * dayMs;
    return pending.filter((attempt) => Date.parse(attempt.submittedAt) <= cutoff).length;
  });
}

function buildQuickActions(scope: DashboardScope, pendingCount: number): QuickAction[] {
  return [
    {
      id: 'grading',
      label: 'Değerlendirme kuyruğu',
      description: 'Açık uçlu cevapları puanla',
      icon: 'clipboard-list',
      link: '/grading',
      badge: pendingCount > 0 ? pendingCount : null,
      tone: pendingCount > 0 ? 'warning' : 'neutral',
    },
    {
      id: 'exams',
      label: 'Sınav takvimi',
      description: 'Derslerinin sınav programı',
      icon: 'file-text',
      link: '/exams',
      badge: null,
      tone: 'info',
    },
    {
      id: 'courses',
      label: 'Derslerim',
      description: `${scope.courses.length} ders`,
      icon: 'library',
      link: '/courses',
      badge: null,
      tone: 'neutral',
    },
  ];
}

function buildProgress(scope: DashboardScope, pendingCount: number): ProgressCard[] {
  const graded = scope.attempts.filter(
    (attempt) => attempt.state === 'GRADED' || attempt.state === 'RELEASED',
  ).length;
  const published = scope.courses.filter((course) => course.state === 'PUBLISHED').length;
  const readyExams = scope.exams.filter(
    (exam) => ['scheduled', 'active'].includes(examRuntimeStatus(exam, scope.now)),
  ).length;

  return [
    {
      key: 'grading-progress',
      label: 'Değerlendirme ilerlemesi',
      value: graded,
      max: Math.max(1, graded + pendingCount),
      caption: `${pendingCount} deneme sırada bekliyor`,
      tone: pendingCount === 0 ? 'success' : 'warning',
    },
    {
      key: 'course-publish',
      label: 'Yayındaki dersler',
      value: published,
      max: Math.max(1, scope.courses.length),
      caption: `${scope.courses.length - published} ders hazırlık aşamasında`,
      tone: 'primary',
    },
    {
      key: 'exam-readiness',
      label: 'Planlanmış sınavlar',
      value: readyExams,
      max: Math.max(1, scope.exams.length),
      caption: `${scope.exams.length} sınav tanımlı`,
      tone: 'success',
    },
  ];
}

function buildGradingQueue(
  scope: DashboardScope,
  pendingAttempts: readonly {
    id: string;
    studentName: string;
    examTitle: string;
    courseId: string;
    submittedAt: string;
    answers: readonly { autoGraded: boolean }[];
  }[],
): GradingQueueEntry[] {
  const courseByCode = new Map(scope.courses.map((course) => [course.id, course.code]));

  return pendingAttempts
    .slice()
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt))
    .slice(0, 6)
    .map((attempt) => ({
      attemptId: attempt.id,
      studentName: attempt.studentName,
      examTitle: attempt.examTitle,
      courseCode: courseByCode.get(attempt.courseId) ?? '',
      pendingAnswers: attempt.answers.filter((answer) => !answer.autoGraded).length,
      submittedAt: attempt.submittedAt,
      waitingDays: Math.max(
        0,
        Math.floor((scope.now - Date.parse(attempt.submittedAt)) / 86_400_000),
      ),
    }));
}

function buildCourseProgress(scope: DashboardScope): CourseProgressEntry[] {
  const questions = scope.db.collection('questions').all();
  const contents = scope.db.collection('contents').all();

  return scope.courses.map((course) => {
    const courseMastery = scope.mastery.filter((score) => score.courseId === course.id);
    const courseContentIds = new Set(
      contents.filter((content) => content.courseId === course.id).map((content) => content.id),
    );
    const courseProgress = scope.progress.filter((item) => courseContentIds.has(item.contentId));
    const completed = courseProgress.filter((item) => item.state === 'completed').length;

    return {
      courseId: course.id,
      courseCode: course.code,
      courseName: course.name,
      studentCount: course.enrolledCount,
      averageMastery: average(courseMastery.map((score) => score.score)),
      completionPercent: percent(completed, Math.max(1, courseProgress.length)),
      publishedQuestionCount: questions.filter(
        (question) => question.courseId === course.id && question.state === 'PUBLISHED',
      ).length,
    };
  });
}

/** Ders bazlı başarı serileri — grafik için en fazla 4 ders gösterilir. */
function buildClassPerformance(scope: DashboardScope): NamedSeries[] {
  return scope.courses.slice(0, 4).map((course) => ({
    name: course.code,
    points: buildScoreTrend(
      scope.attempts.filter((attempt) => attempt.courseId === course.id),
      8,
    ),
  }));
}

function buildOutcomeCoverage(scope: DashboardScope): RankedEntry[] {
  const grouped = new Map<string, { code: string; title: string; scores: number[] }>();

  for (const score of scope.mastery) {
    const entry = grouped.get(score.outcomeId) ?? {
      code: score.outcomeCode,
      title: score.outcomeTitle,
      scores: [],
    };
    entry.scores.push(score.score);
    grouped.set(score.outcomeId, entry);
  }

  return [...grouped.entries()]
    .map(([outcomeId, entry]) => ({
      id: outcomeId,
      label: entry.code,
      sublabel: entry.title,
      value: average(entry.scores),
      unit: '%',
      ratio: average(entry.scores),
      tone: toneForScore(average(entry.scores)),
    }))
    .sort((a, b) => a.value - b.value)
    .slice(0, 6);
}

function buildAtRiskStudents(scope: DashboardScope): RankedEntry[] {
  const byStudent = new Map<string, { name: string; scores: number[] }>();

  for (const score of scope.mastery) {
    const attempt = scope.attempts.find((item) => item.studentId === score.studentId);
    const entry = byStudent.get(score.studentId) ?? {
      name: attempt?.studentName ?? 'Öğrenci',
      scores: [],
    };
    entry.scores.push(score.score);
    byStudent.set(score.studentId, entry);
  }

  return [...byStudent.entries()]
    .map(([studentId, entry]) => ({
      id: studentId,
      label: entry.name,
      sublabel: `${entry.scores.length} kazanım ölçümü`,
      value: average(entry.scores),
      unit: '%',
      ratio: average(entry.scores),
      tone: toneForScore(average(entry.scores)),
    }))
    .filter((entry) => entry.value < AT_RISK_THRESHOLD)
    .sort((a, b) => a.value - b.value)
    .slice(0, 6);
}

function buildQuestionStates(questions: readonly { state: QuestionState }[]): DistributionBucket[] {
  const total = Math.max(1, questions.length);

  return (Object.keys(QUESTION_STATE_LABELS) as QuestionState[]).map((state) => {
    const count = questions.filter((question) => question.state === state).length;
    return { label: QUESTION_STATE_LABELS[state], count, percent: percent(count, total) };
  });
}

function buildStatistics(scope: DashboardScope, pendingCount: number): StatisticEntry[] {
  const passed = scope.attempts.filter((attempt) => attempt.passed).length;
  const averageDuration = scope.attempts.length
    ? Math.round(
        scope.attempts.reduce((sum, attempt) => sum + attempt.durationSeconds, 0) /
          scope.attempts.length /
          60,
      )
    : 0;

  return [
    {
      label: 'Geçme oranı',
      value: `%${percent(passed, scope.attempts.length)}`,
      hint: `${scope.attempts.length} deneme üzerinden`,
    },
    {
      label: 'Ortalama çözüm süresi',
      value: `${averageDuration} dk`,
      hint: 'Deneme başına',
    },
    {
      label: 'Bekleyen değerlendirme',
      value: String(pendingCount),
      hint: 'Rubrik puanlaması gerekiyor',
    },
    {
      label: 'Kayıtlı öğrenci',
      value: String(scope.courses.reduce((sum, course) => sum + course.enrolledCount, 0)),
      hint: 'Tüm derslerin toplamı',
    },
  ];
}

function toneForScore(score: number): RankedEntry['tone'] {
  if (score < 35) return 'danger';
  if (score < 60) return 'warning';
  if (score < 80) return 'info';
  return 'success';
}
