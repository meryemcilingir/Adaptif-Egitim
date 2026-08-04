import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { FilterValue, PageRequest, countActiveFilters } from '../../../core/api/page-request';
import { AppButtonComponent } from '../app-button/app-button.component';
import { AppIconComponent } from '../app-icon/app-icon.component';
import { PanelPlacement, placePanel } from '../../utils/panel-position';
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
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close()',
    /* Panel `fixed` konumlandığı için sayfa kaydıkça yeniden hesaplanır. */
    '(window:scroll)': 'reposition()',
    '(window:resize)': 'reposition()',
  },
})
export class AppFilterBarComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly query = input.required<PageRequest>();
  readonly filters = input<readonly FilterDefinition[]>([]);
  readonly searchPlaceholder = input('Ara…');
  readonly disabled = input(false);

  readonly searchChange = output<string>();
  readonly filterChange = output<{ key: string; value: FilterValue }>();
  readonly clearAll = output<void>();

  private readonly openKey = signal<string | null>(null);
  private readonly placementState = signal<PanelPlacement | null>(null);
  private openTrigger: HTMLElement | null = null;
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

  readonly placement = this.placementState.asReadonly();

  toggle(key: string, event: Event): void {
    const opening = this.openKey() !== key;

    this.openKey.set(opening ? key : null);
    this.openTrigger = opening ? (event.currentTarget as HTMLElement) : null;

    /*
     * Konum, panel DOM'a girdikten SONRA hesaplanır.
     *
     * `effect` ve `queueMicrotask` denendi: ikisi de panel şablona işlenmeden
     * çalışıp ölçümü boşa düşürüyordu. `afterNextRender` bir sonraki render
     * geçişinin ardından koşar; panel o anda kesin olarak ölçülebilir.
     */
    if (opening) afterNextRender(() => this.reposition(), { injector: this.injector });
  }

  close(): void {
    this.openKey.set(null);
    this.openTrigger = null;
    this.placementState.set(null);
  }

  /**
   * Paneli tetikleyiciye göre yerleştirir.
   *
   * `fixed` konumlandırma, panelin tablo gibi kaydırma kaplarının dışına
   * taşabilmesi için gerekli (ADR-074); karşılığında konum burada hesaplanır.
   */
  reposition(): void {
    const trigger = this.openTrigger;
    if (!trigger) return;

    const panel = this.host.nativeElement.querySelector<HTMLElement>('.filter__menu');
    if (!panel) return;

    const rect = trigger.getBoundingClientRect();

    this.placementState.set(
      placePanel({
        trigger: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        panelWidth: panel.offsetWidth,
        /* Ölçüm kısıtsız yapılır: kısılmış yükseklik yeni ölçümü etkilemesin. */
        panelHeight: panel.scrollHeight,
      }),
    );
  }

  /**
   * Dışarı tıklayınca menü kapanır.
   *
   * Menü yalnızca tetikleyiciye yeniden basılınca kapanıyordu; kullanıcı
   * sayfanın başka bir yerine tıkladığında açık kalıp içeriği örtüyordu.
   */
  onDocumentClick(event: MouseEvent): void {
    if (this.openKey() === null) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
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
