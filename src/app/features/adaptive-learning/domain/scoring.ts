import { AnswerValue } from '../models/exam-session.model';
import { Question, QUESTION_TYPE_META } from '../models/question.model';

/**
 * Objektif puanlama (BR-11).
 *
 * Kural: puan HER ZAMAN sorunun kendi tanımından hesaplanır — istemciden gelen
 * hiçbir "doğru mu" bilgisine güvenilmez. Elle puanlanan türler (`manuallyGraded`)
 * burada 0 puanla ve `graded: false` ile döner; nihai puanı değerlendirici verir.
 *
 * Saf fonksiyonlardır; mock sunucu teslim anında bunu çalıştırır, ekranlar da
 * aynı fonksiyonla önizleme yapabilir.
 */

export interface ScoreResult {
  readonly awardedPoints: number;
  readonly correct: boolean | null;
  /** Otomatik puanlanabildi mi? Elle puanlananlarda false. */
  readonly graded: boolean;
  /** Kısmi puan uygulandıysa true — arayüzde ayrıca belirtilir. */
  readonly partial: boolean;
}

const NOT_GRADED: ScoreResult = {
  awardedPoints: 0,
  correct: null,
  graded: false,
  partial: false,
};

/**
 * Bir cevabı puanlar.
 *
 * Cevap ile sorunun türü uyuşmuyorsa (bozuk veri veya elle düzenlenmiş istek)
 * puan verilmez; sessizce 0 yazmak yerine `graded: false` dönerek durumu
 * değerlendiriciye taşır.
 */
export function scoreAnswer(question: Question, value: AnswerValue | null): ScoreResult {
  const meta = QUESTION_TYPE_META[question.type];
  if (meta.manuallyGraded) return NOT_GRADED;
  if (value === null) return { ...NOT_GRADED, graded: true, correct: false };

  return scoreByShape(question, value);
}

/**
 * Değerlendiriciye ÖNERİ puanı üretir.
 *
 * Kısa cevap gibi türler kayıt tablosunda "elle puanlanır" işaretlidir, çünkü
 * serbest metinde eşdeğer yazımları makine güvenilir biçimde ayıramaz. Yine de
 * sorunun `expectedAnswer` alanı doluysa bir karşılaştırma yapılabilir; bu
 * sonuç ÖNERİ olarak gösterilir, otomatik uygulanmaz. Kararı insan verir.
 */
export function suggestScore(question: Question, value: AnswerValue | null): ScoreResult | null {
  const meta = QUESTION_TYPE_META[question.type];
  if (!meta.manuallyGraded || value === null) return null;

  const suggestion = scoreByShape(question, value);
  return suggestion.graded ? suggestion : null;
}

function scoreByShape(question: Question, value: AnswerValue): ScoreResult {
  switch (QUESTION_TYPE_META[question.type].answerShape) {
    case 'options':
      return value.kind === 'choice'
        ? scoreOptions(question, value.optionIds)
        : value.kind === 'boolean'
          ? scoreBoolean(question, value.value)
          : NOT_GRADED;
    case 'numeric':
      return value.kind === 'numeric' ? scoreNumeric(question, value.value) : NOT_GRADED;
    case 'text':
      return value.kind === 'text' ? scoreText(question, value.value) : NOT_GRADED;
    case 'pairs':
      return value.kind === 'pairs' ? scorePairs(question, value.pairs) : NOT_GRADED;
    case 'sequence':
      return value.kind === 'sequence' ? scoreSequence(question, value.itemIds) : NOT_GRADED;
    case 'manual':
      return NOT_GRADED;
  }
}

/* ── Tür bazlı puanlayıcılar ─────────────────────────────────────────────── */

/**
 * Çoktan seçmeli ve çoklu seçim.
 *
 * Çoklu seçimde kısmi puan sorunun `allowPartialCredit` bayrağına bağlıdır:
 * açıksa (doğru işaretlenen − yanlış işaretlenen) / toplam doğru oranı uygulanır,
 * kapalıysa cevap ya tam doğrudur ya sıfırdır. Yanlış işaretlemeyi düşmek şart:
 * aksi hâlde öğrenci tüm seçenekleri işaretleyip tam puan alırdı.
 */
function scoreOptions(question: Question, selectedIds: readonly string[]): ScoreResult {
  const correctIds = new Set(
    question.options.filter((option) => option.correct).map((option) => option.id),
  );
  if (correctIds.size === 0) return NOT_GRADED;

  const selected = new Set(selectedIds);
  const hits = [...selected].filter((id) => correctIds.has(id)).length;
  const misses = selected.size - hits;
  const isExact = hits === correctIds.size && misses === 0;

  if (isExact) {
    return { awardedPoints: question.points, correct: true, graded: true, partial: false };
  }

  if (!question.allowPartialCredit) {
    return { awardedPoints: 0, correct: false, graded: true, partial: false };
  }

  const ratio = Math.max(0, (hits - misses) / correctIds.size);
  const points = round2(question.points * ratio);

  return {
    awardedPoints: points,
    correct: false,
    graded: true,
    partial: points > 0,
  };
}

