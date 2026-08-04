import { percentOf, round1 } from './statistics';

/**
 * Öğrenme hızı ve risk analizi (Sprint 8 §10, §11).
 *
 * "Hız" burada BİRİM ZAMANDA TAMAMLANAN İÇERİK olarak tanımlanır — harcanan
 * süre değil. Çok zaman harcayan bir öğrenci hızlı değildir; az sürede çok
 * kazanım tamamlayan hızlıdır. Bu ayrım önemli, çünkü "çok çalışan" ile
 * "hızlı ilerleyen" farklı müdahaleler gerektirir.
 *
 * Saf fonksiyonlardır; "şimdi" parametredir.
 */

export interface VelocityInput {
  readonly studentId: string;
  readonly studentName: string;
  readonly completedCount: number;
  readonly totalCount: number;
  /** İçerikler üzerinde harcanan toplam süre (dakika). */
  readonly minutesSpent: number;
  /** Öğrencinin sisteme ilk kayıt olduğu an. */
  readonly startedAt: string;
  readonly masteryPercent: number;
}

export interface VelocityEntry {
  readonly studentId: string;
  readonly studentName: string;
  readonly completedCount: number;
  readonly totalCount: number;
  readonly completionRate: number;
  /** Haftada tamamlanan içerik sayısı — hızın asıl ölçüsü. */
  readonly itemsPerWeek: number;
  /** Bir içeriği tamamlamak için harcanan ortalama süre (dakika). */
  readonly averageMinutesPerItem: number;
  readonly masteryPercent: number;
  readonly weeksActive: number;
}

/** Bu hızın üstü "hızlı", altı "yavaş" sayılır (içerik/hafta). */
export const VELOCITY_BANDS = { fast: 4, slow: 1.5 } as const;

export function computeVelocity(input: VelocityInput, nowMs: number): VelocityEntry {
  const elapsedMs = Math.max(0, nowMs - Date.parse(input.startedAt));

  /*
   * En az bir hafta varsayılır: ilk günlerinde 3 içerik bitiren öğrenci
   * "haftada 21 içerik" gibi anlamsız bir hıza sahip görünmemelidir.
   */
  const weeksActive = Math.max(1, elapsedMs / (7 * 86_400_000));

  return {
    studentId: input.studentId,
    studentName: input.studentName,
    completedCount: input.completedCount,
    totalCount: input.totalCount,
    completionRate: percentOf(input.completedCount, input.totalCount),
    itemsPerWeek: round1(input.completedCount / weeksActive),
    averageMinutesPerItem:
      input.completedCount === 0 ? 0 : Math.round(input.minutesSpent / input.completedCount),
    masteryPercent: Math.round(input.masteryPercent),
    weeksActive: round1(weeksActive),
  };
}

export interface VelocityReport {
  readonly entries: readonly VelocityEntry[];
  readonly averageItemsPerWeek: number;
  readonly averageMinutesPerItem: number;
  readonly fastLearners: readonly VelocityEntry[];
  readonly slowLearners: readonly VelocityEntry[];
}

export function summarizeVelocity(entries: readonly VelocityEntry[]): VelocityReport {
  const active = entries.filter((entry) => entry.completedCount > 0);

  return {
    entries,
    averageItemsPerWeek:
      active.length === 0
        ? 0
        : round1(active.reduce((sum, e) => sum + e.itemsPerWeek, 0) / active.length),
    averageMinutesPerItem:
      active.length === 0
        ? 0
        : Math.round(active.reduce((sum, e) => sum + e.averageMinutesPerItem, 0) / active.length),
    fastLearners: [...active]
      .filter((entry) => entry.itemsPerWeek >= VELOCITY_BANDS.fast)
      .sort((a, b) => b.itemsPerWeek - a.itemsPerWeek)
      .slice(0, 5),
    /*
     * Yavaş öğrenen listesine hiç başlamamışlar DAHİL EDİLMEZ: onların sorunu
     * hız değil, katılımdır ve "risk altındaki öğrenciler" bölümüne aittir.
     */
    slowLearners: [...active]
      .filter((entry) => entry.itemsPerWeek < VELOCITY_BANDS.slow)
      .sort((a, b) => a.itemsPerWeek - b.itemsPerWeek)
      .slice(0, 5),
  };
}

/* ── Performans ve risk ──────────────────────────────────────────────────── */

export interface PerformanceInput {
  readonly studentId: string;
  readonly studentName: string;
  readonly cohortName: string;
  readonly masteryPercent: number;
  readonly examAveragePercent: number;
  readonly completionRate: number;
  /** Geçilemeyen sınav sayısı. */
  readonly failedExams: number;
  readonly attemptCount: number;
  /** Ustalık ölçümü sayısı — 0 ise ustalık yüzdesi bir ÖLÇÜM değil, veri yokluğudur. */
  readonly masteryCount: number;
  /** Başlanmış içerik sayısı — 0 ise tamamlama oranı hesaplanamaz. */
  readonly touchedContentCount: number;
  /** Katılım oranı (mock) — devamsızlık verisi gerçek değildir. */
  readonly attendancePercent: number;
}

