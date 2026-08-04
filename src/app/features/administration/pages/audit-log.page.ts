import { ChangeDetectionStrategy, Component, OnInit, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';

import { FilterValue } from '../../../core/api/page-request';
import {
  AUDIT_ACTION_LABELS,
  AUDIT_MODULE_LABELS,
  AUDIT_MODULES,
  AuditAction,
} from '../../../core/observability/audit.model';
import { AppButtonComponent } from '../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../shared/components/app-card/app-card.component';
import { AppFilterBarComponent } from '../../../shared/components/app-filter-bar/app-filter-bar.component';
import { FilterDefinition } from '../../../shared/components/app-filter-bar/filter-definition';
import {
  ExportMenuComponent,
  ExportTable,
} from '../../../shared/components/app-export-menu/app-export-menu.component';
import { AppIconComponent } from '../../../shared/components/app-icon/app-icon.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../shared/components/app-table/column-def';
import { AppTabsComponent, TabItem } from '../../../shared/components/app-tabs/app-tabs.component';
import { ActivityTimelineComponent } from '../components/activity-timeline.component';
import { AuditRow } from '../models/admin.model';
import { AuditFacade } from '../data-access/audit.facade';

const VIEWS: readonly TabItem[] = [
  { id: 'table', label: 'Liste', icon: 'layout-list' },
  { id: 'timeline', label: 'Zaman çizelgesi', icon: 'history' },
];

/**
 * Denetim kaydı (Sprint 9 §10, §11).
 *
 * İki görünüm aynı veriyi farklı sorular için sunar: liste "belirli bir
 * işlemi bul", çizelge "ne sırayla oldu". İki ayrı ekran yapmak, filtreleri de
 * ikiye bölerdi.
 *
 * Kayıtlar YALNIZCA okunur; denetim izinin düzenlenebilir olması onu denetim
 * olmaktan çıkarır. Ekranda hiçbir düzenleme veya silme işlemi yoktur.
 */
@Component({
  selector: 'app-audit-log-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActivityTimelineComponent,
    AppButtonComponent,
    AppCardComponent,
    AppFilterBarComponent,
    AppIconComponent,
    AppStatusBadgeComponent,
    AppTableComponent,
    AppTabsComponent,
    ExportMenuComponent,
  ],
  templateUrl: './audit-log.page.html',
  styleUrl: './audit-log.page.scss',
})
export class AuditLogPage implements OnInit {
  protected readonly facade = inject(AuditFacade);

  private readonly actionCell = viewChild.required<TemplateRef<{ $implicit: AuditRow }>>('actionCell');
  private readonly actorCell = viewChild.required<TemplateRef<{ $implicit: AuditRow }>>('actorCell');
  private readonly resultCell = viewChild.required<TemplateRef<{ $implicit: AuditRow }>>('resultCell');

  private readonly viewState = signal('table');
  private readonly expandedState = signal<string | null>(null);

  readonly views = VIEWS;
  readonly view = this.viewState.asReadonly();
  readonly expandedId = this.expandedState.asReadonly();

  readonly rows = this.facade.rows;
  readonly total = this.facade.total;
  readonly status = this.facade.status;
  readonly error = this.facade.error;
  readonly query = this.facade.query;
  readonly isFiltered = this.facade.isFiltered;

  readonly timeline = this.facade.timeline;
  readonly timelineStatus = this.facade.timelineStatus;

  readonly columns = computed<readonly ColumnDef<AuditRow>[]>(() => [
    {
      key: 'createdAt',
      header: 'Zaman',
      sortable: true,
      width: '150px',
      value: (row) => formatDateTime(row.createdAt),
    },
    { key: 'action', header: 'İşlem', sortable: true, cell: this.actionCell() },
    { key: 'actorName', header: 'Kullanıcı', sortable: true, width: '190px', cell: this.actorCell() },
    {
      key: 'targetLabel',
      header: 'Hedef',
      width: '220px',
      hideBelow: 'laptop',
      value: (row) => row.targetLabel,
    },
    {
      key: 'ipAddress',
      header: 'IP',
      width: '120px',
      hideBelow: 'laptop',
      value: (row) => row.ipAddress,
    },
    { key: 'success', header: 'Sonuç', width: '110px', cell: this.resultCell() },
  ]);

  readonly filters: readonly FilterDefinition[] = [
    {
      key: 'module',
      label: 'Modül',
      kind: 'multi',
      options: AUDIT_MODULES.map((module) => ({
        value: module,
        label: AUDIT_MODULE_LABELS[module] ?? module,
      })),
    },
    {
      key: 'result',
      label: 'Sonuç',
      kind: 'multi',
      options: [
        { value: 'success', label: 'Başarılı' },
        { value: 'failure', label: 'Başarısız' },
      ],
    },
  ];

  readonly exportTable = computed<ExportTable | null>(() => {
    const rows = this.rows();
    if (rows.length === 0) return null;

    return {
      fileName: 'denetim-kaydi',
      columns: ['Zaman', 'İşlem', 'Modül', 'Kullanıcı', 'Rol', 'Hedef', 'IP', 'Sonuç', 'Gerekçe'],
      rows: rows.map((row) => [
        formatDateTime(row.createdAt),
        row.actionLabel,
        row.module,
        row.actorName,
        row.actorRole,
        row.targetLabel,
        row.ipAddress,
        row.success ? 'Başarılı' : 'Başarısız',
        row.reason ?? '',
      ]),
    };
  });

  ngOnInit(): void {
    this.facade.load();
  }

  onView(id: string): void {
    this.viewState.set(id);

    // Çizelge ilk açıldığında yüklenir; her sekme geçişinde yeniden çekilmez.
    if (id === 'timeline' && this.timeline().length === 0) this.facade.loadTimeline();
  }

  /** Satır genişletilince eski ↔ yeni değer farkı görünür. */
  toggleRow(row: AuditRow): void {
    this.expandedState.update((current) => (current === row.id ? null : row.id));
  }

  changesOf(id: string) {
    return this.facade.eventById(id)?.changes ?? [];
  }

  actionLabel(action: string): string {
    return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
  }

  onSearch(term: string): void {
    this.facade.search(term);
  }

  onFilter(key: string, value: FilterValue): void {
    this.facade.setFilter(key, value);
  }

  onClearFilters(): void {
    this.facade.clearFilters();
  }

  onSort(field: string): void {
    this.facade.sort(field);
  }

  onPage(page: number): void {
    this.facade.goToPage(page);
  }

  onSize(size: number): void {
    this.facade.setPageSize(size);
  }

  refreshTimeline(): void {
    this.facade.loadTimeline();
  }
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
