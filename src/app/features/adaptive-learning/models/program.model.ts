import { AuditableEntity, PublishState } from './common.model';

/**
 * Akademik program — ders ve kazanım hiyerarşisinin en üst düzeyi.
 *
 * Sayaç alanları (`courseCount`, `outcomeCount`, `studentCount`) sunucu tarafında
 * türetilir; istemci bunları hesaplamaz (tek hesaplama katmanı kuralı).
 */
export interface Program extends AuditableEntity {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly state: PublishState;
  readonly coordinatorId: string;
  readonly coordinatorName: string;
  readonly courseCount: number;
  readonly outcomeCount: number;
  readonly studentCount: number;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
}

/** Program oluşturma isteği — sunucu tarafında üretilen alanlar (id, sayaçlar) yoktur. */
export interface ProgramCreateRequest {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly coordinatorId: string;
}

export interface ProgramFilters {
  readonly state: readonly string[];
  readonly coordinatorId: string | null;
}

/* ── Doğrulama sınırları ──────────────────────────────────────────────────
 * Sınırlar TEK yerde tanımlanır: form validator'ları, karakter sayaçları ve
 * mock backend doğrulaması aynı sabitleri kullanır (PROJECT_RULES.md §5).
 */
export const PROGRAM_LIMITS = {
  code: { min: 2, max: 12 },
  name: { min: 3, max: 100 },
  description: { max: 500 },
} as const;
