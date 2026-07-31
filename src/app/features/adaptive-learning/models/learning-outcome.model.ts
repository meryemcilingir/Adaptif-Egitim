import { AuditableEntity, CognitiveLevel, Difficulty, PublishState } from './common.model';

export interface LearningOutcome extends AuditableEntity {
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly courseId: string;
  readonly level: CognitiveLevel;
  readonly difficulty: Difficulty;
  /** Kazanımın edinilmesi için öngörülen çalışma süresi (dakika). */
  readonly estimatedDurationMinutes: number;
  readonly tags: readonly string[];
  /** Bu kazanımdan önce edinilmesi gereken kazanımlar (BR-01: döngü olamaz). */
  readonly prerequisiteIds: readonly string[];
  readonly state: PublishState;
  readonly weight: number;
  readonly questionCount: number;
  readonly contentCount: number;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
}

export interface OutcomeCreateRequest {
  readonly code: string;
  readonly title: string;
  readonly description: string;
  readonly courseId: string;
  readonly level: CognitiveLevel;
  readonly difficulty: Difficulty;
  readonly estimatedDurationMinutes: number;
  readonly tags: readonly string[];
  readonly weight: number;
  readonly prerequisiteIds: readonly string[];
}

export interface OutcomeFilters {
  readonly courseId: string | null;
  readonly level: readonly string[];
  readonly difficulty: readonly string[];
  readonly state: readonly string[];
  readonly tags: readonly string[];
  readonly hasPrerequisite: string | null;
}

export const OUTCOME_LIMITS = {
  code: { min: 3, max: 24 },
  title: { min: 5, max: 150 },
  description: { max: 500 },
  tag: { max: 30 },
  tagCount: { max: 10 },
  estimatedDurationMinutes: { min: 1, max: 6000 },
  weight: { min: 1, max: 10 },
  prerequisiteCount: { max: 10 },
} as const;

/* ── Grafik görünümü ─────────────────────────────────────────────────────
 * Layout bilgisi (derinlik, konum) veri modelini kirletmez; grafik ekranı için
 * ayrı tiplerde tutulur.
 */

export interface OutcomeGraphNode {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly level: CognitiveLevel;
  readonly difficulty: Difficulty;
  readonly state: PublishState;
  readonly courseId: string;
  readonly courseCode: string;
  /** Topolojik katman — grafiğin dikey yerleşimini belirler. */
  readonly depth: number;
  readonly prerequisiteCount: number;
  readonly dependentCount: number;
}

export interface OutcomeGraphEdge {
  readonly from: string;
  readonly to: string;
  /** Döngüye dâhil kenarlar arayüzde kırmızı gösterilir. */
  readonly partOfCycle: boolean;
}

export interface OutcomeGraph {
  readonly nodes: readonly OutcomeGraphNode[];
  readonly edges: readonly OutcomeGraphEdge[];
  readonly cycles: readonly (readonly string[])[];
}
