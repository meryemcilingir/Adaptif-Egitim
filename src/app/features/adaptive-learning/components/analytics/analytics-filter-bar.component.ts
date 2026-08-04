import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import {
  RANGE_PRESETS,
  RANGE_PRESET_LABELS,
  RangePreset,
  RangeSelection,
  formatRange,
  resolveRange,
  validateRange,
} from '../../domain/analytics-range';

/** Filtre çubuğunda gösterilecek bir açılır liste. */
export interface AnalyticsFilterOption {
  readonly value: string;
  readonly label: string;
}

export interface AnalyticsFilterDefinition {
  readonly key: string;
  readonly label: string;
  readonly options: readonly AnalyticsFilterOption[];
  readonly placeholder: string;
}

/** Ekranın uyguladığı filtre değerleri. */
export interface AnalyticsFilterValue {
  readonly range: RangeSelection;
  readonly selections: Readonly<Record<string, string>>;
}

/**
 * Ortak analitik filtre çubuğu (§14).
 *
 * TEK bir bileşen tüm rapor ekranlarında kullanılır; hangi açılır listelerin
 * görüneceğini ekran `filters` girdisiyle söyler. Her ekranın kendi filtre
 * çubuğunu yazması, aynı filtrenin iki ekranda farklı davranmasına yol açardı.
 *
 * Tarih doğrulaması burada yapılır (§23): geçersiz aralıkta `apply` yayılmaz,
 * yani rapor bozuk bir pencereyle yenilenmez. Kullanıcı hatayı alan bazında
 * görür ve yazmaya devam edebilir.
 */
@Component({
  selector: 'app-analytics-filter-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppIconComponent],
  templateUrl: './analytics-filter-bar.component.html',
  styleUrl: './analytics-filter-bar.component.scss',
})
export class AnalyticsFilterBarComponent {
  readonly value = input.required<AnalyticsFilterValue>();
  readonly filters = input<readonly AnalyticsFilterDefinition[]>([]);
  readonly busy = input(false);

  /**
   * Filtre DURUMU her değişiklikte yayılır — kullanıcı yazarken alanlar
   * güncellensin diye.
   */
  readonly valueChange = output<AnalyticsFilterValue>();
  /**
   * Rapor YALNIZCA geçerli bir filtreyle yenilenir.
   *
   * Durum ve uygulama ayrı olaylardır: aksi hâlde ya yarım yazılmış bir tarih
   * her tuş vuruşunda rapor isteği tetiklerdi ya da doğrulama bir işe yaramazdı.
   */
  readonly apply = output<AnalyticsFilterValue>();
  readonly reset = output<void>();

  readonly presets: readonly RangePreset[] = RANGE_PRESETS;
  readonly presetLabels = RANGE_PRESET_LABELS;

  readonly issues = computed(() => validateRange(this.value().range, Date.now()));
  readonly hasIssues = computed(() => this.issues().length > 0);

  /** Geçerli aralığın okunabilir hâli — "Hangi dönemi görüyorum?" sorusu. */
  readonly rangeLabel = computed(() => {
    if (this.hasIssues()) return '—';
    return formatRange(resolveRange(this.value().range, Date.now()));
  });

  readonly isCustom = computed(() => this.value().range.preset === 'custom');

  readonly activeCount = computed(
    () => Object.values(this.value().selections).filter(Boolean).length,
  );

  issueFor(field: 'from' | 'to' | 'range'): string | null {
    return this.issues().find((issue) => issue.field === field)?.message ?? null;
  }

  selectionOf(key: string): string {
    return this.value().selections[key] ?? '';
  }

  setPreset(preset: RangePreset): void {
    if (this.busy()) return;

    /*
     * Hazır pencereye dönerken elle girilen tarihler TEMİZLENİR: geride kalan
     * değerler, kullanıcı tekrar "özel"e geçtiğinde beklenmedik bir aralık
     * canlandırırdı.
     */
    const range: RangeSelection =
      preset === 'custom'
        ? { preset, from: this.value().range.from, to: this.value().range.to }
        : { preset, from: null, to: null };

    this.emit({ ...this.value(), range });
  }

  setFrom(from: string): void {
    this.emit({ ...this.value(), range: { ...this.value().range, preset: 'custom', from } });
  }

  setTo(to: string): void {
    this.emit({ ...this.value(), range: { ...this.value().range, preset: 'custom', to } });
  }

  setSelection(key: string, selected: string): void {
    this.emit({
      ...this.value(),
      selections: { ...this.value().selections, [key]: selected },
    });
  }

  clearAll(): void {
    this.reset.emit();
  }

  private emit(next: AnalyticsFilterValue): void {
    this.valueChange.emit(next);

    // Rapor isteği yalnızca aralık geçerliyse gider.
    if (validateRange(next.range, Date.now()).length === 0) this.apply.emit(next);
  }
}
