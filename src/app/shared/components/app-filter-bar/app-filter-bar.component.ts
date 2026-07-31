import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';

import { FilterValue, PageRequest, countActiveFilters } from '../../../core/api/page-request';
import { AppButtonComponent } from '../app-button/app-button.component';
import { AppIconComponent } from '../app-icon/app-icon.component';
import { FilterDefinition, FilterOption } from './filter-definition';

/**
 * Arama + çoklu filtre çubuğu.
 *
 * Arama girişi 300 ms geciktirilir; her tuş vuruşunda istek atılmaz.
 * Aktif filtre sayısı rozet olarak gösterilir, tek tıkla temizlenir.
 */
@Component({
  selector: 'app-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppIconComponent],
  templateUrl: './app-filter-bar.component.html',
  styleUrl: './app-filter-bar.component.scss',
})
export class AppFilterBarComponent {
  readonly query = input.required<PageRequest>();
  readonly filters = input<readonly FilterDefinition[]>([]);
  readonly searchPlaceholder = input('Ara…');
  readonly disabled = input(false);

  readonly searchChange = output<string>();
  readonly filterChange = output<{ key: string; value: FilterValue }>();
  readonly clearAll = output<void>();

  private readonly openKey = signal<string | null>(null);
  private readonly searchDraft = signal('');
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;

  readonly activeCount = computed(() => countActiveFilters(this.query()));
  readonly hasActiveFilters = computed(
    () => this.activeCount() > 0 || this.query().search.trim().length > 0,
  );

  constructor() {
    // Dışarıdan (ör. URL'den) gelen arama değeri girişe yansıtılır.
    effect(() => this.searchDraft.set(this.query().search));
  }

  readonly draft = this.searchDraft.asReadonly();

  isOpen(key: string): boolean {
    return this.openKey() === key;
  }

  toggle(key: string): void {
    this.openKey.update((current) => (current === key ? null : key));
  }

  close(): void {
    this.openKey.set(null);
  }

  selectedValues(key: string): readonly string[] {
    const value = this.query().filters[key];
    if (value === null || value === undefined || value === '') return [];
    return Array.isArray(value) ? value : [String(value)];
  }

  isSelected(key: string, option: FilterOption): boolean {
    return this.selectedValues(key).includes(option.value);
  }

  selectionLabel(definition: FilterDefinition): string {
    const selected = this.selectedValues(definition.key);
    if (selected.length === 0) return definition.label;
    if (selected.length === 1) {
      const option = (definition.options ?? []).find((item) => item.value === selected[0]);
      return `${definition.label}: ${option?.label ?? selected[0]}`;
    }
    return `${definition.label} (${selected.length})`;
  }

  /* ── Anahtar (boolean) filtreler ─────────────────────────────────────── */

  isFlagOn(key: string): boolean {
    const value = this.query().filters[key];
    return value === true || value === 'true';
  }

  /** Kapatırken değer `null` yazılır; boş filtre sorguya hiç eklenmez. */
  onFlagToggle(definition: FilterDefinition): void {
    this.filterChange.emit({
      key: definition.key,
      value: this.isFlagOn(definition.key) ? null : 'true',
    });
  }

  onOptionToggle(definition: FilterDefinition, option: FilterOption): void {
    if (definition.kind === 'single') {
      const next = this.isSelected(definition.key, option) ? null : option.value;
      this.filterChange.emit({ key: definition.key, value: next });
      this.close();
      return;
    }

    const selected = this.selectedValues(definition.key);
    const next = selected.includes(option.value)
      ? selected.filter((value) => value !== option.value)
      : [...selected, option.value];

    this.filterChange.emit({ key: definition.key, value: next.length > 0 ? next : null });
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchDraft.set(value);

    if (this.debounceHandle !== null) clearTimeout(this.debounceHandle);
    this.debounceHandle = setTimeout(() => this.searchChange.emit(value), 300);
  }

  onClearAll(): void {
    this.searchDraft.set('');
    this.clearAll.emit();
    this.close();
  }
}
