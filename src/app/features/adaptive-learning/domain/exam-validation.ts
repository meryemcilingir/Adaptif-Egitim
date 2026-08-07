import { DIFFICULTIES, DIFFICULTY_LABELS, Difficulty } from '../models/common.model';
import { BlueprintOutcomeRow } from '../models/blueprint.model';
import {
  ConstraintSnapshot,
  EXAM_LIMITS,
  ValidationIssue,
  ValidationResult,
} from '../models/exam.model';
import { blueprintDifficultyCounts, blueprintTotalQuestions } from './blueprint.rules';

/**
 * Sınav doğrulama motoru (BR-04).
 *
 * Wizard'ın sağındaki kısıt paneli ve "Doğrulama" adımı AYNI fonksiyonu çağırır;
 * ayrıca mock sunucu yayına almadan önce bir kez daha çalıştırır. Üç yerde aynı
 * sonuç garanti edilir çünkü kural tek bir saf fonksiyonda yaşar.
 *
 * `error` → yayına alınamaz. `warning` → yayına alınabilir ama kullanıcı uyarılır.
 */

/** Doğrulama için gereken, ekrandan bağımsız girdi. */
export interface ExamValidationInput {
  readonly title: string;
  readonly durationMinutes: number;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly cohortIds: readonly string[];
  /** Sınavdaki sorular; zenginleştirilmiş hâliyle (zorluk ve kazanım gerekli). */
  readonly questions: readonly ExamQuestionFacts[];
  readonly blueprintRows: readonly BlueprintOutcomeRow[];
  /** Sınava bir blueprint bağlanmış mı — bağlanmadıysa yayına alınamaz. */
  readonly hasBlueprint: boolean;
  /** Bağlı blueprint YAYINDA mı — yalnızca yayındaki plan "uygun" sayılır. */
  readonly isBlueprintPublished: boolean;
  readonly targetTotalPoints: number;
  /** Aynı ders içindeki diğer sınav adları — benzersizlik kontrolü. */
  readonly siblingTitles: readonly string[];
}

/** Doğrulamanın bir sorudan ihtiyaç duyduğu asgari bilgi. */
export interface ExamQuestionFacts {
  readonly questionId: string;
  readonly points: number;
  readonly difficulty: string;
  readonly outcomeIds: readonly string[];
  readonly estimatedSolveTimeSeconds: number;
  readonly isPublished: boolean;
  /** Sınava bağlanan versiyon, sorunun güncel yayın versiyonu mu? */
  readonly isLatestVersion: boolean;
}

