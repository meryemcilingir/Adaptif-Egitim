import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { ApiError } from '../../../../core/api/api-error';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppPaginationComponent } from '../../../../shared/components/app-pagination/app-pagination.component';
import {
  AnalyticsFilterBarComponent,
  AnalyticsFilterValue,
} from '../../components/analytics/analytics-filter-bar.component';
import { ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';
import {
  HeatmapSelection,
  MasteryHeatmapComponent,
} from '../../components/analytics/mastery-heatmap.component';
import { ReportHeaderComponent } from '../../components/analytics/report-header.component';
import { MatrixData } from '../../models/analytics.model';
import { AnalyticsFacade, ReportStatus } from '../../data-access/analytics.facade';

/**
 * Ustalık ısı haritası (§7).
 *
 * Kazanım × ders matrisi. Hücreye tıklamak kazanım detayına götürür (§15).
 *
 * Boş hücreler sıfır DEĞİL, "ölçüm yok" olarak gösterilir: bir kazanım başka
 * bir dersin kazanımıysa o sütunda değeri olmaması doğaldır ve kırmızıya
 * boyanması yanıltıcı olurdu.
 */
@Component({
  selector: 'app-mastery-heatmap-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnalyticsFilterBarComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppLoadingStateComponent,
    AppPaginationComponent,
    MasteryHeatmapComponent,
    ReportHeaderComponent,
  ],
  templateUrl: './mastery-heatmap.page.html',
  styleUrl: './mastery-heatmap.page.scss',
})
export class MasteryHeatmapPage implements OnInit {
  protected readonly facade = inject(AnalyticsFacade);
  private readonly router = inject(Router);

  private readonly data = signal<MatrixData | null>(null);
  private readonly status = signal<ReportStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly pageState = signal(1);
  private readonly pageSizeState = signal(25);

  readonly matrix = this.data.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly pageSize = this.pageSizeState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.status() === 'loading' && this.data() === null);
  readonly isRefreshing = computed(() => this.status() === 'loading' && this.data() !== null);
  readonly hasError = computed(() => this.status() === 'error');

  readonly filterDefinitions = computed(() =>
    this.facade.definitionsFor(['programId', 'courseId', 'cohortId']),
  );

  /** Ölçülmüş en az bir hücre yoksa matris yerine boş durum gösterilir. */
  readonly hasData = computed(() =>
    (this.data()?.cells ?? []).some((cell) => cell.value !== null),
  );

  /** Sayfalanacak toplam kazanım (satır) sayısı — filtreden sonra kalan. */
  readonly rowCount = computed(() => this.data()?.rows.length ?? 0);

  /*
   * Matris SATIR bazında sayfalanır — sütunlar (dersler) her sayfada aynı
   * kalır. Filtresiz kapsamda 100'ün üzerinde kazanım tek tabloda birikip
   * sayfayı kilometrelerce uzatıyordu; sunucu tarafında sayfalama yoktur
   * (tüm matris tek istekte gelir), bu yüzden dilimleme istemcide yapılır.
   */
  readonly pagedMatrix = computed<MatrixData | null>(() => {
    const matrix = this.data();
    if (!matrix) return null;

    const start = (this.pageState() - 1) * this.pageSizeState();
    const pageRows = matrix.rows.slice(start, start + this.pageSizeState());
    const pageRowIds = new Set(pageRows.map((row) => row.id));

    return {
      columns: matrix.columns,
      rows: pageRows,
      cells: matrix.cells.filter((cell) => pageRowIds.has(cell.rowId)),
    };
  });

  /** Künye için sahte bir meta değil, matristen türetilen gerçek örneklem. */
  readonly meta = computed(() => {
    const cells = this.data()?.cells ?? [];
    const measured = cells.filter((cell) => cell.value !== null);

    return {
      generatedAt: new Date().toISOString(),
      rangeFrom: '',
      rangeTo: '',
      rangeLabel: 'Tüm zamanlar',
      sampleSize: measured.reduce((sum, cell) => sum + cell.sampleSize, 0),
      scopeNote: 'Ustalık skorları anlık hesaplanır; tarih aralığından etkilenmez.',
    };
  });

  readonly exportTable = computed<ExportTable | null>(() => {
    const matrix = this.data();
    if (!matrix) return null;

    return {
      fileName: 'ustalik-matrisi',
      columns: ['Kazanım', 'Başlık', ...matrix.columns],
      rows: matrix.rows.map((row) => [
        row.label,
        row.title,
        ...matrix.columns.map((column) => {
          const cell = matrix.cells.find(
            (item) => item.rowId === row.id && item.columnLabel === column,
          );
          return cell?.value ?? '';
        }),
      ]),
    };
  });

  ngOnInit(): void {
    this.facade.loadReferences();
    this.load();
  }

  load(): void {
    this.pageState.set(1);
    this.facade.load(this.facade.reports.masteryMatrix(this.facade.query()), {
      data: this.data,
      status: this.status,
      error: this.errorState,
    });
  }

  onPageChange(page: number): void {
    this.pageState.set(page);
  }

  onPageSizeChange(size: number): void {
    this.pageSizeState.set(size);
    this.pageState.set(1);
  }

  onFilterChange(value: AnalyticsFilterValue): void {
    this.facade.setFilters(value);
  }

  onApply(): void {
    this.load();
  }

  onReset(): void {
    this.facade.resetFilters();
    this.load();
  }

  onSelect(selection: HeatmapSelection): void {
    void this.router.navigate(['/outcomes', selection.rowId]);
  }
}
