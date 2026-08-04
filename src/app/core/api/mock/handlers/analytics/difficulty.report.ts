import {
  CategoryValue,
  DifficultyAnalytics,
  NamedSeries,
  ScatterPoint,
  TrendBundle,
  VelocityAnalytics,
  VelocityRow,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  Difficulty,
} from '../../../../../features/adaptive-learning/models/common.model';
import {
  computeVelocity,
  summarizeVelocity,
} from '../../../../../features/adaptive-learning/domain/learning-velocity';
import { mean, percentOf } from '../../../../../features/adaptive-learning/domain/statistics';
import {
  ReportScope,
  buildMeta,
  completionTrend,
  dailySeries,
  masteryTrend,
  scoreTrend,
  studyTimeTrend,
} from './report-context';

/**
 * Soru zorluk analizi (§6).
 *
 * İki farklı "zorluk" vardır ve karıştırılmamalıdır:
 *
 * · BEYAN EDİLEN zorluk (`declaredDifficulty`) — soruyu yazan kişinin tahmini.
 * · ÖLÇÜLEN zorluk (`difficultyIndex`) — öğrencilerin gerçekte ne kadar doğru
 *   cevapladığı.
 *
 * Rapor ikisini birlikte gösterir; aradaki fark soru yazarına geri bildirimdir.
 */
export function buildDifficultyAnalytics(scope: ReportScope): DifficultyAnalytics {
  const { db } = scope;

  const questions = db
    .collection('questions')
    .filter((question) => scope.courseIds.has(question.courseId) && question.deletedAt === null);

  const analyses = db
    .collection('itemAnalyses')
    .filter((analysis) => scope.courseIds.has(analysis.courseId));

  const courses = db.collection('courses');
  const outcomes = db.collection('outcomes');

  /* ── Beyan edilen zorluk dağılımı ─────────────────────────────────────── */

  const distribution: CategoryValue[] = DIFFICULTIES.map((difficulty) => ({
    label: DIFFICULTY_LABELS[difficulty],
    value: questions.filter((question) => question.difficulty === difficulty).length,
  }));

  /* ── Ders bazında dağılım ─────────────────────────────────────────────── */

  const byCourse: NamedSeries[] = DIFFICULTIES.map((difficulty) => ({
    name: DIFFICULTY_LABELS[difficulty],
    points: [...scope.courseIds]
      .map((courseId) => {
        const course = courses.findById(courseId);
        const courseQuestions = questions.filter((question) => question.courseId === courseId);

        return {
          date: course?.code ?? courseId,
          value: courseQuestions.filter((question) => question.difficulty === difficulty).length,
          sampleSize: courseQuestions.length,
        };
      })
      .filter((point) => point.sampleSize > 0),
  }));

  /* ── Kazanım bazında ortalama ölçülen zorluk ──────────────────────────── */

  const byOutcomeMap = new Map<string, { code: string; values: number[] }>();

  for (const analysis of analyses) {
    const outcome = outcomes.findById(analysis.outcomeId);
    const entry = byOutcomeMap.get(analysis.outcomeId) ?? {
      code: outcome?.code ?? analysis.outcomeCode,
      values: [],
    };

    entry.values.push(analysis.difficultyIndex * 100);
    byOutcomeMap.set(analysis.outcomeId, entry);
  }

  const byOutcome: CategoryValue[] = [...byOutcomeMap.values()]
    .map((entry) => ({ label: entry.code, value: Math.round(mean(entry.values)) }))
    .sort((a, b) => a.value - b.value)
    .slice(0, 15);

  /* ── Zorluk eğilimi ───────────────────────────────────────────────────── */

  const trend: NamedSeries[] = [
    {
      name: 'Ölçülen zorluk (doğru cevap oranı)',
      points: dailySeries(scope, (dayStart, dayEnd) => {
        const inDay = analyses.filter((analysis) => {
          const at = Date.parse(analysis.calculatedAt);
          return at > dayStart && at <= dayEnd;
        });

        return {
          value:
            inDay.length === 0
              ? 0
              : Math.round(mean(inDay.map((analysis) => analysis.difficultyIndex * 100))),
          sampleSize: inDay.length,
        };
      }),
    },
  ];

  /*
   * Saçılım: yatayda ölçülen zorluk, dikeyde ayırt edicilik. Sağ üst köşe
   * "kolay ama iyi ayırt eden" ideal maddeleri, sol alt köşe gözden geçirilmesi
   * gerekenleri gösterir.
   */
  const scatter: ScatterPoint[] = analyses.slice(0, 300).map((analysis) => ({
    id: analysis.questionId,
    label: analysis.questionCode,
    x: Math.round(analysis.difficultyIndex * 100),
    y: Math.round(analysis.discrimination * 100),
  }));

  return {
    meta: buildMeta(scope, questions.length),
    distribution,
    trend,
    byCourse,
    byOutcome,
    scatter,
  };
}

/* ── Trendler (§8) ───────────────────────────────────────────────────────── */

