import { Difficulty } from '../models/common.model';
import { BlueprintOutcomeRow } from '../models/blueprint.model';
import { ExamQuestionRef } from '../models/exam.model';
import { Question } from '../models/question.model';

/**
 * Blueprint'e göre otomatik soru seçimi (BR-05).
 *
 * Kurallar:
 *  · Yalnızca **yayındaki** sorular seçilir.
 *  · Soru, satırın kazanımına bağlı olmalıdır.
 *  · Zorluk hücresi neyi istiyorsa o zorlukta soru seçilir.
 *  · Aynı soru bir sınavda İKİ KEZ kullanılamaz.
 *  · Sınavda hâlihazırda bulunan sorular korunur; motor yalnızca eksiği tamamlar.
 *
 * Seçim DETERMİNİSTİKTİR: aynı girdi her zaman aynı sınavı üretir. Rastgelelik
 * yerine sıralama ölçütü kullanılır (az kullanılmış → düşük kod), böylece banka
 * dengeli tüketilir ve sonuç test edilebilir kalır.
 *
 * Saf fonksiyon — Angular/HTTP bağımlılığı yoktur.
 */

export interface SelectionInput {
  readonly rows: readonly BlueprintOutcomeRow[];
  readonly questions: readonly Question[];
  /** Kullanıcının elle eklediği ve korunacak sorular. */
  readonly existing: readonly ExamQuestionRef[];
  /** Soru kimliği → yayınlanmış versiyon kimliği. */
  readonly versionIdByQuestion: ReadonlyMap<string, { id: string; versionNumber: number }>;
}

export interface SelectionShortfall {
  readonly outcomeId: string;
  readonly difficulty: Difficulty;
  readonly requested: number;
  readonly found: number;
}

export interface SelectionResult {
  readonly questions: readonly ExamQuestionRef[];
  /** Bankada yeterli soru bulunamayan hücreler — kullanıcı uyarılır. */
  readonly shortfalls: readonly SelectionShortfall[];
  readonly addedCount: number;
}

const DIFFICULTY_KEYS: readonly (readonly [Difficulty, keyof BlueprintOutcomeRow])[] = [
  ['easy', 'easy'],
  ['medium', 'medium'],
  ['hard', 'hard'],
];

export function selectQuestions(input: SelectionInput): SelectionResult {
  const used = new Set(input.existing.map((ref) => ref.questionId));
  const selected: ExamQuestionRef[] = [...input.existing];
  const shortfalls: SelectionShortfall[] = [];

  /*
   * Bir soru YALNIZCA BİR hücreye sayılır.
   *
   * Bir soru birden fazla kazanıma bağlı olabilir; onu iki hücreye birden saymak
   * "aynı soru iki kez eklenemez" kuralıyla birleşince sınavın soru sayısını
   * blueprint toplamının altına düşürür ve doğrulama motoru haklı olarak hata
   * verir. Bu yüzden her soru bir hücreye kilitlenir.
   */
  const assigned = new Set<string>();

  // Yayında olmayan veya versiyon anlık görüntüsü bulunmayan soru aday değildir.
  const eligible = input.questions.filter(
    (question) =>
      question.state === 'PUBLISHED' &&
      question.deletedAt === null &&
      input.versionIdByQuestion.has(question.id),
  );

  for (const row of input.rows) {
    for (const [difficulty, key] of DIFFICULTY_KEYS) {
      const requested = Number(row[key] ?? 0);
      if (requested <= 0) continue;

      /*
       * Sınavda zaten bulunan ve HENÜZ başka bir hücreye sayılmamış sorular
       * önce bu hücreye sayılır — kullanıcının elle eklediği sorular boşa gitmesin.
       */
      const counted = selected
        .filter(
          (ref) =>
            !assigned.has(ref.questionId) &&
            matches(eligible, ref.questionId, row.outcomeId, difficulty),
        )
        .slice(0, requested);

      for (const ref of counted) assigned.add(ref.questionId);

      const missing = requested - counted.length;
      if (missing <= 0) continue;

      const candidates = eligible
        .filter(
          (question) =>
            !used.has(question.id) &&
            question.difficulty === difficulty &&
            question.outcomeIds.includes(row.outcomeId),
        )
        .sort(byPreference);

      const picked = candidates.slice(0, missing);
      for (const question of picked) {
        const version = input.versionIdByQuestion.get(question.id)!;
        used.add(question.id);
        assigned.add(question.id);
        selected.push({
          questionId: question.id,
          questionVersionId: version.id,
          versionNumber: version.versionNumber,
          order: selected.length + 1,
          points: question.points,
        });
      }

      if (picked.length < missing) {
        shortfalls.push({
          outcomeId: row.outcomeId,
          difficulty,
          requested,
          found: counted.length + picked.length,
        });
      }
    }
  }

  return {
    questions: renumber(selected),
    shortfalls,
    addedCount: selected.length - input.existing.length,
  };
}

/**
 * Sıralama ölçütü: önce az kullanılmış soru (banka dengeli tüketilsin),
 * eşitlikte kod sırası (sonuç deterministik olsun).
 */
function byPreference(a: Question, b: Question): number {
  if (a.usageCount !== b.usageCount) return a.usageCount - b.usageCount;
  return a.code.localeCompare(b.code, 'tr-TR');
}

function matches(
  questions: readonly Question[],
  questionId: string,
  outcomeId: string,
  difficulty: Difficulty,
): boolean {
  const question = questions.find((item) => item.id === questionId);
  return (
    question !== undefined &&
    question.difficulty === difficulty &&
    question.outcomeIds.includes(outcomeId)
  );
}

/** Sıra numaralarını 1..n olarak yeniden yazar. */
export function renumber(questions: readonly ExamQuestionRef[]): ExamQuestionRef[] {
  return questions.map((ref, index) => ({ ...ref, order: index + 1 }));
}

/** Sınav toplam puanı — soruların puanlarının toplamı. */
export function totalPointsOf(questions: readonly ExamQuestionRef[]): number {
  return questions.reduce((sum, ref) => sum + ref.points, 0);
}
