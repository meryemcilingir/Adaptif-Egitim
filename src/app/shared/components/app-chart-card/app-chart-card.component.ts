import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { ApexNonAxisChartSeries, ChartComponent } from 'ng-apexcharts';

import { ApiError } from '../../../core/api/api-error';
import { ThemeStore } from '../../../core/state/theme.store';
import { AppCardComponent } from '../app-card/app-card.component';
import { AppEmptyStateComponent } from '../app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../app-error-state/app-error-state.component';
import { AppLoadingStateComponent } from '../app-loading-state/app-loading-state.component';
import {
  AppChartSeries,
  AppChartType,
  BASE_DATA_LABELS,
  areaFill,
  baseChart,
  baseGrid,
  baseLegend,
  baseMarkers,
  basePlotOptions,
  baseStroke,
  baseTooltip,
  baseXAxis,
  baseYAxis,
  chartColors,
} from './chart-theme';

/**
 * Tüm grafiklerin tek giriş noktası.
 *
 * Ekranlara `<apx-chart>` doğrudan konmaz (DESIGN_SYSTEM.md §11):
 * · tema ve renkler tek yerden gelir,
 * · loading / empty / error durumları grafikle birlikte yönetilir,
 * · ApexCharts API'si tek dosyada kapsüllenir (kütüphane değişirse burası değişir).
 */
@Component({
  selector: 'app-chart-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppLoadingStateComponent,
    ChartComponent,
  ],
  templateUrl: './app-chart-card.component.html',
  styleUrl: './app-chart-card.component.scss',
})
export class AppChartCardComponent {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly type = input<AppChartType>('area');
  readonly series = input.required<AppChartSeries>();
  readonly categories = input<readonly string[]>([]);
  readonly labels = input<readonly string[]>([]);
  readonly height = input(280);
  /** Boş bırakılırsa tema paletindeki sekiz renk kullanılır. */
  readonly colors = input<readonly string[]>([]);
  readonly showLegend = input(true);
  readonly showGrid = input(true);
  readonly horizontal = input(false);
  readonly valueSuffix = input('');

  readonly loading = input(false);
  readonly error = input<ApiError | null>(null);
  readonly emptyMessage = input('Bu aralıkta gösterilecek veri bulunmuyor.');

  readonly retry = output<void>();

  readonly hasData = computed(() => {
    const series = this.series();
    if (series.length === 0) return false;

    return series.some((entry) =>
      typeof entry === 'number' ? true : (entry.data?.length ?? 0) > 0,
    );
  });

  /**
   * ApexCharts `series` girdisi tek bir tiple bildirilmiştir; eksenli ve eksensiz
   * grafikler aynı girişi paylaşır. Dönüşüm bu tek noktada yapılır, ekranlara sızmaz.
   */
  readonly apexSeries = computed(() => this.series() as ApexNonAxisChartSeries);

  private readonly theme = inject(ThemeStore);

  /*
   * Grafik seçenekleri renkleri CSS token'larından okur, ama ApexCharts bunları
   * bir kez alıp saklar. Aşağıdaki hesaplananların tema değişiminde yeniden
   * çalışması için `resolved()` bilinçli olarak okunur — yoksa tema değişince
   * ızgara ve etiketler eski renkte kalıyordu.
   */
  private readonly themeKey = computed(() => this.theme.resolved());

  readonly chart = computed(() => baseChart(this.type(), this.height()));
  readonly grid = computed(() => (this.themeKey(), baseGrid(this.showGrid())));
  readonly stroke = computed(() => baseStroke(this.type()));
  readonly legend = computed(() => (this.themeKey(), baseLegend(this.showLegend())));
  readonly plotOptions = computed(
    () => (this.themeKey(), basePlotOptions(this.type(), this.horizontal())),
  );
  readonly xaxis = computed(
    () => (this.themeKey(), baseXAxis(this.categories(), this.type() === 'scatter')),
  );
  readonly markers = computed(() => baseMarkers(this.type()));
  readonly yaxis = computed(
    () => (this.themeKey(), baseYAxis(this.valueSuffix(), this.type() === 'heatmap')),
  );
  readonly fill = computed(() => (this.type() === 'area' ? areaFill() : {}));
  readonly chartLabels = computed(() => [...this.labels()]);
  readonly chartColors = computed(() => {
    this.themeKey();
    const explicit = this.colors();
    return explicit.length > 0 ? [...explicit] : [...chartColors()];
  });

  readonly dataLabels = BASE_DATA_LABELS;
  readonly tooltip = computed(() => (this.themeKey(), baseTooltip()));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    /*
     * Kart genişliği değişince grafik yeniden ölçülür.
     *
     * Kenar çubuğu açılıp kapandığında ya da pencere bölündüğünde ApexCharts
     * kendi ölçüsünü tazelemiyor, grafik eski genişlikte kalıyordu. Kütüphane
     * genel `resize` olayını dinlediği için örneğe erişmeye gerek yok; sürüm
     * değişse de bu yol çalışır.
     */
    let lastWidth = 0;

    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0]?.contentRect.width ?? 0);

      // Yalnızca gerçek genişlik değişiminde tetikle; yükseklik oynamaları sayılmaz.
      if (width === 0 || width === lastWidth) return;

      const isFirstMeasurement = lastWidth === 0;
      lastWidth = width;

      if (!isFirstMeasurement) window.dispatchEvent(new Event('resize'));
    });

    observer.observe(this.host.nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
