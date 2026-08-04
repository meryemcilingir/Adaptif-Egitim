import {
  AnswerDraft,
  AnswerValue,
  SESSION_TRANSITIONS,
  SessionState,
  SubmitSummary,
  WaitingPhase,
  isAnswered,
} from '../models/exam-session.model';
import { Exam } from '../models/exam.model';

/**
 * Oturum kuralları (BR-06, BR-08, BR-47, BR-48).
 *
 * Saf fonksiyonlardır: mock sunucu ve istemci AYNI kuralları çalıştırır, bu
 * yüzden "ekran izin verdi ama sunucu reddetti" durumu oluşmaz.
 */

/* ── Bekleme odası ───────────────────────────────────────────────────────── */

/**
 * Öğrencinin sınava göre hangi aşamada olduğunu belirler.
 *
 * Sıra ÖNEMLİ: hak tükenmesi zaman kontrolünden ÖNCE gelir, çünkü hakkı bitmiş
 * öğrenciye "sınav başladı" demek yanıltıcı olurdu. Yarım kalmış bir oturum
 * varsa (`hasResumable`) hak kontrolü atlanır — devam etmek yeni bir hak
 * kullanmak değildir.
 */
export function waitingPhase(
  exam: Exam,
  serverNowMs: number,
  usedAttempts: number,
  hasResumable: boolean,
): WaitingPhase {
  const opensAt = Date.parse(exam.opensAt);
  const closesAt = Date.parse(exam.closesAt);

  if (hasResumable) return serverNowMs >= closesAt ? 'closed' : 'in_progress';
  if (serverNowMs < opensAt) return 'too_early';
  if (serverNowMs >= closesAt) return 'closed';
  if (usedAttempts >= exam.rules.maxAttempts) return 'used';

  return 'ready';
}

export const WAITING_PHASE_MESSAGES: Readonly<Record<WaitingPhase, string>> = {
  too_early: 'Sınav henüz başlamadı. Başlama saatinde bu sayfa kendiliğinden güncellenecek.',
  ready: 'Sınav başladı. Hazır olduğunuzda başlayabilirsiniz.',
  in_progress: 'Devam eden bir oturumunuz var. Kaldığınız yerden sürdürebilirsiniz.',
  closed: 'Sınav süresi doldu; bu sınava artık giriş yapılamaz.',
  used: 'Bu sınav için deneme hakkınız doldu.',
};

/** Sınava girilebilir mi? Bekleme odasındaki düğmenin tek kaynağı. */
export function canEnter(phase: WaitingPhase): boolean {
  return phase === 'ready' || phase === 'in_progress';
}

/**
 * Oturumun bitiş anı.
 *
 * Sınav süresi ile sınavın kapanış saatinden HANGİSİ ÖNCE geliyorsa o geçerlidir:
 * kapanışa 10 dakika kala başlayan öğrenci 60 dakikalık süre kazanamaz.
 */
export function sessionExpiry(exam: Exam, startedAtMs: number): number {
  const byDuration = startedAtMs + exam.durationMinutes * 60_000;
  const byWindow = Date.parse(exam.closesAt);
  return Math.min(byDuration, byWindow);
}

/* ── Durum makinesi ──────────────────────────────────────────────────────── */

export function canTransition(from: SessionState, to: SessionState): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}

/** Oturum cevap kabul edecek durumda mı? */
export function acceptsAnswers(state: SessionState): boolean {
  return state === 'IN_PROGRESS' || state === 'PAUSED';
}

/** Oturum kapanmış mı? Kapanan oturuma ikinci kez teslim yapılamaz (BR-48). */
export function isClosed(state: SessionState): boolean {
  return state === 'SUBMITTED' || state === 'EXPIRED' || state === 'TERMINATED';
}

/**
 * Cevap kabul edilebilir mi (BR-08)?
 *
 * Sürenin dolmasıyla cevabın gönderilmesi arasında ağ gecikmesi olabileceği için
 * küçük bir tolerans tanınır: öğrenci son saniyede işaretlediği cevabı ağ
 * yavaşlığı yüzünden kaybetmemelidir. Tolerans kasıtlı olarak kısadır.
 */
export const LATE_ANSWER_TOLERANCE_MS = 5_000;

export function acceptsAnswerAt(
  state: SessionState,
  expiresAtIso: string,
  answeredAtMs: number,
): boolean {
  if (!acceptsAnswers(state)) return false;
  return answeredAtMs <= Date.parse(expiresAtIso) + LATE_ANSWER_TOLERANCE_MS;
}

