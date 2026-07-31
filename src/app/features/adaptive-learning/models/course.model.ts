import { AuditableEntity, PublishState } from './common.model';

export const COURSE_CATEGORIES = ['core', 'elective', 'laboratory', 'seminar', 'project'] as const;
export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const COURSE_CATEGORY_LABELS: Readonly<Record<CourseCategory, string>> = {
  core: 'Zorunlu',
  elective: 'Seçmeli',
  laboratory: 'Laboratuvar',
  seminar: 'Seminer',
  project: 'Proje',
};

export const COURSE_LEVELS = ['introductory', 'intermediate', 'advanced'] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

export const COURSE_LEVEL_LABELS: Readonly<Record<CourseLevel, string>> = {
  introductory: 'Giriş',
  intermediate: 'Orta',
  advanced: 'İleri',
};

export interface Course extends AuditableEntity {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly programId: string;
  readonly termId: string;
  readonly instructorId: string;
  readonly instructorName: string;
  readonly cohortIds: readonly string[];
  readonly category: CourseCategory;
  readonly level: CourseLevel;
  /** Dersin toplam tahmini süresi (saat). */
  readonly estimatedDurationHours: number;
  readonly state: PublishState;
  readonly outcomeCount: number;
  readonly contentCount: number;
  readonly enrolledCount: number;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
  readonly color: string;
}

export interface CourseCreateRequest {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly programId: string;
  readonly termId: string;
  readonly instructorId: string;
  readonly category: CourseCategory;
  readonly level: CourseLevel;
  readonly estimatedDurationHours: number;
}

export interface CourseFilters {
  readonly state: readonly string[];
  readonly programId: string | null;
  readonly termId: string | null;
  readonly instructorId: string | null;
  readonly category: readonly string[];
  readonly level: readonly string[];
}

export const COURSE_LIMITS = {
  code: { min: 3, max: 12 },
  name: { min: 3, max: 100 },
  description: { max: 500 },
  estimatedDurationHours: { min: 1, max: 400 },
} as const;