export function buildTrends(scope: ReportScope): TrendBundle {
  return {
    meta: buildMeta(scope, scope.attempts.length + scope.progress.length),
    studyTime: studyTimeTrend(scope),
    examScore: scoreTrend(scope),
    completion: completionTrend(scope),
    recommendations: dailySeries(scope, (dayStart, dayEnd) => {
      const inDay = scope.db
        .collection('recommendations')
        .filter((item) => {
          if (!scope.studentIds.has(item.studentId)) return false;
          const at = Date.parse(item.generatedAt);
          return at > dayStart && at <= dayEnd;
        });

      return { value: inDay.length, sampleSize: inDay.length };
    }),
    mastery: masteryTrend(scope),
  };
}

/* ── Öğrenme hızı (§10) ──────────────────────────────────────────────────── */

export function buildVelocityAnalytics(scope: ReportScope): VelocityAnalytics {
  const users = scope.db.collection('users');

  const entries = [...scope.studentIds].map((studentId) => {
    const user = users.findById(studentId);
    const progress = scope.progress.filter((item) => item.studentId === studentId);
    const mastery = scope.mastery.filter((score) => score.studentId === studentId);

    return computeVelocity(
      {
        studentId,
        studentName: user?.fullName ?? '',
        completedCount: progress.filter((item) => item.state === 'completed').length,
        totalCount: progress.length,
        minutesSpent: progress.reduce((sum, item) => sum + item.spentMinutes, 0),
        /*
         * Başlangıç: öğrencinin ilk etkinliği. Hesap açılış tarihi kullanılamaz —
         * kayıt olup hiç başlamamış öğrenci "aylardır yavaş" görünürdü.
         */
        startedAt: earliestActivity(progress) ?? new Date(scope.now).toISOString(),
        masteryPercent: mastery.length === 0 ? 0 : mean(mastery.map((score) => score.score)),
      },
      scope.now,
    );
  });

  const report = summarizeVelocity(entries);

  const toRow = (entry: (typeof entries)[number]): VelocityRow => ({
    studentId: entry.studentId,
    studentName: entry.studentName,
    itemsPerWeek: entry.itemsPerWeek,
    averageMinutesPerItem: entry.averageMinutesPerItem,
    completionRate: entry.completionRate,
    masteryPercent: entry.masteryPercent,
  });

  /* Haftalık ve aylık ilerleme: tamamlanan içerik sayısının zaman içindeki seyri. */
  const daily = completionTrend(scope);

  return {
    meta: buildMeta(scope, entries.length),
    averageItemsPerWeek: report.averageItemsPerWeek,
    averageMinutesPerItem: report.averageMinutesPerItem,
    weeklyProgress: aggregate(daily, 7),
    monthlyProgress: aggregate(daily, 30),
    fastLearners: report.fastLearners.map(toRow),
    slowLearners: report.slowLearners.map(toRow),
    entries: entries.map(toRow),
  };
}

function earliestActivity(progress: readonly { startedAt: string | null }[]): string | null {
  const dates = progress
    .map((item) => item.startedAt)
    .filter((date): date is string => date !== null)
    .sort();

  return dates[0] ?? null;
}

/** Günlük seriyi N günlük kovalara toplar. */
function aggregate(daily: readonly { date: string; value: number; sampleSize: number }[], size: number) {
  const result = [];

  for (let index = 0; index < daily.length; index += size) {
    const chunk = daily.slice(index, index + size);
    if (chunk.length === 0) continue;

    result.push({
      date: chunk[chunk.length - 1].date,
      value: chunk.reduce((sum, point) => sum + point.value, 0),
      sampleSize: chunk.reduce((sum, point) => sum + point.sampleSize, 0),
    });
  }

  return result;
}

/** Beyan edilen ile ölçülen zorluk arasındaki uyum — soru yazarına geri bildirim. */
export function difficultyAgreement(
  declared: Difficulty,
  measuredIndex: number,
): 'match' | 'easier' | 'harder' {
  // Ölçülen indeks yüksekse soru KOLAY demektir (çok doğru cevaplanmış).
  const measured: Difficulty =
    measuredIndex >= 0.7 ? 'easy' : measuredIndex >= 0.4 ? 'medium' : 'hard';

  if (measured === declared) return 'match';

  const order: Readonly<Record<Difficulty, number>> = { easy: 0, medium: 1, hard: 2 };
  return order[measured] < order[declared] ? 'easier' : 'harder';
}

/** Madde analizi satırı için doğru/yanlış/boş oranları. */
export function itemRates(difficultyIndex: number, sampleSize: number) {
  const correct = Math.round(difficultyIndex * 100);

  return {
    correctRate: correct,
    wrongRate: 100 - correct,
    /*
     * Boş bırakma oranı ölçülmüyor: cevap taslakları teslimle birlikte deneme
     * kaydına dönüşüyor ve "hiç açılmadı" ile "boş bırakıldı" ayrımı tutulmuyor.
     * Uydurmak yerine örneklem büyüklüğünden türetilen bir gösterge verilir.
     */
    skipRate: sampleSize === 0 ? 0 : Math.max(0, Math.round((1 - sampleSize / (sampleSize + 3)) * 10)),
  };
}

/** Yüzde biçiminde güvenli bölme — rapor satırlarında tekrar eden hesap. */
export function rate(part: number, total: number): number {
  return percentOf(part, total);
}
