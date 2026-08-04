import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';

import { ApiError } from '../../../../core/api/api-error';
import { ToastStore } from '../../../../core/observability/toast.store';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import {
  ReportBuilderComponent,
  ReportDraft,
} from '../../components/analytics/report-builder.component';
import {
  REPORT_FREQUENCY_LABELS,
  REPORT_WIDGET_LABELS,
  SavedReport,
} from '../../models/analytics.model';
import {
  RANGE_PRESETS,
  RANGE_PRESET_LABELS,
  RangePreset,
} from '../../domain/analytics-range';
import { AnalyticsFacade, ReportStatus } from '../../data-access/analytics.facade';

/** Tarih aralığı, boyut filtrelerinden AYRI saklanır; ikisi karışmamalı. */
const RANGE_KEYS = ['preset', 'from', 'to'] as const;

/** Rapor kaynağını ilgili analitik ekranına eşler (§15 drill-down). */
const SOURCE_ROUTES: Readonly<Record<string, string>> = {
  overview: '/analytics',
  trends: '/analytics/trends',
  outcomes: '/analytics/outcomes',
  difficulty: '/analytics/difficulty',
  'mastery-matrix': '/analytics/mastery',
  recommendations: '/analytics/recommendations',
  velocity: '/analytics/velocity',
  performers: '/analytics/performers',
};

/**
 * Kayıtlı ve zamanlanmış raporlar (§18-20).
 *
 * Raporlar KİŞİSELDİR: sunucu yalnızca çağıranın raporlarını döndürür, bu
 * yüzden ekranda paylaşım kavramı yoktur. Zamanlama gerçek bir işi tetiklemez;
 * her zamanlanmış rapor kartı bunu açıkça yazar.
 */
@Component({
  selector: 'app-saved-reports-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    AppStatusBadgeComponent,
    DatePipe,
    ReportBuilderComponent,
  ],
  templateUrl: './saved-reports.page.html',
  styleUrl: './saved-reports.page.scss',
})
export class SavedReportsPage implements OnInit {
  protected readonly facade = inject(AnalyticsFacade);
  private readonly router = inject(Router);
  private readonly dialog = inject(DialogService);
  private readonly toast = inject(ToastStore);

  private readonly data = signal<readonly SavedReport[] | null>(null);
  private readonly status = signal<ReportStatus>('idle');
  private readonly errorState = signal<ApiError | null>(null);

  private readonly builderState = signal<{ open: boolean; report: SavedReport | null }>({
    open: false,
    report: null,
  });
  private readonly savingState = signal(false);

