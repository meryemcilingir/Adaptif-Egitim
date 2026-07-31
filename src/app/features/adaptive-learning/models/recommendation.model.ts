/**
 * Açıklanabilir öneri.
 *
 * Gerçek AI yok; kural tabanlı motor her öneri için hangi kuralın neden
 * tetiklendiğini `reasons` içinde döndürür (BR-16). Arayüz bu gerekçeleri
 * kullanıcıya cümle hâlinde gösterir.
 */

export const RECOMMENDATION_KINDS = ['content', 'outcome', 'review'] as const;
export type RecommendationKind = (typeof RECOMMENDATION_KINDS)[number];

export const RECOMMENDATION_RULES = [
  /** Ustalık kritik seviyede → anlatım içeriği (video/sunum) önerilir. */
  'low_mastery_watch',
  /** Ustalık orta seviyede → ölçme içeriği (quiz) önerilir. */
  'mid_mastery_practice',
  /** Ustalık yüksek → sonraki kazanıma geçilebilir. */
  'high_mastery_advance',
  /** Önceki içerik tamamlandı → sıradaki içerik. */
  'next_in_sequence',
  /** Önkoşul tamamlanmadı → ileri içerik kilitli. */
  'prerequisite_gap',
  /** Uzun süre çalışılmadı → tekrar. */
  'spaced_repetition',
  /** Quiz başarısızlığı → kolay seviye içerik. */
  'failed_assessment',
  /** Yaklaşan sınav kapsamında. */
  'exam_upcoming',
  /** Yarım kalan içerik. */
  'incomplete_content',
] as const;
export type RecommendationRule = (typeof RECOMMENDATION_RULES)[number];

export const RECOMMENDATION_RULE_LABELS: Readonly<Record<RecommendationRule, string>> = {
  low_mastery_watch: 'Temel eksiği',
  mid_mastery_practice: 'Pekiştirme',
  high_mastery_advance: 'Sonraki adım',
  next_in_sequence: 'Sıradaki içerik',
  prerequisite_gap: 'Önkoşul eksiği',
  spaced_repetition: 'Aralıklı tekrar',
  failed_assessment: 'Başarısız değerlendirme',
  exam_upcoming: 'Yaklaşan sınav',
  incomplete_content: 'Yarım kalan içerik',
};

/** Tek bir kuralın katkısı — arayüzde madde madde gösterilir. */
export interface RecommendationReason {
  readonly rule: RecommendationRule;
  /** Kullanıcıya gösterilen tam cümle. */
  readonly explanation: string;
  /** Kuralın toplam öncelik puanına katkısı. */
  readonly contribution: number;
  /** Kararı üreten sayısal girdiler (ör. `{ masteryScore: 42, threshold: 60 }`). */
  readonly evidence: Readonly<Record<string, number | string>>;
}

export interface Recommendation {
  readonly id: string;
  readonly studentId: string;
  readonly kind: RecommendationKind;
  readonly targetId: string;
  readonly targetTitle: string;
  /** İçerik önerilerinde tür; kazanım önerilerinde `null`. */
  readonly contentType: string | null;
  readonly courseId: string;
  readonly courseCode: string;
  readonly outcomeId: string;
  readonly outcomeCode: string;
  /** 0–100; sıralama bu puana göre yapılır. */
  readonly priority: number;
  readonly estimatedMinutes: number;
  readonly reasons: readonly RecommendationReason[];
  readonly generatedAt: string;
}