/* ── Navigasyon ──────────────────────────────────────────────────────────── */

export const NAVIGATOR_STATES = [
  'not_visited',
  'visited',
  'answered',
  'flagged',
  'current',
] as const;
export type NavigatorState = (typeof NAVIGATOR_STATES)[number];

export const NAVIGATOR_LABELS: Readonly<Record<NavigatorState, string>> = {
  not_visited: 'Görülmedi',
  visited: 'Görüldü, boş',
  answered: 'Cevaplandı',
  flagged: 'İşaretlendi',
  current: 'Şu anki soru',
};

/**
 * Bir sorunun navigatördeki durumu.
 *
 * Öncelik sırası kasıtlı: ŞU ANKİ soru her şeyin üstündedir (kullanıcı nerede
 * olduğunu kaybetmemeli), sonra İŞARETLİ gelir (öğrenci oraya dönmek için
 * işaretledi; cevaplamış olması bu niyeti geçersiz kılmaz), sonra cevaplanmış,
 * en sonda görülmüş/görülmemiş.
 */
export function navigatorStateOf(input: {
  readonly questionId: string;
  readonly currentQuestionId: string | null;
  readonly flagged: ReadonlySet<string>;
  readonly visited: ReadonlySet<string>;
  readonly answeredIds: ReadonlySet<string>;
}): NavigatorState {
  if (input.questionId === input.currentQuestionId) return 'current';
  if (input.flagged.has(input.questionId)) return 'flagged';
  if (input.answeredIds.has(input.questionId)) return 'answered';
  if (input.visited.has(input.questionId)) return 'visited';
  return 'not_visited';
}

/** Cevabı dolu olan soru kimlikleri. */
export function answeredIdsOf(drafts: readonly AnswerDraft[]): Set<string> {
  return new Set(drafts.filter((draft) => isAnswered(draft.value)).map((draft) => draft.questionId));
}

/* ── Teslim özeti ────────────────────────────────────────────────────────── */

/**
 * Gönder ekranındaki özet.
 *
 * Boş ve işaretli soruların NUMARALARI da döner: "3 soru boş" demek yerine
 * "4, 7 ve 11 numaralı sorular boş" demek, öğrencinin geri dönmesini sağlar.
 */
export function buildSubmitSummary(
  questionIds: readonly string[],
  drafts: readonly AnswerDraft[],
  flagged: ReadonlySet<string>,
): SubmitSummary {
  const answered = answeredIdsOf(drafts);

  const unansweredNumbers: number[] = [];
  const flaggedNumbers: number[] = [];

  questionIds.forEach((questionId, index) => {
    const number = index + 1;
    if (!answered.has(questionId)) unansweredNumbers.push(number);
    if (flagged.has(questionId)) flaggedNumbers.push(number);
  });

  return {
    totalQuestions: questionIds.length,
    answered: questionIds.filter((id) => answered.has(id)).length,
    unanswered: unansweredNumbers.length,
    flagged: flaggedNumbers.length,
    unansweredNumbers,
    flaggedNumbers,
  };
}

/* ── Cevap karşılaştırma ─────────────────────────────────────────────────── */

/**
 * İki cevap değeri anlamca aynı mı?
 *
 * Autosave'i gereksiz tetiklememek için kullanılır: kullanıcı bir seçeneği
 * işaretleyip geri aldığında sunucuya istek gitmemelidir. Seçim ve eşleştirme
 * sıraya duyarlı DEĞİLDİR; sıralama sorusu ise doğası gereği sıraya duyarlıdır.
 */
export function sameAnswer(a: AnswerValue, b: AnswerValue): boolean {
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case 'choice':
      return sameSet(a.optionIds, (b as typeof a).optionIds);
    case 'boolean':
      return a.value === (b as typeof a).value;
    case 'numeric':
      return a.value === (b as typeof a).value;
    case 'text':
      return a.value === (b as typeof a).value;
    case 'pairs': {
      const other = (b as typeof a).pairs;
      if (a.pairs.length !== other.length) return false;
      const map = new Map(other.map((pair) => [pair.leftId, pair.rightId]));
      return a.pairs.every((pair) => map.get(pair.leftId) === pair.rightId);
    }
    case 'sequence': {
      const other = (b as typeof a).itemIds;
      return a.itemIds.length === other.length && a.itemIds.every((id, i) => id === other[i]);
    }
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((item) => set.has(item));
}
