import { AuditableEntity } from './common.model';

export interface RubricLevel {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly points: number;
}

export interface RubricCriterion {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly weight: number;
  /** Puanı artan sırada olmalıdır (validator: rubricLevelsMonotonic). */
  readonly levels: readonly RubricLevel[];
}

export interface Rubric extends AuditableEntity {
  readonly name: string;
  readonly description: string;
  readonly courseId: string;
  readonly criteria: readonly RubricCriterion[];
  readonly maxPoints: number;
}

export function rubricMaxPoints(rubric: Rubric): number {
  return rubric.criteria.reduce(
    (total, criterion) =>
      total + Math.max(0, ...criterion.levels.map((level) => level.points)) * criterion.weight,
    0,
  );
}
