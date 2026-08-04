import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  TemplateRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { ApiError } from '../../../../core/api/api-error';
import { EMPTY_PAGE_REQUEST, PageRequest } from '../../../../core/api/page-request';
import { AppFilterBarComponent } from '../../../../shared/components/app-filter-bar/app-filter-bar.component';
import { FilterDefinition } from '../../../../shared/components/app-filter-bar/filter-definition';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../../shared/components/app-table/column-def';
import {
  AnalyticsFilterBarComponent,
  AnalyticsFilterValue,
} from '../../components/analytics/analytics-filter-bar.component';
import { ExportMenuComponent, ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';
import {
  OUTCOME_STATUSES,
  OUTCOME_STATUS_LABELS,
  OutcomeAnalytics,
  OutcomeStatus,
} from '../../models/analytics.model';
import { AnalyticsFacade } from '../../data-access/analytics.facade';

/**
 * Kazanım analitiği (§4).
 *
 * Liste ekranı olduğu için sayfalama, arama, çoklu filtre ve sıralama ortak
 * `AppTable` altyapısından gelir (§22). Satırlar sunucuda TÜRETİLİR; bu yüzden
 * sayfalama da orada bellek içinde uygulanır.
 *
 * "Kapsama" sütunu kritik: bir kazanım tanımlı olup hiç ölçülmüyorsa müfredat
 * ile sınavlar arasında kopukluk vardır ve bu, düşük ustalıktan daha temel bir
 * sorundur.
 */
@Component({
  selector: 'app-outcome-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnalyticsFilterBarComponent,
    AppFilterBarComponent,
    AppProgressBarComponent,
    AppStatusBadgeComponent,
    AppTableComponent,
    ExportMenuComponent,
  ],
  templateUrl: './outcome-analytics.page.html',
  styleUrl: './outcome-analytics.page.scss',
})
export class OutcomeAnalyticsPage implements OnInit {
  protected readonly facade = inject(AnalyticsFacade);
  private readonly router = inject(Router);

  private readonly codeCell =
    viewChild.required<TemplateRef<{ $implicit: OutcomeAnalytics }>>('codeCell');
  private readonly masteryCell =
    viewChild.required<TemplateRef<{ $implicit: OutcomeAnalytics }>>('masteryCell');
  private readonly coverageCell =
    viewChild.required<TemplateRef<{ $implicit: OutcomeAnalytics }>>('coverageCell');
  private readonly statusCell =
    viewChild.required<TemplateRef<{ $implicit: OutcomeAnalytics }>>('statusCell');

  private readonly rows = signal<readonly OutcomeAnalytics[]>([]);
  private readonly total = signal(0);
  private readonly status = signal<'idle' | 'loading' | 'refreshing' | 'success' | 'error'>('idle');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly page = signal<PageRequest>({
    ...EMPTY_PAGE_REQUEST,
    sort: { field: 'masteryPercent', direction: 'asc' },
  });

  readonly items = this.rows.asReadonly();
  readonly totalCount = this.total.asReadonly();
  readonly tableStatus = this.status.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly query = this.page.asReadonly();

  /** Şablonlar tipsiz satır alır; etiket çevirisi burada yapılır. */
  statusLabel(status: string): string {
    return OUTCOME_STATUS_LABELS[status as OutcomeStatus] ?? status;
  }

  readonly analyticsFilters = computed(() =>
    this.facade.definitionsFor(['programId', 'courseId', 'cohortId']),
  );

  readonly isFiltered = computed(
    () => this.page().search.length > 0 || Object.keys(this.page().filters).length > 0,
  );

