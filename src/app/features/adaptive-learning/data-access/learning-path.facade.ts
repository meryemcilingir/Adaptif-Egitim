import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiError } from '../../../core/api/api-error';
import { LearningPath } from '../models/learning-path.model';
import { Recommendation } from '../models/recommendation.model';
import { LearningRepository } from './content.repository';

type Status = 'idle' | 'loading' | 'success' | 'error';

/**
 * Öğrenme yolu ve öneri durumu.
 *
 * Yol TÜRETİLMİŞ veridir; yazma işlemi yoktur, bu yüzden `CatalogFacade`
 * yerine küçük bir okuma facade'i kullanılır (YAGNI).
 */
@Injectable({ providedIn: 'root' })
export class LearningPathFacade {
  private readonly repository = inject(LearningRepository);

  private readonly pathsState = signal<readonly LearningPath[]>([]);
  private readonly statusState = signal<Status>('idle');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly selectedCourseState = signal<string | null>(null);

  private readonly recommendationsState = signal<readonly Recommendation[]>([]);
  private readonly recommendationStatusState = signal<Status>('idle');
  private readonly recommendationErrorState = signal<ApiError | null>(null);

  /* ── Öğrenme yolu ────────────────────────────────────────────────────── */
  readonly paths = this.pathsState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.statusState() === 'loading');
  readonly hasError = computed(() => this.statusState() === 'error');
  readonly isEmpty = computed(
    () => this.statusState() === 'success' && this.pathsState().length === 0,
  );

  readonly selectedCourseId = this.selectedCourseState.asReadonly();

  /** Seçili ders yolu — seçim yoksa devam edilebilir ilk yol gösterilir. */
  readonly activePath = computed<LearningPath | null>(() => {
    const paths = this.pathsState();
    const selected = this.selectedCourseState();

    if (selected) return paths.find((path) => path.courseId === selected) ?? null;
    return paths.find((path) => path.currentStep !== null) ?? paths[0] ?? null;
  });

  readonly courseOptions = computed(() =>
    this.pathsState().map((path) => ({
      id: path.courseId,
      code: path.courseCode,
      name: path.courseName,
      completionPercent: path.completionPercent,
    })),
  );

  load(): void {
    this.statusState.set('loading');
    this.errorState.set(null);

    this.repository.path().subscribe({
      next: (overview) => {
        this.pathsState.set(overview.paths);
        this.statusState.set('success');
      },
      error: (error: ApiError) => {
        this.errorState.set(error);
        this.statusState.set('error');
      },
    });
  }

  selectCourse(courseId: string | null): void {
    this.selectedCourseState.set(courseId);
  }

  /* ── Öneriler ────────────────────────────────────────────────────────── */
  readonly recommendations = this.recommendationsState.asReadonly();
  readonly recommendationError = this.recommendationErrorState.asReadonly();
  readonly isRecommendationLoading = computed(() => this.recommendationStatusState() === 'loading');
  readonly hasRecommendationError = computed(() => this.recommendationStatusState() === 'error');
  readonly isRecommendationEmpty = computed(
    () =>
      this.recommendationStatusState() === 'success' && this.recommendationsState().length === 0,
  );

  loadRecommendations(limit = 8): void {
    this.recommendationStatusState.set('loading');
    this.recommendationErrorState.set(null);

    this.repository.recommendations({ limit }).subscribe({
      next: (items) => {
        this.recommendationsState.set(items);
        this.recommendationStatusState.set('success');
      },
      error: (error: ApiError) => {
        this.recommendationErrorState.set(error);
        this.recommendationStatusState.set('error');
      },
    });
  }
}
