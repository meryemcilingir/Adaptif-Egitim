import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { DIFFICULTY_LABELS, Difficulty } from '../../models/common.model';
import { BLUEPRINT_LIMITS, BlueprintOutcomeRow } from '../../models/blueprint.model';
import { rowTotal, summarizeBlueprint } from '../../domain/blueprint.rules';

export interface OutcomeRef {
  readonly id: string;
  readonly code: string;
  readonly title: string;
}

/** Tek bir hücrenin değişimi. */
export interface CellChange {
  readonly outcomeId: string;
  readonly difficulty: Difficulty;
  readonly value: number;
}

/**
 * Blueprint editörü: kazanım × zorluk tablosu.
 *
 * Özet (toplam soru, puan, süre, kapsama, zorluk dağılımı) her değişiklikte
 * `summarizeBlueprint()` ile YENİDEN HESAPLANIR — ağ isteği yoktur, sayılar
 * kullanıcı yazarken anında güncellenir.
 */
@Component({
  selector: 'app-blueprint-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, AppProgressBarComponent],
  templateUrl: './blueprint-editor.component.html',
  styleUrl: './blueprint-editor.component.scss',
})
export class BlueprintEditorComponent {
  readonly rows = input.required<readonly BlueprintOutcomeRow[]>();
  readonly outcomes = input.required<readonly OutcomeRef[]>();
  readonly targetTotalPoints = input(0);
  readonly targetDurationMinutes = input(0);
  readonly readonlyMode = input(false);

  readonly cellChange = output<CellChange>();

  readonly limits = BLUEPRINT_LIMITS;

  readonly summary = computed(() =>
    summarizeBlueprint(
      {
        rows: this.rows(),
        targetTotalPoints: this.targetTotalPoints(),
        targetDurationMinutes: this.targetDurationMinutes(),
      },
      this.outcomes().map((outcome) => outcome.id),
    ),
  );

  /** Kazanım kimliğine göre satır — tabloda hızlı erişim için. */
  private readonly rowById = computed(
    () => new Map(this.rows().map((row) => [row.outcomeId, row] as const)),
  );

  rowFor(outcomeId: string): BlueprintOutcomeRow {
    return this.rowById().get(outcomeId) ?? { outcomeId, easy: 0, medium: 0, hard: 0 };
  }

  totalFor(outcomeId: string): number {
    return rowTotal(this.rowFor(outcomeId));
  }

  /** Girilen değer sınırlara kırpılarak yukarı bildirilir. */
  onCellInput(outcomeId: string, difficulty: Difficulty, raw: string): void {
    const parsed = Math.round(Number(raw));
    const value = Number.isFinite(parsed)
      ? Math.min(
          BLUEPRINT_LIMITS.questionsPerCell.max,
          Math.max(BLUEPRINT_LIMITS.questionsPerCell.min, parsed),
        )
      : 0;

    this.cellChange.emit({ outcomeId, difficulty, value });
  }

  difficultyLabel(difficulty: Difficulty): string {
    return DIFFICULTY_LABELS[difficulty];
  }

  /** Soru istenmeyen kazanım — editörde soluk gösterilir. */
  isEmpty(outcomeId: string): boolean {
    return this.totalFor(outcomeId) === 0;
  }
}