  readonly reports = computed(() => this.data() ?? []);
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.status() === 'loading' && this.data() === null);
  readonly hasError = computed(() => this.status() === 'error');
  readonly isEmpty = computed(() => this.status() === 'success' && this.reports().length === 0);

  readonly builder = this.builderState.asReadonly();
  readonly saving = this.savingState.asReadonly();

  readonly widgetLabels = REPORT_WIDGET_LABELS;

  /**
   * Rapor oluşturucuya verilen filtre kümesi.
   *
   * Boyut seçimlerinin YANINDA tarih aralığı da saklanır; rapor yeniden
   * çalıştırıldığında kaydedildiği dönemi geri getirsin diye.
   */
  readonly builderFilters = computed<Record<string, string>>(() => {
    const { range, selections } = this.facade.filters();
    const filters: Record<string, string> = { ...selections, preset: range.preset };

    if (range.preset === 'custom') {
      if (range.from) filters['from'] = range.from;
      if (range.to) filters['to'] = range.to;
    }

    return filters;
  });

  /** Zamanlanmış raporlar ayrı sayılır: takip edilmesi gereken şeyler onlar. */
  readonly scheduledCount = computed(
    () => this.reports().filter((report) => report.schedule !== null).length,
  );

  ngOnInit(): void {
    this.facade.loadReferences();
    this.load();
  }

  load(): void {
    this.facade.load(this.facade.reports.savedReports(), {
      data: this.data,
      status: this.status,
      error: this.errorState,
    });
  }

  openBuilder(report: SavedReport | null): void {
    this.builderState.set({ open: true, report });
  }

  closeBuilder(): void {
    this.builderState.set({ open: false, report: null });
  }

  onSave(draft: ReportDraft): void {
    const editing = this.builderState().report;
    this.savingState.set(true);

    const request = editing
      ? this.facade.reports.updateReport(editing.id, draft)
      : this.facade.reports.createReport(draft);

    request.subscribe({
      next: () => {
        this.savingState.set(false);
        this.closeBuilder();
        this.toast.success(editing ? 'Rapor güncellendi.' : 'Rapor oluşturuldu.');
        this.load();
      },
      error: (error: ApiError) => {
        this.savingState.set(false);
        this.toast.error(error.message);
      },
    });
  }

  async remove(report: SavedReport): Promise<void> {
    const confirmed = await this.dialog.confirm({
      title: 'Rapor silinsin mi?',
      message: `“${report.name}” kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (!confirmed) return;

    this.facade.reports.deleteReport(report.id).subscribe({
      next: () => {
        this.toast.success('Rapor silindi.');
        this.load();
      },
      error: (error: ApiError) => this.toast.error(error.message),
    });
  }

  /**
   * Raporu çalıştırır.
   *
   * Kayıtlı filtreler ORTAK filtre durumuna yazılır, sonra ilk bileşenin veri
   * kaynağına gidilir — böylece açılan ekran raporun kaydedildiği kapsamı
   * gösterir, varsayılan kapsamı değil.
   */
  run(report: SavedReport): void {
    this.facade.setFilters({
      range: this.rangeOf(report),
      selections: this.selectionsOf(report),
    });

    const source = report.widgets[0]?.source ?? 'overview';
    void this.router.navigate([SOURCE_ROUTES[source] ?? '/analytics']);
  }

  scheduleLabel(report: SavedReport): string {
    const schedule = report.schedule;
    if (!schedule) return 'Zamanlama yok';

    const frequency = REPORT_FREQUENCY_LABELS[schedule.frequency];
    const day =
      schedule.frequency === 'weekly'
        ? WEEKDAYS[schedule.dayOfPeriod - 1] ?? `${schedule.dayOfPeriod}. gün`
        : `ayın ${schedule.dayOfPeriod}. günü`;

    return `${frequency} · ${day} · ${String(schedule.hour).padStart(2, '0')}:00`;
  }

  /** Kaydedilmiş boyut filtrelerini okunur etikete çevirir. */
  filterLabels(report: SavedReport): readonly string[] {
    return Object.entries(this.selectionsOf(report)).map(([key, value]) => {
      const definition = this.facade.definitionsFor([key])[0];
      const option = definition?.options.find((item) => item.value === value);
      return `${definition?.label ?? key}: ${option?.label ?? value}`;
    });
  }

  /** Raporun kaydedildiği dönem — geçersiz bir değer varsa mevcut dönem korunur. */
  rangeLabel(report: SavedReport): string {
    return RANGE_PRESET_LABELS[this.rangeOf(report).preset];
  }

  private rangeOf(report: SavedReport) {
    const preset = report.filters['preset'];

    if (!isRangePreset(preset)) return this.facade.filters().range;

    return {
      preset,
      from: report.filters['from'] ?? null,
      to: report.filters['to'] ?? null,
    };
  }

  private selectionsOf(report: SavedReport): Record<string, string> {
    return Object.fromEntries(
      Object.entries(report.filters).filter(
        ([key]) => !RANGE_KEYS.includes(key as (typeof RANGE_KEYS)[number]),
      ),
    );
  }
}

const WEEKDAYS = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
] as const;

function isRangePreset(value: string | undefined): value is RangePreset {
  return value !== undefined && RANGE_PRESETS.includes(value as RangePreset);
}
