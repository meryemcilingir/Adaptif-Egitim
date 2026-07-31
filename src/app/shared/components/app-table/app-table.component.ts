import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { ApiError } from '../../../core/api/api-error';
import { PageRequest, SortSpec } from '../../../core/api/page-request';
import { LoadStatus } from '../../../core/state/entity-store';
import { UiStore } from '../../../core/state/ui.store';
import { AppEmptyStateComponent } from '../app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../app-error-state/app-error-state.component';
import { AppIconComponent } from '../app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../app-loading-state/app-loading-state.component';
import { AppPaginationComponent } from '../app-pagination/app-pagination.component';
import { ColumnDef, columnValue } from './column-def';
import { inject } from '@angular/core';

/**
 * Generic tablo bileşeni.
 *
 * Şartname gereği her tablo ekranında bulunması gereken davranışları TEK yerde toplar:
 * sticky header, sıralama, sayfalama, hover, durum rozetleri, boş/yükleniyor/hata
 * durumları ve dar ekranda kart görünümü (DESIGN_SYSTEM.md §10).
 */
@Component({
  selector: 'app-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    AppPaginationComponent,
    NgTemplateOutlet,
  ],
  templateUrl: './app-table.component.html',
  styleUrl: './app-table.component.scss',
})
export class AppTableComponent<T extends { readonly id: string }> {
  private readonly ui = inject(UiStore);

  readonly columns = input.required<readonly ColumnDef<T>[]>();
  readonly rows = input.required<readonly T[]>();
  readonly query = input.required<PageRequest>();
  readonly total = input.required<number>();
  readonly status = input<LoadStatus>('idle');
  readonly error = input<ApiError | null>(null);

  readonly selectedId = input<string | null>(null);
  readonly rowClickable = input(false);
  readonly showPagination = input(true);
  readonly emptyTitle = input('Kayıt bulunamadı');
  readonly emptyDescription = input('Bu listede henüz kayıt yok.');
  readonly filtered = input(false);
  /** Satır bazlı işlem sürüyorsa o satır soluklaşır ve tıklanamaz. */
  readonly mutatingIds = input<ReadonlySet<string>>(new Set());

  readonly sortChange = output<string>();
  readonly pageChange = output<number>();
  readonly sizeChange = output<number>();
  readonly rowClick = output<T>();
  readonly retry = output<void>();
  readonly clearFilters = output<void>();

  readonly isLoading = computed(() => this.status() === 'loading');
  readonly isRefreshing = computed(() => this.status() === 'refreshing');
  readonly hasError = computed(() => this.status() === 'error');
  readonly isEmpty = computed(
    () => !this.isLoading() && !this.hasError() && this.rows().length === 0,
  );

  /** Dar ekranda tablo yerine kart listesi gösterilir. */
  readonly isCardMode = computed(() => this.ui.isMobile());

  readonly visibleColumns = computed(() => {
    const breakpoint = this.ui.breakpoint();
    return this.columns().filter((column) => {
      if (!column.hideBelow) return true;
      if (column.hideBelow === 'laptop') return breakpoint === 'laptop' || breakpoint === 'desktop';
      return breakpoint !== 'mobile';
    });
  });

  readonly sort = computed<SortSpec | null>(() => this.query().sort);

  ariaSort(column: ColumnDef<T>): 'ascending' | 'descending' | 'none' | null {
    if (!column.sortable) return null;
    const sort = this.sort();
    if (sort?.field !== column.key) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }

  sortIcon(column: ColumnDef<T>): 'arrow-up' | 'arrow-down' | 'arrow-up-down' {
    const sort = this.sort();
    if (sort?.field !== column.key) return 'arrow-up-down';
    return sort.direction === 'asc' ? 'arrow-up' : 'arrow-down';
  }

  cellText(column: ColumnDef<T>, row: T): string {
    return columnValue(column, row);
  }

  /**
   * Satır tıklaması.
   *
   * Hücre içindeki etkileşimli öğeler (aksiyon menüsü, seçim kutusu, favori
   * düğmesi, bağlantı) satır navigasyonunu TETİKLEMEZ; aksi hâlde menüyü açmak
   * istediğinde kullanıcı detay sayfasına savrulur. Kontrol burada yapılır ki
   * her liste ekranı ayrı ayrı `stopPropagation` yazmak zorunda kalmasın.
   */
  onRowClick(row: T, event?: Event): void {
    if (!this.rowClickable() || this.mutatingIds().has(row.id)) return;
    if (event && isInteractiveTarget(event.target)) return;

    this.rowClick.emit(row);
  }

  onRowKeydown(event: KeyboardEvent, row: T): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.onRowClick(row);
  }
}

/** Satır navigasyonunu bastıran öğeler — tıklama bunların üzerindeyse yutulur. */
const INTERACTIVE_SELECTOR =
  'button, a, input, select, textarea, label, [role="menu"], [contenteditable="true"]';

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(INTERACTIVE_SELECTOR) !== null;
}
