import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';

import { ApiError } from '../../../core/api/api-error';
import { createPageRequest } from '../../../core/api/page-request';
import { ToastStore } from '../../../core/observability/toast.store';
import {
  AnalyticsFilterDefinition,
  AnalyticsFilterValue,
} from '../components/analytics/analytics-filter-bar.component';
import { defaultRange } from '../domain/analytics-range';
import { CohortSummary } from '../models/common.model';
import { CourseRepository, ReferenceRepository } from './catalog.repository';
import { ExamRepository } from './exam.repository';
import { ProgramRepository } from './catalog.repository';
import { AnalyticsQuery, AnalyticsRepository } from './analytics.repository';

/** Rapor yükleme durumu — her ekran aynı üç durumu gösterir. */
export type ReportStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Analitik filtrelerinin ve referans listelerinin ORTAK kaynağı.
 *
 * Filtre durumu tek bir yerde tutulur: kullanıcı genel bakışta "son 7 gün"
 * seçip kazanım analizine geçtiğinde filtresi korunur. Her ekranın kendi
 * filtresini tutması, aynı oturumda birbirinden habersiz iki farklı dönem
 * göstermek demek olurdu.
 *
 * `providedIn: 'root'` bilinçli: filtre oturum boyunca yaşar.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsFacade {
  private readonly repository = inject(AnalyticsRepository);
  private readonly courses = inject(CourseRepository);
  private readonly programs = inject(ProgramRepository);
  private readonly reference = inject(ReferenceRepository);
  private readonly exams = inject(ExamRepository);
  private readonly toast = inject(ToastStore);

  private readonly filterState = signal<AnalyticsFilterValue>({
    range: defaultRange(),
    selections: {},
  });

  private readonly referencesState = signal<{
    programs: readonly { value: string; label: string }[];
    courses: readonly { value: string; label: string }[];
    cohorts: readonly { value: string; label: string }[];
    exams: readonly { value: string; label: string }[];
    students: readonly { value: string; label: string }[];
  }>({ programs: [], courses: [], cohorts: [], exams: [], students: [] });

  private readonly referencesLoaded = signal(false);

  readonly filters = this.filterState.asReadonly();
  readonly references = this.referencesState.asReadonly();

  /** Repository'ye gidecek sorgu — filtre durumundan türetilir. */
  readonly query = computed<AnalyticsQuery>(() => ({
    range: this.filterState().range,
    selections: this.filterState().selections,
  }));

  setFilters(value: AnalyticsFilterValue): void {
    this.filterState.set(value);
  }

  resetFilters(): void {
    this.filterState.set({ range: defaultRange(), selections: {} });
  }

  /**
   * Filtre çubuğunda gösterilecek açılır listeler.
   *
   * Ekran hangi boyutlara göre filtrelenebileceğini söyler; seçenekler ortak
   * referans listelerinden doldurulur. Böylece her ekran kendi ders listesini
   * ayrıca çekmez.
   */
  definitionsFor(keys: readonly string[]): AnalyticsFilterDefinition[] {
    const refs = this.referencesState();

    const catalog: Readonly<Record<string, AnalyticsFilterDefinition>> = {
      programId: {
        key: 'programId',
        label: 'Program',
        options: refs.programs,
        placeholder: 'Tüm programlar',
      },
      courseId: {
        key: 'courseId',
        label: 'Ders',
        options: refs.courses,
        placeholder: 'Tüm dersler',
      },
      cohortId: {
        key: 'cohortId',
        label: 'Grup',
        options: refs.cohorts,
        placeholder: 'Tüm gruplar',
      },
      studentId: {
        key: 'studentId',
        label: 'Öğrenci',
        options: refs.students,
        placeholder: 'Tüm öğrenciler',
      },
      examId: {
        key: 'examId',
        label: 'Sınav',
        options: refs.exams,
        placeholder: 'Tüm sınavlar',
      },
    };

    return keys.map((key) => catalog[key]).filter(Boolean);
  }

  /**
   * Referans listelerini bir kez yükler.
   *
   * Her ekran açılışında yeniden çekmek, filtre çubuğunu her geçişte boş
   * gösterir ve gereksiz istek üretirdi.
   */
  loadReferences(): void {
    if (this.referencesLoaded()) return;
    this.referencesLoaded.set(true);

    forkJoin({
      programs: this.programs.list(createPageRequest({ size: 100 })),
      courses: this.courses.list(createPageRequest({ size: 200 })),
      cohorts: this.reference.cohorts(),
      exams: this.exams.list(createPageRequest({ size: 200 })),
    }).subscribe({
      next: ({ programs, courses, cohorts, exams }) => {
        this.referencesState.update((current) => ({
          ...current,
          programs: programs.items.map((item) => ({ value: item.id, label: item.name })),
          courses: courses.items.map((item) => ({
            value: item.id,
            label: `${item.code} · ${item.name}`,
          })),
          cohorts: cohorts.map((item: CohortSummary) => ({ value: item.id, label: item.name })),
          exams: exams.items.map((item) => ({ value: item.id, label: item.title })),
        }));
      },
      // Referanslar yüklenemezse filtreler boş kalır; rapor yine de çalışır.
      error: () => this.referencesLoaded.set(false),
    });
  }

  /** Öğrenci seçeneklerini talep üzerine doldurur (karşılaştırma ekranı). */
  setStudentOptions(students: readonly { value: string; label: string }[]): void {
    this.referencesState.update((current) => ({ ...current, students }));
  }

  /* ── Ortak yükleme yardımcısı ──────────────────────────────────────────── */

  /**
   * Rapor yüklemesini standart duruma bağlar.
   *
   * Her ekranın kendi `loading/error` sinyallerini yazması, birinde unutulan
   * bir hata durumunun sonsuz iskelet göstermesine yol açardı.
   */
  load<T>(
    request: Observable<T>,
    state: {
      data: ReturnType<typeof signal<T | null>>;
      status: ReturnType<typeof signal<ReportStatus>>;
      error: ReturnType<typeof signal<ApiError | null>>;
    },
  ): void {
    state.status.set('loading');
    state.error.set(null);

    request.subscribe({
      next: (value) => {
        state.data.set(value);
        state.status.set('success');
      },
      error: (error: ApiError) => {
        state.error.set(error);
        state.status.set('error');

        // Filtre hatası alan bazında gösterilir; toast yalnızca beklenmedik hatalarda.
        if (error.code !== 'VALIDATION') this.toast.error(error.message);
      },
    });
  }

  get reports(): AnalyticsRepository {
    return this.repository;
  }
}
