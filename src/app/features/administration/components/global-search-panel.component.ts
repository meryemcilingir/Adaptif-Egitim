import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AppIconComponent } from '../../../shared/components/app-icon/app-icon.component';
import {
  GlobalSearchResult,
  SEARCH_CATEGORY_ICONS,
  SEARCH_CATEGORY_LABELS,
} from '../models/admin.model';

/**
 * Genel arama sonuç paneli (Sprint 9 §13).
 *
 * Sonuçlar KATEGORİ başlıkları altında gruplanır: tek bir düz listede "MAT101"
 * yazan üç satırın hangisinin ders, hangisinin sınav olduğu anlaşılmaz.
 *
 * Kategori başına gösterilen sonuç kırpılırsa kaç sonucun gizlendiği yazılır —
 * kullanıcı listenin tamamını gördüğünü sanmamalıdır.
 */
@Component({
  selector: 'app-global-search-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, RouterLink],
  templateUrl: './global-search-panel.component.html',
  styleUrl: './global-search-panel.component.scss',
})
export class GlobalSearchPanelComponent {
  readonly result = input<GlobalSearchResult | null>(null);
  readonly loading = input(false);
  /** Kullanıcının yazdığı ham metin — henüz arama yapılmamış durumu ayırt etmek için. */
  readonly term = input('');

  readonly navigate = output<void>();

  readonly categoryLabels = SEARCH_CATEGORY_LABELS;
  readonly categoryIcons = SEARCH_CATEGORY_ICONS;

  readonly isTooShort = computed(() => this.term().trim().length > 0 && this.term().trim().length < 2);
  readonly isEmpty = computed(() => {
    const result = this.result();
    return result !== null && result.totalHits === 0;
  });

  /** Kırpılan sonuç sayısı — "ve 12 tane daha" satırı için. */
  hiddenCount(shown: number, total: number): number {
    return Math.max(0, total - shown);
  }
}
