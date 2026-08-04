import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

import { ApiError } from '../../../../core/api/api-error';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppChartCardComponent } from '../../../../shared/components/app-chart-card/app-chart-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppFormFieldComponent } from '../../../../shared/components/app-form-field/app-form-field.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppMultiSelectComponent } from '../../../../shared/components/app-multi-select/app-multi-select.component';
import { AppSelectComponent } from '../../../../shared/components/app-select/app-select.component';
import { toMultiSeries, toTimeCategories } from '../../../../shared/utils/chart-adapters';
import {
  AnalyticsFilterBarComponent,
  AnalyticsFilterValue,
} from '../../components/analytics/analytics-filter-bar.component';
import { ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';
import { ReportHeaderComponent } from '../../components/analytics/report-header.component';
import {
  COMPARE_KINDS,
  COMPARE_KIND_LABELS,
  CompareKind,
  ComparisonResult,
} from '../../models/analytics.model';
import { AnalyticsFacade, ReportStatus } from '../../data-access/analytics.facade';

/** En az iki, en fazla dört taraf — sunucu tarafındaki kuralla aynı. */
const MIN_SUBJECTS = 2;
const MAX_SUBJECTS = 4;

/**
 * Karşılaştırmalı analiz (§12).
 *
 * Farklar HER ZAMAN ilk seçilen tarafa göre verilir. "Ortalamaya göre fark"
 * gibi kayan bir referans, seçim değiştikçe aynı öğrencinin farkını da
 * değiştirir ve karşılaştırmayı okunamaz hâle getirirdi.
 */
@Component({
  selector: 'app-compare-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnalyticsFilterBarComponent,
    AppButtonComponent,
    AppCardComponent,
    AppChartCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppFormFieldComponent,
    AppLoadingStateComponent,
    AppMultiSelectComponent,
    AppSelectComponent,
    ReactiveFormsModule,
    ReportHeaderComponent,
  ],
  templateUrl: './compare-analytics.page.html',
  styleUrl: './compare-analytics.page.scss',
})
export class CompareAnalyticsPage implements OnInit {
  protected readonly facade = inject(AnalyticsFacade);

  readonly maxSubjects = MAX_SUBJECTS;

  readonly kindControl = new FormControl<string>('cohort', { nonNullable: true });
  readonly subjectsControl = new FormControl<readonly string[]>([], { nonNullable: true });

  private readonly kindValue = toSignal(this.kindControl.valueChanges, {
    initialValue: this.kindControl.value,
  });
  private readonly subjectsValue = toSignal(this.subjectsControl.valueChanges, {
    initialValue: this.subjectsControl.value,
  });