function scoreBoolean(question: Question, value: boolean | null): ScoreResult {
  if (value === null) return { ...NOT_GRADED, graded: true, correct: false };

  // Doğru/yanlış sorusunda doğru cevap, "correct" işaretli seçeneğin metnidir.
  const correctOption = question.options.find((option) => option.correct);
  if (!correctOption) return NOT_GRADED;

  const expected = parseBoolean(correctOption.text);
  if (expected === null) return NOT_GRADED;

  const isCorrect = expected === value;
  return {
    awardedPoints: isCorrect ? question.points : 0,
    correct: isCorrect,
    graded: true,
    partial: false,
  };
}

/** Sayısal cevap; `numericTolerance` kadar sapmaya izin verilir. */
function scoreNumeric(question: Question, value: number | null): ScoreResult {
  if (value === null) return { ...NOT_GRADED, graded: true, correct: false };

  const expected = Number(question.expectedAnswer);
  if (question.expectedAnswer === null || Number.isNaN(expected)) return NOT_GRADED;

  const tolerance = Math.abs(question.numericTolerance ?? 0);
  const isCorrect = Math.abs(value - expected) <= tolerance;

  return {
    awardedPoints: isCorrect ? question.points : 0,
    correct: isCorrect,
    graded: true,
    partial: false,
  };
}

/**
 * Kısa cevap.
 *
 * Karşılaştırma Türkçe yerel ayarıyla küçültülür ve fazla boşluklar sadeleşir;
 * "İSTANBUL" ile "istanbul" aynı sayılır. Beklenen cevap `|` ile ayrılarak
 * birden çok kabul edilebilir yazım verilebilir.
 */
function scoreText(question: Question, value: string): ScoreResult {
  if (question.expectedAnswer === null) return NOT_GRADED;

  const accepted = question.expectedAnswer.split('|').map(normalizeText).filter(Boolean);
  if (accepted.length === 0) return NOT_GRADED;

  const isCorrect = accepted.includes(normalizeText(value));

  return {
    awardedPoints: isCorrect ? question.points : 0,
    correct: isCorrect,
    graded: true,
    partial: false,
  };
}

/** Eşleştirme: her doğru bağ orantılı puan getirir (doğası gereği kısmi). */
function scorePairs(
  question: Question,
  pairs: readonly { leftId: string; rightId: string }[],
): ScoreResult {
  const expected = question.matchPairs;
  if (expected.length === 0) return NOT_GRADED;

  const answerByLeft = new Map(pairs.map((pair) => [pair.leftId, pair.rightId]));
  const hits = expected.filter((pair) => answerByLeft.get(pair.id) === pair.id).length;

  return ratioResult(question, hits, expected.length);
}

/**
 * Sıralama: doğru konumdaki öğe sayısı oranlanır.
 *
 * "Tam sıra doğru olmalı" kuralı, tek bir kaydırmada tüm puanı sıfırlayacağı
 * için ölçme açısından bilgi kaybettirir; konum bazlı oran daha ayırt edicidir.
 */
function scoreSequence(question: Question, itemIds: readonly string[]): ScoreResult {
  const expected = [...question.sequenceItems].sort((a, b) => a.order - b.order);
  if (expected.length === 0) return NOT_GRADED;

  const hits = expected.filter((item, index) => itemIds[index] === item.id).length;
  return ratioResult(question, hits, expected.length);
}

function ratioResult(question: Question, hits: number, total: number): ScoreResult {
  if (hits === total) {
    return { awardedPoints: question.points, correct: true, graded: true, partial: false };
  }

  if (!question.allowPartialCredit) {
    return { awardedPoints: 0, correct: false, graded: true, partial: false };
  }

  const points = round2((question.points * hits) / total);
  return { awardedPoints: points, correct: false, graded: true, partial: points > 0 };
}

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

export function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

function parseBoolean(text: string): boolean | null {
  const normalized = normalizeText(text);
  if (['doğru', 'dogru', 'true', 'evet'].includes(normalized)) return true;
  if (['yanlış', 'yanlis', 'false', 'hayır', 'hayir'].includes(normalized)) return false;
  return null;
}

/** Kısmi puanlar 0.25'lik adımlara yuvarlanmaz; iki ondalık yeterli ve şeffaftır. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