export function validateExam(input: ExamValidationInput): ValidationResult {
  const issues: ValidationIssue[] = [];

  const totalPoints = input.questions.reduce((sum, question) => sum + question.points, 0);
  const targetQuestions = blueprintTotalQuestions(input.blueprintRows);

  /* 1) Sınav boş olamaz. */
  if (input.questions.length === 0) {
    issues.push({
      rule: 'empty_exam',
      severity: 'error',
      message: 'Sınavda hiç soru yok. Otomatik seçim yapın veya elle soru ekleyin.',
      step: 'questions',
    });
  }

  /*
   * 1b) Sınav uygun bir blueprint'e bağlı olmalı — bu proje sözleşmesi
   * gereği sınavlar yalnızca Ölçme Uzmanı'nın YAYINDAKİ (onaylanmış) bir
   * planıyla oluşturulabilir; taslak hâlde bırakılabilir ama yayına alınamaz.
   */
  if (!input.hasBlueprint) {
    issues.push({
      rule: 'blueprint_required',
      severity: 'error',
      message: 'Sınav bir blueprint’e bağlı olmalıdır. Yayındaki bir blueprint seçin.',
      step: 'information',
    });
  } else if (!input.isBlueprintPublished) {
    issues.push({
      rule: 'blueprint_required',
      severity: 'error',
      message: 'Bağlı blueprint henüz yayında değil. Sınav yalnızca yayındaki (uygun) bir blueprint ile yayına alınabilir.',
      step: 'information',
    });
  }

  /* 2) Toplam puan blueprint hedefiyle uyuşmalı. */
  if (input.questions.length > 0 && totalPoints !== input.targetTotalPoints) {
    issues.push({
      rule: 'total_points',
      severity: 'error',
      message: `Toplam puan ${totalPoints}; blueprint hedefi ${input.targetTotalPoints}. Soru puanlarını veya hedefi düzeltin.`,
      step: 'questions',
    });
  }

  /* 3) Soru sayısı blueprint ile uyumlu olmalı. */
  if (targetQuestions > 0 && input.questions.length !== targetQuestions) {
    issues.push({
      rule: 'blueprint_match',
      severity: 'error',
      message: `Sınavda ${input.questions.length} soru var; blueprint ${targetQuestions} soru istiyor.`,
      step: 'questions',
    });
  }

  /* 4) Zorluk dağılımı blueprint ile uyumlu olmalı (uyarı seviyesinde). */
  const targetCounts = blueprintDifficultyCounts(input.blueprintRows);
  const actualCounts = countByDifficulty(input.questions);

  for (const difficulty of DIFFICULTIES) {
    if (targetCounts[difficulty] === actualCounts[difficulty]) continue;
    issues.push({
      rule: 'blueprint_match',
      severity: 'warning',
      message: `${DIFFICULTY_LABELS[difficulty]} soru sayısı ${actualCounts[difficulty]}; hedef ${targetCounts[difficulty]}.`,
      step: 'questions',
    });
  }

  /* 5) Blueprint'te soru istenen her kazanım sınavda temsil edilmeli. */
  const covered = new Set(input.questions.flatMap((question) => question.outcomeIds));
  const missing = input.blueprintRows
    .filter((row) => row.easy + row.medium + row.hard > 0)
    .filter((row) => !covered.has(row.outcomeId));

  if (missing.length > 0) {
    issues.push({
      rule: 'outcome_coverage',
      severity: 'error',
      message: `${missing.length} kazanım için blueprint soru istiyor ama sınavda o kazanımdan soru yok.`,
      step: 'questions',
    });
  }

  /* 6) Aynı soru iki kez eklenemez. */
  const duplicates = duplicateIds(input.questions);
  if (duplicates.length > 0) {
    issues.push({
      rule: 'duplicate_question',
      severity: 'error',
      message: `${duplicates.length} soru sınava birden fazla kez eklenmiş.`,
      step: 'questions',
    });
  }

  /* 7) Yayınlanmamış soru sınava alınamaz. */
  const unpublished = input.questions.filter((question) => !question.isPublished).length;
  if (unpublished > 0) {
    issues.push({
      rule: 'unpublished_question',
      severity: 'error',
      message: `${unpublished} soru yayında değil. Yalnızca yayındaki sorular sınava eklenebilir.`,
      step: 'questions',
    });
  }

  /* 8) Soru güncel versiyonundan eski bir anlık görüntüye bağlıysa uyarılır. */
  const stale = input.questions.filter((question) => !question.isLatestVersion).length;
  if (stale > 0) {
    issues.push({
      rule: 'stale_version',
      severity: 'warning',
      message: `${stale} soru daha eski bir versiyona bağlı. Güncel sürümü kullanmak için soruyu yeniden seçin.`,
      step: 'questions',
    });
  }

  /* 9) Süre pozitif ve sınırlar içinde olmalı. */
  if (
    !Number.isFinite(input.durationMinutes) ||
    input.durationMinutes < EXAM_LIMITS.durationMinutes.min ||
    input.durationMinutes > EXAM_LIMITS.durationMinutes.max
  ) {
    issues.push({
      rule: 'duration',
      severity: 'error',
      message: `Sınav süresi ${EXAM_LIMITS.durationMinutes.min}–${EXAM_LIMITS.durationMinutes.max} dakika arasında olmalıdır.`,
      step: 'information',
    });
  }

  /* 10) Tahmini çözüm süresi sınav süresini aşmamalı. */
  const estimatedMinutes = estimateMinutes(input.questions);
  if (input.questions.length > 0 && estimatedMinutes > input.durationMinutes) {
    issues.push({
      rule: 'duration',
      severity: 'warning',
      message: `Soruların tahmini çözüm süresi ${estimatedMinutes} dk; sınav süresi ${input.durationMinutes} dk.`,
      step: 'information',
    });
  }

  /* 11) Sınav adı benzersiz olmalı. */
  const title = input.title.trim().toLocaleLowerCase('tr-TR');
  if (title.length === 0) {
    issues.push({
      rule: 'unique_title',
      severity: 'error',
      message: 'Sınav adı zorunludur.',
      step: 'information',
    });
  } else if (
    input.siblingTitles.some((other) => other.trim().toLocaleLowerCase('tr-TR') === title)
  ) {
    issues.push({
      rule: 'unique_title',
      severity: 'error',
      message: 'Bu ders için aynı adda başka bir sınav var.',
      step: 'information',
    });
  }

  /* 12) En az bir cohort atanmalı. */
  if (input.cohortIds.length === 0) {
    issues.push({
      rule: 'cohort_required',
      severity: 'error',
      message: 'Sınav en az bir gruba atanmalıdır.',
      step: 'information',
    });
  }

  /* 13) Kapanış tarihi açılıştan sonra olmalı. */
  const opens = Date.parse(input.opensAt);
  const closes = Date.parse(input.closesAt);

  if (Number.isNaN(opens) || Number.isNaN(closes)) {
    issues.push({
      rule: 'schedule_window',
      severity: 'error',
      message: 'Sınav tarihleri geçersiz.',
      step: 'information',
    });
  } else if (closes <= opens) {
    issues.push({
      rule: 'schedule_window',
      severity: 'error',
      message: 'Kapanış tarihi açılış tarihinden sonra olmalıdır.',
      step: 'information',
    });
  } else if (closes - opens < input.durationMinutes * 60_000) {
    issues.push({
      rule: 'schedule_window',
      severity: 'warning',
      message: 'Sınav penceresi, sınav süresinden kısa. Öğrenciler sınavı tamamlayamayabilir.',
      step: 'information',
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;

  return {
    issues,
    errorCount,
    warningCount: issues.length - errorCount,
    publishReady: errorCount === 0 && input.questions.length > 0,
  };
}

/* ── Kısıt paneli anlık görüntüsü ────────────────────────────────────────── */

/**
 * Panelin gösterdiği her sayı buradan gelir.
 * Doğrulama sonucu da içeride üretilir; panel ile "Doğrulama" adımı asla
 * farklı şey söyleyemez.
 */
export function buildConstraintSnapshot(input: ExamValidationInput): ConstraintSnapshot {
  const targetCounts = blueprintDifficultyCounts(input.blueprintRows);
  const actualCounts = countByDifficulty(input.questions);
  const requestedOutcomes = input.blueprintRows.filter(
    (row) => row.easy + row.medium + row.hard > 0,
  );
  const covered = new Set(input.questions.flatMap((question) => question.outcomeIds));

  return {
    totalQuestions: input.questions.length,
    targetQuestions: blueprintTotalQuestions(input.blueprintRows),
    totalPoints: input.questions.reduce((sum, question) => sum + question.points, 0),
    targetPoints: input.targetTotalPoints,
    durationMinutes: input.durationMinutes,
    estimatedMinutes: estimateMinutes(input.questions),
    difficulty: DIFFICULTIES.map((difficulty) => ({
      difficulty,
      label: DIFFICULTY_LABELS[difficulty],
      count: actualCounts[difficulty],
      target: targetCounts[difficulty],
    })),
    coveredOutcomes: requestedOutcomes.filter((row) => covered.has(row.outcomeId)).length,
    targetOutcomes: requestedOutcomes.length,
    duplicateCount: duplicateIds(input.questions).length,
    validation: validateExam(input),
  };
}

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function countByDifficulty(
  questions: readonly ExamQuestionFacts[],
): Readonly<Record<Difficulty, number>> {
  return {
    easy: questions.filter((question) => question.difficulty === 'easy').length,
    medium: questions.filter((question) => question.difficulty === 'medium').length,
    hard: questions.filter((question) => question.difficulty === 'hard').length,
  };
}

/** Birden fazla kez eklenmiş soru kimlikleri. */
function duplicateIds(questions: readonly ExamQuestionFacts[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const question of questions) {
    if (seen.has(question.questionId)) duplicates.add(question.questionId);
    else seen.add(question.questionId);
  }

  return [...duplicates];
}

function estimateMinutes(questions: readonly ExamQuestionFacts[]): number {
  const seconds = questions.reduce(
    (sum, question) => sum + question.estimatedSolveTimeSeconds,
    0,
  );
  return Math.round(seconds / 60);
}
