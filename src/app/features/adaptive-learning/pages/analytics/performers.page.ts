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
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppProgressBarComponent } from '../../../../shared/components/app-progress-bar/app-progress-bar.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import {
  AnalyticsFilterBarComponent,
  AnalyticsFilterValue,
} from '../../components/analytics/analytics-filter-bar.component';
import { ExportMenuComponent, ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';
import { PerformerRow } from '../../models/analytics.model';
import { AnalyticsFacade, ReportStatus } from '../../data-access/analytics.facade';
import { PerformerBoardResponse } from '../../data-access/analytics.repository';

/**
 * Başarı panosu ve risk listesi (§11).
 *
 * Risk listesi bir YAFTA DEĞİL, bir çağrıdır: her satır hangi ölçümün eşiği
 * altında kaldığını yazar. Gerekçesiz "riskli" etiketi, öğretim elemanına ne
 * yapacağını söylemez ve öğrenci için haksız bir damgadır.
 *
 * Bir öğrenci en az iki sinyalde eşiğin altındaysa listeye girer; tek düşük
 * ölçüm (bir kötü sınav) tek başına risk sayılmaz.
 */
@Component({
  selector: 'app-performers-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AnalyticsFilterBarComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    AppProgressBarComponent,
    AppStatusBadgeComponent,
    ExportMenuComponent,
  ],
  templateUrl: './performers.page.html',
  styleUrl: './performers.page.scss',
})
export class PerformersPage implements OnInit {
  protected readonly facade = inject(AnalyticsFacade);
  private readonly router = inject(Router);

  private readonly data = signal<PerformerBoardResponse | null>(null);
  private readonly status = signal<ReportStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);

  readonly board = this.data.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.status() === 'loading' && this.data() === null);
  readonly isRefreshing = computed(() => this.status() === 'loading' && this.data() !== null);
  readonly hasError = computed(() => this.status() === 'error');

  readonly filterDefinitions = computed(() =>
    this.facade.definitionsFor(['programId', 'courseId', 'cohortId']),
  );

  readonly isEmpty = computed(() => (this.data()?.studentCount ?? 0) === 0);

  /**
   * Risk oranı — payda ÖLÇÜLEBİLEN öğrenci sayısıdır.
   *
   * Hiç ölçümü olmayan öğrencileri paydaya katmak, risk oranını yapay olarak
   * düşürür ve gerçek durumu olduğundan iyi gösterirdi.
   */
  readonly riskShare = computed(() => {
    const board = this.data();
    if (!board || board.measuredCount === 0) return 0;
    return Math.round((board.atRiskCount / board.measuredCount) * 100);
  });

  readonly exportTable = computed<ExportTable | null>(() => {
    const board = this.data();
    if (!board) return null;

    const toRow = (row: PerformerRow, group: string) => [
      group,
      row.studentName,
      row.cohortName,
      row.compositeScore,
      row.masteryPercent,
      row.examAveragePercent,
      row.completionRate,
      row.riskReasons.join(' | '),
    ];

    return {
      fileName: 'basari-panosu',
      columns: [
        'Liste',
        'Öğrenci',
        'Grup',
        'Bileşik skor',
        'Ustalık %',
        'Sınav ort. %',
        'Tamamlama %',
        'Risk gerekçeleri',
      ],
      rows: [
        ...board.topPerformers.map((row) => toRow(row, 'Başarılı')),
        ...board.atRisk.map((row) => toRow(row, 'Riskli')),
      ],
    };
  });

  ngOnInit(): void {
    this.facade.loadReferences();
    this.load();
  }

  load(): void {
    this.facade.load(this.facade.reports.performers(this.facade.query()), {
      data: this.data,
      status: this.status,
      error: this.errorState,
    });
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

  openStudent(row: PerformerRow): void {
    void this.router.navigate(['/student', row.studentId, 'analytics']);
  }
}
