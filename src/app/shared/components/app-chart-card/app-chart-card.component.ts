import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ApexNonAxisChartSeries, ChartComponent } from 'ng-apexcharts';

import { ApiError } from '../../../core/api/api-error';
import { AppCardComponent } from '../app-card/app-card.component';
import { AppEmptyStateComponent } from '../app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../app-error-state/app-error-state.component';
import { AppLoadingStateComponent } from '../app-loading-state/app-loading-state.component';
import {
  AppChartSeries,
  AppChartType,
  BASE_DATA_LABELS,
  BASE_TOOLTIP,
  CHART_COLORS,
  areaFill,
  baseChart,
  baseGrid,
  baseLegend,
  baseMarkers,
  basePlotOptions,
  baseStroke,
  baseXAxis,
  baseYAxis,
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
  readonly colors = input<readonly string[]>(CHART_COLORS);
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

  readonly chart = computed(() => baseChart(this.type(), this.height()));
  readonly grid = computed(() => baseGrid(this.showGrid()));
  readonly stroke = computed(() => baseStroke(this.type()));
  readonly legend = computed(() => baseLegend(this.showLegend()));
  readonly plotOptions = computed(() => basePlotOptions(this.type(), this.horizontal()));
  readonly xaxis = computed(() => baseXAxis(this.categories(), this.type() === 'scatter'));
  readonly markers = computed(() => baseMarkers(this.type()));
  readonly yaxis = computed(() => baseYAxis(this.valueSuffix()));
  readonly fill = computed(() => (this.type() === 'area' ? areaFill() : {}));
  readonly chartLabels = computed(() => [...this.labels()]);
  readonly chartColors = computed(() => [...this.colors()]);

  readonly dataLabels = BASE_DATA_LABELS;
  readonly tooltip = BASE_TOOLTIP;
}
