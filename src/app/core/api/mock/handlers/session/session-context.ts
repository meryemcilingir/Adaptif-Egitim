import {
  AnswerDraft,
  AnswerValue,
  ExamSession,
  SessionMatchView,
  SessionOptionView,
  SessionQuestionView,
  SessionTimelineEvent,
  TimelineKind,
} from '../../../../../features/adaptive-learning/models/exam-session.model';
import { Exam } from '../../../../../features/adaptive-learning/models/exam.model';
import {
  QUESTION_TYPE_META,
  Question,
} from '../../../../../features/adaptive-learning/models/question.model';
import { FakeDb } from '../../db/fake-db';

/**
 * Oturum uçlarının ortak veri derleyicisi.
 *
 * Buradaki tek kritik sorumluluk: öğrenciye giden soru gövdesinden DOĞRU CEVAP
 * bilgisinin ayıklanması. `Question` üzerinde `options[].correct`, `rationale`,
 * `expectedAnswer`, `matchPairs[].right` ve `sequenceItems[].order` alanları
 * vardır; hiçbiri sınav ekranına gönderilmez (BR-47). Ayıklama tek bir yerde
 * yapılır ki yeni bir uç eklendiğinde unutulmasın.
 */

/** Soru türünden cevap değerinin biçimini türetir (ADR-034 ile aynı kayıt tablosu). */
export function answerKindOf(question: Question): AnswerValue['kind'] {
  switch (QUESTION_TYPE_META[question.type].answerShape) {
    case 'options':
      return question.type === 'true_false' ? 'boolean' : 'choice';
    case 'numeric':
      return 'numeric';
    case 'pairs':
      return 'pairs';
    case 'sequence':
      return 'sequence';
    case 'text':
    case 'manual':
      return 'text';
  }
}

/**
 * Sınav ekranı için soru görünümü üretir.
 *
 * Seçenek ve öğe sırası `shuffleOptions` ayarına göre öğrenciye ÖZEL biçimde
 * karıştırılır: aynı öğrenci sayfayı yenilediğinde aynı sırayı görsün diye
 * karıştırma tohumu oturum jetonundan türetilir, rastgele değildir.
 */
export function buildQuestionViews(
  db: FakeDb,
  exam: Exam,
  seed: string,
): SessionQuestionView[] {
  const questions = db.collection('questions');
  const views: SessionQuestionView[] = [];

  exam.questions.forEach((ref, index) => {
    const question = questions.findById(ref.questionId);
    if (!question) return;

    const meta = QUESTION_TYPE_META[question.type];
    const shuffle = exam.rules.shuffleOptions;

    const options: SessionOptionView[] = question.options.map((option) => ({
      id: option.id,
      text: option.text,
    }));

    const matchPairs: SessionMatchView[] = question.matchPairs.map((pair) => ({
      id: pair.id,
      left: pair.left,
      // Sağ taraf HER ZAMAN karıştırılır; sıralı verilmesi cevabı ele verirdi.
      rightChoices: stableShuffle(
        question.matchPairs.map((item) => ({ id: item.id, text: item.right })),
        `${seed}:${question.id}:right`,
      ),
    }));

    views.push({
      questionId: question.id,
      order: ref.order || index + 1,
      title: question.title,
      stem: question.stem,
      type: question.type,
      typeLabel: meta.label,
      answerKind: answerKindOf(question),
      points: ref.points,
      options: shuffle ? stableShuffle(options, `${seed}:${question.id}`) : options,
      matchPairs,
      sequenceItems: stableShuffle(
        question.sequenceItems.map((item) => ({ id: item.id, text: item.text })),
        `${seed}:${question.id}:seq`,
      ),
      attachments: question.attachments,
      multipleCorrect: meta.multipleCorrect,
      numericTolerance: question.numericTolerance,
    });
  });

  return views.sort((a, b) => a.order - b.order);
}

/**
 * Tohumdan türetilen kararlı karıştırma.
 *
 * `Math.random` kullanılamaz: her istekte farklı sıra üretir ve öğrenci sayfayı
 * yenilediğinde seçenekler yerinden oynardı. Aynı tohum her zaman aynı sırayı verir.
 */
export function stableShuffle<T>(items: readonly T[], seed: string): T[] {
  const result = [...items];
  let hash = hashString(seed);

  for (let i = result.length - 1; i > 0; i--) {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    const j = hash % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = (hash * 16777619) & 0x7fffffff;
  }
  return hash;
}

/* ── Zaman çizelgesi ─────────────────────────────────────────────────────── */

let eventCounter = 0;

export function timelineEvent(
  kind: TimelineKind,
  atMs: number,
  questionId: string | null,
  detail: string,
): SessionTimelineEvent {
  eventCounter += 1;
  return {
    id: `evt_${atMs.toString(36)}_${eventCounter}`,
    kind,
    at: new Date(atMs).toISOString(),
    questionId,
    detail,
  };
}

/**
 * Zaman çizelgesine olay ekler.
 *
 * Autosave olayları çok sık üretilir; ard arda gelen aynı türden kayıtlar
 * çizelgeyi okunmaz hâle getirirdi. Bu yüzden son olay da autosave ise yenisi
 * eklenmez, mevcut kaydın zamanı ve açıklaması güncellenir.
 */
export function appendEvent(
  timeline: readonly SessionTimelineEvent[],
  next: SessionTimelineEvent,
): SessionTimelineEvent[] {
  const last = timeline[timeline.length - 1];

  if (last && last.kind === 'autosave' && next.kind === 'autosave') {
    return [...timeline.slice(0, -1), { ...next, id: last.id }];
  }

  return [...timeline, next];
}

/* ── Cevap taslakları ────────────────────────────────────────────────────── */

export function draftsOf(db: FakeDb, token: string): AnswerDraft[] {
  return db.collection('answerDrafts').filter((draft) => draft.sessionToken === token);
}

export function lastSavedAt(drafts: readonly AnswerDraft[]): string | null {
  const saved = drafts
    .map((draft) => draft.savedAt)
    .filter((value): value is string => value !== null)
    .sort();

  return saved[saved.length - 1] ?? null;
}

/** Öğrencinin bu sınav için kullandığı deneme sayısı. */
export function usedAttemptCount(db: FakeDb, examId: string, studentId: string): number {
  return db
    .collection('attempts')
    .filter((attempt) => attempt.examId === examId && attempt.studentId === studentId).length;
}

/** Öğrencinin bu sınavda yarım kalmış oturumu (varsa). */
export function resumableSession(
  db: FakeDb,
  examId: string,
  studentId: string,
): ExamSession | null {
  return (
    db
      .collection('sessions')
      .filter(
        (session) =>
          session.examId === examId &&
          session.studentId === studentId &&
          (session.state === 'IN_PROGRESS' || session.state === 'PAUSED'),
      )
      .at(0) ?? null
  );
}
