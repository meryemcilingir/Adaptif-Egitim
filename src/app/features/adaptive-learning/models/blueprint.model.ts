import { AuditableEntity, Difficulty, PublishState } from './common.model';

/**
 * Sınav blueprint'i (ölçme planı).
 *
 * Blueprint "hangi kazanımdan kaç zor/orta/kolay soru sorulacak" sorusunu yanıtlar.
 * Sınavın kendisi değildir; sınav bu plana göre KURULUR ve plana uygunluğu
 * doğrulama motoru tarafından denetlenir (BR-04).
 *
 * Bir blueprint bir cohort'a bağlanabilir (`cohortId`); böylece aynı dersin farklı
 * grupları için farklı ölçme planları tanımlanabilir (Program → Cohort → Blueprint).
 * `cohortId = null` ise plan ders genelindedir.
 */

/** Kazanım başına zorluk dağılımı — blueprint editörünün bir satırı. */
export interface BlueprintOutcomeRow {
  readonly outcomeId: string;
  readonly easy: number;
  readonly medium: number;
  readonly hard: number;
}

export interface ExamBlueprint extends AuditableEntity {
  readonly name: string;
  readonly description: string;
  readonly courseId: string;
  /** null → ders geneli plan; dolu → yalnızca o cohort için. */
  readonly cohortId: string | null;
  readonly rows: readonly BlueprintOutcomeRow[];
  /** Planlanan toplam puan (sınav bu hedefe göre doğrulanır). */
  readonly targetTotalPoints: number;
  readonly targetDurationMinutes: number;
  readonly state: PublishState;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
}

export interface BlueprintCreateRequest {
  readonly name: string;
  readonly description: string;
  readonly courseId: string;
  readonly cohortId: string | null;
  readonly rows: readonly BlueprintOutcomeRow[];
  readonly targetTotalPoints: number;
  readonly targetDurationMinutes: number;
}

/* ── Özet ────────────────────────────────────────────────────────────────── */

export interface DifficultyShare {
  readonly difficulty: Difficulty;
  readonly count: number;
  readonly percent: number;
}

/**
 * Blueprint'in canlı özeti.
 *
 * Editör her tuş vuruşunda bunu yeniden hesaplar; saf fonksiyondur
 * (`domain/blueprint.rules.ts`), bu yüzden ağ isteği gerektirmez.
 */
export interface BlueprintSummary {
  readonly totalQuestions: number;
  readonly targetTotalPoints: number;
  readonly targetDurationMinutes: number;
  /** Soru tanımlanmış kazanım sayısı / dersin toplam kazanım sayısı. */
  readonly coveredOutcomes: number;
  readonly totalOutcomes: number;
  readonly coveragePercent: number;
  readonly difficultyShares: readonly DifficultyShare[];
  /** Hiç soru atanmamış kazanımlar — editörde uyarı olarak gösterilir. */
  readonly emptyOutcomeIds: readonly string[];
}

/** Blueprint listesi/detayı için okunabilir ek bilgiler. */
export interface BlueprintDetail {
  readonly blueprint: ExamBlueprint;
  readonly courseCode: string;
  readonly courseName: string;
  readonly cohortName: string | null;
  readonly summary: BlueprintSummary;
  readonly outcomes: readonly {
    readonly id: string;
    readonly code: string;
    readonly title: string;
  }[];
  /** Bu blueprint'i kullanan sınav sayısı — silme kararında gösterilir. */
  readonly examCount: number;
}

export interface BlueprintFilters {
  readonly courseId: string | null;
  readonly cohortId: string | null;
  readonly state: readonly string[];
}

export const BLUEPRINT_LIMITS = {
  name: { min: 3, max: 120 },
  description: { max: 500 },
  targetTotalPoints: { min: 1, max: 1000 },
  targetDurationMinutes: { min: 5, max: 480 },
  /** Tek kazanımda tek zorluk için üst sınır — kazara 999 girilmesin. */
  questionsPerCell: { min: 0, max: 50 },
  rowCount: { min: 1, max: 60 },
} as const;
