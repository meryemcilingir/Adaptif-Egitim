import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { PAGE_SIZE_OPTIONS } from '../../../core/api/page-request';
import { AppButtonComponent } from '../app-button/app-button.component';

/** Sayfa aralığında gösterilecek en fazla numara kutusu. */
const MAX_VISIBLE_PAGES = 5;

@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent],
  templateUrl: './app-pagination.component.html',
  styleUrl: './app-pagination.component.scss',
})
export class AppPaginationComponent {
  readonly page = input.required<number>();
  readonly size = input.required<number>();
  readonly total = input.required<number>();
  readonly disabled = input(false);

  readonly pageChange = output<number>();
  readonly sizeChange = output<number>();

  readonly sizeOptions = PAGE_SIZE_OPTIONS;

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.total() / this.size())));
  readonly firstItem = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.size() + 1,
  );
  readonly lastItem = computed(() => Math.min(this.total(), this.page() * this.size()));

  readonly canGoPrevious = computed(() => this.page() > 1 && !this.disabled());
  readonly canGoNext = computed(() => this.page() < this.pageCount() && !this.disabled());

  /** Aktif sayfa ortada kalacak biçimde kayan numara penceresi. */
  readonly visiblePages = computed(() => {
    const count = this.pageCount();
    const current = this.page();
    const half = Math.floor(MAX_VISIBLE_PAGES / 2);

    let start = Math.max(1, current - half);
    const end = Math.min(count, start + MAX_VISIBLE_PAGES - 1);
    start = Math.max(1, end - MAX_VISIBLE_PAGES + 1);

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  onSizeChange(event: Event): void {
    this.sizeChange.emit(Number((event.target as HTMLSelectElement).value));
  }
}
