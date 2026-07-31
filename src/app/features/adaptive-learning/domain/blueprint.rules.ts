import { DIFFICULTIES, Difficulty } from '../models/common.model';
import {
  BlueprintOutcomeRow,
  BlueprintSummary,
  DifficultyShare,
  ExamBlueprint,
} from '../models/blueprint.model';

/**
 * Blueprint hesapları — saf fonksiyonlar.
 *
 * Editör her tuş vuruşunda `summarizeBlueprint()` çağırır; ağ isteği yoktur.
 * Aynı fonksiyon mock sunucuda da kullanılır, böylece ekranda görülen özet ile
 * doğrulama motorunun kullandığı sayılar ayrışamaz.
 */

/** Bir satırın toplam soru sayısı. */
export function rowTotal(row: Pick<BlueprintOutcomeRow, 'easy' | 'medium' | 'hard'>): number {
  return row.easy + row.medium + row.hard;
}

/** Blueprint'in hedeflediği toplam soru sayısı. */
export function blueprintTotalQuestions(rows: readonly BlueprintOutcomeRow[]): number {
  return rows.reduce((total, row) => total + rowTotal(row), 0);
}

/** Zorluk başına hedeflenen soru sayısı. */
export function blueprintDifficultyCounts(
  rows: readonly BlueprintOutcomeRow[],
): Readonly<Record<Difficulty, number>> {
  return {
    easy: rows.reduce((sum, row) => sum + row.easy, 0),
    medium: rows.reduce((sum, row) => sum + row.medium, 0),
    hard: rows.reduce((sum, row) => sum + row.hard, 0),
  };
}

/**
 * Blueprint özeti.
 *
 * `courseOutcomeIds` dersin TÜM kazanımlarıdır; kapsama oranı buna göre hesaplanır.
 * Satırı olan ama tüm hücreleri sıfır olan kazanım "kapsanmamış" sayılır — plan
 * yazılmış ama soru istenmemiştir.
 */
export function summarizeBlueprint(
  blueprint: Pick<ExamBlueprint, 'rows' | 'targetTotalPoints' | 'targetDurationMinutes'>,
  courseOutcomeIds: readonly string[],
): BlueprintSummary {
  const totalQuestions = blueprintTotalQuestions(blueprint.rows);
  const counts = blueprintDifficultyCounts(blueprint.rows);

  const covered = new Set(
    blueprint.rows.filter((row) => rowTotal(row) > 0).map((row) => row.outcomeId),
  );
  const emptyOutcomeIds = courseOutcomeIds.filter((id) => !covered.has(id));

  const difficultyShares: DifficultyShare[] = DIFFICULTIES.map((difficulty) => ({
    difficulty,
    count: counts[difficulty],
    percent: totalQuestions > 0 ? Math.round((counts[difficulty] / totalQuestions) * 100) : 0,
  }));

  return {
    totalQuestions,
    targetTotalPoints: blueprint.targetTotalPoints,
    targetDurationMinutes: blueprint.targetDurationMinutes,
    coveredOutcomes: covered.size,
    totalOutcomes: courseOutcomeIds.length,
    coveragePercent:
      courseOutcomeIds.length > 0
        ? Math.round((covered.size / courseOutcomeIds.length) * 100)
        : 0,
    difficultyShares,
    emptyOutcomeIds,
  };
}

/**
 * Boş bir blueprint satır kümesi üretir — dersin her kazanımı için sıfırlı satır.
 * Editör böylece kullanıcıya tüm kazanımları gösterir; kullanıcı yalnızca
 * istediği hücreleri doldurur.
 */
export function emptyRows(outcomeIds: readonly string[]): BlueprintOutcomeRow[] {
  return outcomeIds.map((outcomeId) => ({ outcomeId, easy: 0, medium: 0, hard: 0 }));
}

/**
 * Mevcut satırları dersin güncel kazanım listesiyle hizalar.
 *
 * Ders sonradan kazanım kazanabilir veya kaybedebilir; blueprint açıldığında
 * eksik kazanımlar sıfırlı satır olarak eklenir, silinmiş kazanımların satırı düşer.
 */
export function alignRows(
  rows: readonly BlueprintOutcomeRow[],
  outcomeIds: readonly string[],
): BlueprintOutcomeRow[] {
  const byId = new Map(rows.map((row) => [row.outcomeId, row] as const));

  return outcomeIds.map(
    (outcomeId) => byId.get(outcomeId) ?? { outcomeId, easy: 0, medium: 0, hard: 0 },
  );
}