  readonly columns = computed<readonly ColumnDef<OutcomeAnalytics>[]>(() => [
    { key: 'outcomeCode', header: 'Kazanım', sortable: true, cell: this.codeCell() },
    {
      key: 'courseCode',
      header: 'Ders',
      width: '110px',
      hideBelow: 'tablet',
      value: (row) => row.courseCode,
    },
    {
      key: 'masteryPercent',
      header: 'Ustalık',
      sortable: true,
      width: '160px',
      cell: this.masteryCell(),
    },
    {
      key: 'coveragePercent',
      header: 'Kapsama',
      sortable: true,
      width: '160px',
      hideBelow: 'laptop',
      cell: this.coverageCell(),
    },
    {
      key: 'examAveragePercent',
      header: 'Sınav başarısı',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '120px',
      hideBelow: 'laptop',
      value: (row) => `%${row.examAveragePercent}`,
    },
    {
      key: 'questionCount',
      header: 'Soru',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '80px',
      hideBelow: 'tablet',
      value: (row) => row.questionCount,
    },
    {
      key: 'recommendationCount',
      header: 'Öneri',
      align: 'end',
      numeric: true,
      width: '80px',
      hideBelow: 'laptop',
      value: (row) => row.recommendationCount,
    },
    { key: 'status', header: 'Durum', width: '140px', cell: this.statusCell() },
  ]);

  readonly tableFilters: readonly FilterDefinition[] = [
    {
      key: 'status',
      label: 'Durum',
      kind: 'multi',
      options: OUTCOME_STATUSES.map((status) => ({
        value: status,
        label: OUTCOME_STATUS_LABELS[status],
      })),
    },
  ];

  readonly exportTable = computed<ExportTable>(() => ({
    fileName: 'kazanim-analizi',
    columns: ['Kazanım', 'Başlık', 'Ders', 'Ustalık %', 'Kapsama %', 'Sınav %', 'Soru', 'Öneri', 'Durum'],
    rows: this.rows().map((row) => [
      row.outcomeCode,
      row.outcomeTitle,
      row.courseCode,
      row.masteryPercent,
      row.coveragePercent,
      row.examAveragePercent,
      row.questionCount,
      row.recommendationCount,
      OUTCOME_STATUS_LABELS[row.status],
    ]),
  }));

  ngOnInit(): void {
    this.facade.loadReferences();
    this.load();
  }

  load(): void {
    this.status.set(this.rows().length > 0 ? 'refreshing' : 'loading');
    this.errorState.set(null);

    this.facade.reports.outcomes(this.facade.query(), this.page()).subscribe({
      next: (response) => {
        this.rows.set(response.items);
        this.total.set(response.total);
        this.status.set('success');
      },
      error: (error: ApiError) => {
        this.errorState.set(error);
        this.status.set('error');
      },
    });
  }

  /* ── Analitik filtreleri ───────────────────────────────────────────────── */

  onAnalyticsFilterChange(value: AnalyticsFilterValue): void {
    this.facade.setFilters(value);
  }

  onApply(): void {
    this.patch({ page: 1 });
  }

  onAnalyticsReset(): void {
    this.facade.resetFilters();
    this.patch({ page: 1 });
  }

  /* ── Tablo filtreleri ──────────────────────────────────────────────────── */

  onSearch(search: string): void {
    this.patch({ search, page: 1 });
  }

  onFilter(key: string, value: PageRequest['filters'][string]): void {
    this.patch({ filters: { ...this.page().filters, [key]: value }, page: 1 });
  }

  onClearFilters(): void {
    this.patch({ search: '', filters: {}, page: 1 });
  }

  onSort(field: string): void {
    const current = this.page().sort;
    const direction = current?.field === field && current.direction === 'asc' ? 'desc' : 'asc';
    this.patch({ sort: { field, direction }, page: 1 });
  }

  onPage(page: number): void {
    this.patch({ page });
  }

  onSize(size: number): void {
    this.patch({ size, page: 1 });
  }

  private patch(patch: Partial<PageRequest>): void {
    this.page.update((current) => ({ ...current, ...patch }));
    this.load();
  }

  /* ── Gösterim ──────────────────────────────────────────────────────────── */

  toneOf(status: OutcomeStatus): 'success' | 'warning' | 'danger' {
    switch (status) {
      case 'strong':
        return 'success';
      case 'average':
        return 'warning';
      default:
        return 'danger';
    }
  }

  /** Hiç ölçülmeyen kazanım, düşük ustalıktan daha temel bir sorundur. */
  coverageTone(percent: number): 'success' | 'warning' | 'danger' {
    if (percent >= 70) return 'success';
    if (percent >= 30) return 'warning';
    return 'danger';
  }

  openOutcome(row: OutcomeAnalytics): void {
    void this.router.navigate(['/outcomes', row.outcomeId]);
  }
}