export interface PerformerEntry extends PerformanceInput {
  /** Üç ölçütün birleşik puanı; sıralama bunun üzerinden yapılır. */
  readonly compositeScore: number;
  readonly riskReasons: readonly string[];
  /** En az bir ölçüm var mı — yoksa öğrenci ne başarılı ne riskli sayılır. */
  readonly isMeasured: boolean;
}

/**
 * Risk eşikleri.
 *
 * Tek bir ölçüte bakmak yanıltıcıdır: sınavı iyi geçen ama hiç içerik
 * tamamlamayan öğrenci de, çok çalışıp sınavda tökezleyen öğrenci de gözden
 * kaçardı. Bu yüzden dört ayrı sinyal ayrı ayrı değerlendirilir ve GEREKÇE
 * listesi üretilir — "neden risk altında?" sorusu cevapsız kalmaz.
 */
export const RISK_THRESHOLDS = {
  mastery: 50,
  examAverage: 50,
  completion: 40,
  attendance: 60,
  failedExams: 2,
} as const;

export function evaluatePerformance(input: PerformanceInput): PerformerEntry {
  /*
   * Ölçülmemiş öğrenci RİSKLİ DEĞİLDİR.
   *
   * Hiç ölçümü olmayan bir öğrencinin ustalığı ve tamamlaması 0 görünür; bu
   * sayılara bakıp "risk altında" demek, veri yokluğunu başarısızlık sanmaktır.
   * Her sinyal yalnızca KENDİ ölçümü varsa değerlendirilir.
   */
  const isMeasured =
    input.masteryCount > 0 || input.attemptCount > 0 || input.touchedContentCount > 0;

  const reasons: string[] = [];

  if (input.masteryCount > 0 && input.masteryPercent < RISK_THRESHOLDS.mastery) {
    reasons.push(`Ustalık %${Math.round(input.masteryPercent)}`);
  }
  if (input.attemptCount > 0 && input.examAveragePercent < RISK_THRESHOLDS.examAverage) {
    reasons.push(`Sınav ortalaması %${Math.round(input.examAveragePercent)}`);
  }
  if (input.touchedContentCount > 0 && input.completionRate < RISK_THRESHOLDS.completion) {
    reasons.push(`Tamamlama %${Math.round(input.completionRate)}`);
  }
  if (isMeasured && input.attendancePercent < RISK_THRESHOLDS.attendance) {
    reasons.push(`Katılım %${Math.round(input.attendancePercent)}`);
  }
  if (input.failedExams >= RISK_THRESHOLDS.failedExams) {
    reasons.push(`${input.failedExams} sınavda başarısız`);
  }

  /*
   * Bileşik puan: ustalık ve sınav ortalaması eşit ağırlıkta, tamamlama yarı
   * ağırlıkta. Tamamlama bir ÇABA göstergesidir, başarı göstergesi değil;
   * ona başarıyla eşit ağırlık vermek çok içerik açan ama öğrenmeyen
   * öğrenciyi başarılı gösterirdi.
   */
  const composite =
    input.masteryPercent * 0.4 + input.examAveragePercent * 0.4 + input.completionRate * 0.2;

  return { ...input, compositeScore: round1(composite), riskReasons: reasons, isMeasured };
}

export interface PerformerBoard {
  readonly topPerformers: readonly PerformerEntry[];
  readonly atRisk: readonly PerformerEntry[];
  readonly atRiskCount: number;
  /** Ölçüm yapılabilen öğrenci sayısı — oranların paydası budur. */
  readonly measuredCount: number;
  /** Hiç ölçümü olmayan öğrenciler; ayrı raporlanır, riskli sayılmaz. */
  readonly unmeasuredCount: number;
  readonly studentCount: number;
}

/** Risk için EN AZ İKİ sinyal aranır; tek başına düşük katılım risk değildir. */
export const MIN_RISK_SIGNALS = 2;

export function buildPerformerBoard(
  inputs: readonly PerformanceInput[],
  limit = 5,
): PerformerBoard {
  const entries = inputs.map(evaluatePerformance);
  const measured = entries.filter((entry) => entry.isMeasured);
  const atRisk = measured.filter((entry) => entry.riskReasons.length >= MIN_RISK_SIGNALS);

  return {
    topPerformers: [...measured]
      .filter((entry) => entry.riskReasons.length === 0)
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, limit),
    atRisk: [...atRisk]
      .sort((a, b) => a.compositeScore - b.compositeScore)
      .slice(0, limit),
    atRiskCount: atRisk.length,
    measuredCount: measured.length,
    unmeasuredCount: entries.length - measured.length,
    studentCount: entries.length,
  };
}
