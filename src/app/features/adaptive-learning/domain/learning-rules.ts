/**
 * Adaptif öğrenmenin ortak eşikleri ve kilit kuralları.
 *
 * Hem öneri motoru hem öğrenme yolu üreteci bu modülü kullanır; "bir kazanım
 * ne zaman açılır?" sorusunun TEK cevabı burada durur (BR-20, LP-02).
 * Saf fonksiyonlardır — Angular ve HTTP bağımlılığı yoktur.
 */

export const LEARNING_THRESHOLDS = {
  /** Bu skorun altında öğrenci konuyu henüz kavramamış sayılır → anlatım içeriği. */
  lowMastery: 40,
  /** Bu skora kadar pekiştirme aşamasıdır → ölçme içeriği. */
  midMastery: 70,
  /** Bu skorun üstünde kazanım tamamlanmış sayılır → sonraki kazanıma geçilebilir. */
  highMastery: 80,
  /** Önkoşulun açılmış sayılması için gereken asgari ustalık. */
  unlockMastery: 60,
  /** Bu gün sayısından uzun süre çalışılmayan kazanım tekrar gerektirir. */
  staleDays: 7,
  /** Bu yüzdenin altındaki değerlendirme sonucu başarısız sayılır. */
  failingScore: 50,
} as const;

export type MasteryBandKey = 'critical' | 'developing' | 'proficient' | 'mastered';

/** Ustalık skorunu öneri kuralının kullandığı banda çevirir. */
export function masteryBand(score: number | null): MasteryBandKey {
  if (score === null) return 'critical';
  if (score < LEARNING_THRESHOLDS.lowMastery) return 'critical';
  if (score <= LEARNING_THRESHOLDS.midMastery) return 'developing';
  if (score < LEARNING_THRESHOLDS.highMastery) return 'proficient';
  return 'mastered';
}

/** Kazanım → önkoşul kazanım kimlikleri. */
export type PrerequisiteMap = ReadonlyMap<string, readonly string[]>;
/** Kazanım → ustalık skoru (ölçüm yoksa kayıt bulunmaz). */
export type MasteryMap = ReadonlyMap<string, number>;

export interface UnlockResult {
  readonly unlocked: boolean;
  /** Kilitliyse eksik kalan önkoşul kazanımları. */
  readonly missingOutcomeIds: readonly string[];
}

/**
 * Bir kazanım çalışılabilir mi?
 *
 * Kural (BR-20): tüm doğrudan önkoşulların ustalık skoru `unlockMastery` eşiğini
 * geçmiş olmalıdır. Ölçümü olmayan önkoşul "tamamlanmamış" sayılır — aksi hâlde
 * hiç çalışılmamış bir konu yanlışlıkla açık görünürdü.
 *
 * İstisna: öğrenci KAZANIMIN KENDİSİNDE eşiği zaten geçmişse kazanım açıktır.
 * Yeterliliğini göstermiş bir konuyu önkoşul gerekçesiyle kilitlemek, arayüzde
 * "ustalık %61 ama kilitli" gibi kendisiyle çelişen bir durum üretirdi.
 */
export function evaluateUnlock(
  outcomeId: string,
  prerequisites: PrerequisiteMap,
  mastery: MasteryMap,
): UnlockResult {
  if ((mastery.get(outcomeId) ?? 0) >= LEARNING_THRESHOLDS.unlockMastery) {
    return { unlocked: true, missingOutcomeIds: [] };
  }

  const missing = (prerequisites.get(outcomeId) ?? []).filter(
    (prerequisiteId) => (mastery.get(prerequisiteId) ?? 0) < LEARNING_THRESHOLDS.unlockMastery,
  );

  return { unlocked: missing.length === 0, missingOutcomeIds: missing };
}

/** Son çalışmadan bu yana geçen tam gün sayısı. */
export function daysSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, Math.floor((nowMs - parsed) / 86_400_000));
}

/** Kazanım tekrar gerektiriyor mu (uzun süredir çalışılmamış)? */
export function needsRefresh(lastAccessedAt: string | null, nowMs: number): boolean {
  const days = daysSince(lastAccessedAt, nowMs);
  return days !== null && days >= LEARNING_THRESHOLDS.staleDays;
}