  private readonly data = signal<ComparisonResult | null>(null);
  private readonly status = signal<ReportStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);

  readonly result = this.data.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.status() === 'loading');
  readonly hasError = computed(() => this.status() === 'error');
  readonly isIdle = computed(() => this.status() === 'idle');

  readonly kindOptions = COMPARE_KINDS.map((kind) => ({
    value: kind,
    label: COMPARE_KIND_LABELS[kind],
  }));

  readonly filterDefinitions = computed(() =>
    this.facade.definitionsFor(['programId', 'courseId']),
  );

  /** Seçilen türe göre aday listesi değişir. */
  readonly subjectOptions = computed(() => {
    const refs = this.facade.references();

    switch (this.kindValue() as CompareKind) {
      case 'student':
        return refs.students;
      case 'course':
        return refs.courses;
      case 'exam':
        return refs.exams;
      default:
        return refs.cohorts;
    }
  });

  readonly selectedCount = computed(() => this.subjectsValue().length);

  readonly canCompare = computed(
    () => this.selectedCount() >= MIN_SUBJECTS && this.selectedCount() <= MAX_SUBJECTS,
  );

  readonly selectionHint = computed(() => {
    const count = this.selectedCount();
    if (count < MIN_SUBJECTS) return `En az ${MIN_SUBJECTS} kayıt seçin (${count} seçili).`;
    return `${count} kayıt seçili · en fazla ${MAX_SUBJECTS}`;
  });

  /** Öğrenci listesi yalnızca karşılaştırmada gerekir; talep üzerine doldurulur. */
  readonly studentsMissing = computed(
    () => this.kindValue() === 'student' && this.facade.references().students.length === 0,
  );

  /* ── Grafik ve tablo ───────────────────────────────────────────────────── */

  readonly trendSeries = computed(() =>
    toMultiSeries(
      (this.data()?.subjects ?? []).map((subject) => ({
        name: subject.label,
        points: subject.trend,
      })),
    ),
  );

  readonly trendCategories = computed(() =>
    toTimeCategories(this.data()?.subjects[0]?.trend ?? []),
  );

  /** Metrik satırları: her satır bir ölçüm, her sütun bir taraf. */
  readonly metricRows = computed(() => {
    const subjects = this.data()?.subjects ?? [];
    const first = subjects[0];
    if (!first) return [];

    return first.metrics.map((metric, index) => ({
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
      cells: subjects.map((subject) => {
        const cell = subject.metrics[index];
        return {
          subjectId: subject.id,
          value: cell?.value ?? 0,
          difference: cell?.difference ?? 0,
          measured: (cell?.sampleSize ?? 0) > 0,
        };
      }),
    }));
  });

  readonly exportTable = computed<ExportTable | null>(() => {
    const result = this.data();
    if (!result) return null;

    return {
      fileName: 'karsilastirma',
      columns: ['Ölçüm', 'Birim', ...result.subjects.map((subject) => subject.label)],
      rows: this.metricRows().map((row) => [
        row.label,
        row.unit,
        ...row.cells.map((cell) => (cell.measured ? cell.value : 'ölçüm yok')),
      ]),
    };
  });

  constructor() {
    // Tür değişince önceki seçim anlamsızdır: farklı bir varlık kümesi.
    this.kindControl.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.subjectsControl.setValue([]);
      this.data.set(null);
      this.status.set('idle');
      this.loadStudentOptions();
    });
  }

  ngOnInit(): void {
    this.facade.loadReferences();
    this.loadStudentOptions();
  }

  compare(): void {
    if (!this.canCompare()) return;

    this.facade.load(
      this.facade.reports.compare(
        this.kindControl.value,
        this.subjectsControl.value,
        this.facade.query(),
      ),
      { data: this.data, status: this.status, error: this.errorState },
    );
  }


  onFilterChange(value: AnalyticsFilterValue): void {
    this.facade.setFilters(value);
  }

  onApply(): void {
    if (this.data() !== null) this.compare();
  }

  onReset(): void {
    this.facade.resetFilters();
    this.subjectsControl.setValue([]);
    this.data.set(null);
    this.status.set('idle');
  }

  /** Farkı okunur biçime çevirir; ilk taraf referans olduğu için tire gösterir. */
  differenceLabel(difference: number, index: number): string {
    if (index === 0) return 'referans';
    if (difference === 0) return 'fark yok';
    return difference > 0 ? `+${difference}` : `${difference}`;
  }

  differenceTone(difference: number, index: number): 'up' | 'down' | 'flat' {
    if (index === 0 || difference === 0) return 'flat';
    return difference > 0 ? 'up' : 'down';
  }

  /**
   * Öğrenci seçeneklerini başarı panosundan doldurur.
   *
   * Ayrı bir öğrenci listesi ucu yok; pano zaten kapsam içindeki öğrencileri
   * yetkiye göre süzerek döndürüyor — aynı gizlilik kuralı geçerli olur.
   */
  private loadStudentOptions(): void {
    if (this.kindControl.value !== 'student') return;
    if (this.facade.references().students.length > 0) return;

    this.facade.reports.performers(this.facade.query()).subscribe({
      next: (board) => {
        const rows = [...board.topPerformers, ...board.atRisk];
        const unique = new Map(rows.map((row) => [row.studentId, row.studentName]));

        this.facade.setStudentOptions(
          [...unique].map(([value, label]) => ({ value, label })),
        );
      },
      // Liste dolmazsa çoklu seçim boş kalır; boş durum mesajı devreye girer.
      error: () => undefined,
    });
  }
}
