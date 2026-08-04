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
import { createPageRequest, EMPTY_PAGE_REQUEST, PageRequest } from '../../../../core/api/page-request';
import { AppFilterBarComponent } from '../../../../shared/components/app-filter-bar/app-filter-bar.component';
import { FilterDefinition } from '../../../../shared/components/app-filter-bar/filter-definition';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../../shared/components/app-table/column-def';
import { ExportMenuComponent, ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';
import {
  ITEM_FLAGS,
  ITEM_FLAG_LABELS,
  ItemAnalysis,
  ItemFlag,
} from '../../models/item-analysis.model';
import { QUESTION_TYPES, QUESTION_TYPE_LABELS } from '../../models/question.model';
import { CourseRepository } from '../../data-access/catalog.repository';
import { AnalyticsFacade } from '../../data-access/analytics.facade';

/**
 * Madde analizi (§5).
 *
 * Her soru için doğru/yanlış oranı, çözüm süresi, zorluk ve ayırt edicilik.
 * Sıralama VARSAYILAN OLARAK ayırt ediciliğe göre artan: en sorunlu maddeler
 * üstte durur, çünkü bu ekranın amacı iyi soruları kutlamak değil, kötüleri
 * bulmaktır.
 */
@Component({
  selector: 'app-item-analysis-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppFilterBarComponent,
    AppStatusBadgeComponent,
    AppTableComponent,
    ExportMenuComponent,
  ],
  templateUrl: './item-analysis.page.html',
  styleUrl: './item-analysis.page.scss',
})
export class ItemAnalysisPage implements OnInit {
  private readonly facade = inject(AnalyticsFacade);
  private readonly courses = inject(CourseRepository);
  private readonly router = inject(Router);

  private readonly questionCell =
    viewChild.required<TemplateRef<{ $implicit: ItemAnalysis }>>('questionCell');
  private readonly ratesCell =
    viewChild.required<TemplateRef<{ $implicit: ItemAnalysis }>>('ratesCell');
  private readonly qualityCell =
    viewChild.required<TemplateRef<{ $implicit: ItemAnalysis }>>('qualityCell');
  private readonly flagsCell =
    viewChild.required<TemplateRef<{ $implicit: ItemAnalysis }>>('flagsCell');

  private readonly rows = signal<readonly ItemAnalysis[]>([]);
  private readonly total = signal(0);
  private readonly status = signal<'idle' | 'loading' | 'refreshing' | 'success' | 'error'>('idle');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly page = signal<PageRequest>({
    ...EMPTY_PAGE_REQUEST,
    sort: { field: 'discrimination', direction: 'asc' },
  });

  private readonly courseOptions = signal<readonly { value: string; label: string }[]>([]);

  readonly items = this.rows.asReadonly();
  readonly totalCount = this.total.asReadonly();
  readonly tableStatus = this.status.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly query = this.page.asReadonly();

  /** Şablonlar tipsiz satır alır; etiket çevirisi burada yapılır. */
  flagLabel(flag: string): string {
    return ITEM_FLAG_LABELS[flag as ItemFlag] ?? flag;
  }

  readonly isFiltered = computed(
    () => this.page().search.length > 0 || Object.keys(this.page().filters).length > 0,
  );

  readonly columns = computed<readonly ColumnDef<ItemAnalysis>[]>(() => [
    { key: 'questionCode', header: 'Soru', sortable: true, cell: this.questionCell() },
    {
      key: 'outcomeCode',
      header: 'Kazanım',
      width: '120px',
      hideBelow: 'tablet',
      value: (row) => row.outcomeCode,
    },
    { key: 'rates', header: 'Doğru / Yanlış', width: '170px', cell: this.ratesCell() },
    {
      key: 'averageTimeSeconds',
      header: 'Ort. süre',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '100px',
      hideBelow: 'laptop',
      value: (row) => `${row.averageTimeSeconds} sn`,
    },
    { key: 'discrimination', header: 'Madde kalitesi', sortable: true, width: '180px', cell: this.qualityCell() },
    {
      key: 'sampleSize',
      header: 'Örneklem',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '100px',
      hideBelow: 'laptop',
      value: (row) => row.sampleSize,
    },
    { key: 'flags', header: 'Uyarı', width: '150px', cell: this.flagsCell() },
  ]);

  readonly filters = computed<readonly FilterDefinition[]>(() => [
    {
      key: 'courseId',
      label: 'Ders',
      kind: 'single',
      options: this.courseOptions().map((option) => ({
        value: option.value,
        label: option.label,
      })),
    },
    {
      key: 'type',
      label: 'Soru türü',
      kind: 'multi',
      options: QUESTION_TYPES.map((type) => ({
        value: type,
        label: QUESTION_TYPE_LABELS[type],
      })),
    },
    {
      key: 'flags',
      label: 'Uyarı',
      kind: 'multi',
      options: ITEM_FLAGS.map((flag) => ({ value: flag, label: ITEM_FLAG_LABELS[flag] })),
    },
  ]);

  readonly exportTable = computed<ExportTable>(() => ({
    fileName: 'madde-analizi',
    columns: [
      'Soru kodu',
      'Kazanım',
      'Doğru %',
      'Yanlış %',
      'Ort. süre (sn)',
      'Zorluk indeksi',
      'Ayırt edicilik',
      'Örneklem',
      'Uyarılar',
    ],
    rows: this.rows().map((row) => [
      row.questionCode,
      row.outcomeCode,
      this.correctRate(row),
      100 - this.correctRate(row),
      row.averageTimeSeconds,
      row.difficultyIndex.toFixed(2),
      row.discrimination.toFixed(2),
      row.sampleSize,
      row.flags.map((flag) => ITEM_FLAG_LABELS[flag]).join(' / '),
    ]),
  }));

  ngOnInit(): void {
    this.load();

    this.courses.list(createPageRequest({ size: 200 })).subscribe({
      next: (page) =>
        this.courseOptions.set(
          page.items.map((course) => ({
            value: course.id,
            label: `${course.code} · ${course.name}`,
          })),
        ),
    });
  }

  load(): void {
    this.status.set(this.rows().length > 0 ? 'refreshing' : 'loading');
    this.errorState.set(null);

    this.facade.reports.items(this.page()).subscribe({
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

  /* ── Tablo etkileşimi ──────────────────────────────────────────────────── */

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

  /** Zorluk indeksi = doğru cevaplama oranı; yüzdeye çevrilir. */
  correctRate(row: ItemAnalysis): number {
    return Math.round(row.difficultyIndex * 100);
  }

  /**
   * Ayırt edicilik yorumu.
   *
   * Eşikler klasik madde analizi literatüründen: 0.4 üstü çok iyi, 0.2 altı
   * gözden geçirilmeli. Ham sayı tek başına çoğu okuyucuya bir şey söylemez.
   */
  qualityLabel(discrimination: number): string {
    if (discrimination >= 0.4) return 'Çok iyi';
    if (discrimination >= 0.3) return 'İyi';
    if (discrimination >= 0.2) return 'Kabul edilebilir';
    if (discrimination >= 0.1) return 'Sınırda';
    return 'Zayıf';
  }

  qualityTone(discrimination: number): 'success' | 'warning' | 'danger' {
    if (discrimination >= 0.3) return 'success';
    if (discrimination >= 0.2) return 'warning';
    return 'danger';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('tr-TR');
  }

  openQuestion(row: ItemAnalysis): void {
    void this.router.navigate(['/questions', row.questionId]);
  }
}
