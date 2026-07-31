import { MultiSelectOption } from '../../../shared/components/app-multi-select/app-multi-select.component';
import { LearningOutcome } from '../models/learning-outcome.model';
import { findCyclePath } from './outcome-graph.rules';

/**
 * Önkoşul seçim listesini üretir.
 *
 * Döngü oluşturacak adaylar listeden GİZLENMEZ; devre dışı bırakılır ve nedeni
 * yazılır (BR-01). Kullanıcı kısıtı öğrenir, "neden bu kazanımı seçemiyorum?"
 * sorusuyla baş başa kalmaz.
 *
 * Kontrol, sunucunun kullandığı `findCyclePath` fonksiyonuyla AYNIDIR — iki taraf
 * farklı sonuç veremez.
 */
export function buildPrerequisiteOptions(
  outcomes: readonly LearningOutcome[],
  currentOutcomeId: string | null,
): MultiSelectOption[] {
  const graph = new Map<string, readonly string[]>(
    outcomes.map((outcome) => [outcome.id, outcome.prerequisiteIds] as const),
  );
  const codeOf = new Map(outcomes.map((outcome) => [outcome.id, outcome.code] as const));

  return (
    outcomes
      // Kazanım kendi önkoşulu olamaz; kendisi listede görünmez.
      .filter((outcome) => outcome.id !== currentOutcomeId)
      .map((outcome) => {
        const cyclePath =
          currentOutcomeId === null ? null : findCyclePath(graph, currentOutcomeId, outcome.id);

        return {
          value: outcome.id,
          label: `${outcome.code} · ${outcome.title}`,
          hint: outcome.description,
          disabled: cyclePath !== null,
          disabledReason: cyclePath
            ? `Döngü oluşur: ${cyclePath.map((id) => codeOf.get(id) ?? id).join(' → ')}`
            : undefined,
        } satisfies MultiSelectOption;
      })
      .sort((a, b) => a.label.localeCompare(b.label, 'tr-TR'))
  );
}
