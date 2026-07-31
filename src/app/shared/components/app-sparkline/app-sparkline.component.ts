import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Bağımlılıksız mini trend grafiği.
 *
 * KPI kartlarında onlarca kez kullanıldığı için ApexCharts örneği açmak yerine
 * doğrudan SVG çizilir — ilk boyama belirgin şekilde hızlanır.
 */
@Component({
  selector: 'app-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
      [attr.width]="width()"
      [attr.height]="height()"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path class="sparkline__area" [attr.d]="areaPath()" [attr.fill]="color()" />
      <path
        class="sparkline__line"
        [attr.d]="linePath()"
        [attr.stroke]="color()"
        fill="none"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
  styles: `
    :host {
      display: block;
      line-height: 0;
    }

    .sparkline__area {
      opacity: 0.12;
    }
  `,
})
export class AppSparklineComponent {
  readonly values = input.required<readonly number[]>();
  readonly width = input(120);
  readonly height = input(36);
  readonly color = input('var(--color-primary)');

  private readonly points = computed(() => {
    const values = this.values();
    if (values.length < 2) return [];

    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;
    const stepX = this.width() / (values.length - 1);
    const padding = 3;
    const usableHeight = this.height() - padding * 2;

    return values.map((value, index) => ({
      x: index * stepX,
      y: padding + usableHeight - ((value - min) / range) * usableHeight,
    }));
  });

  readonly linePath = computed(() => {
    const points = this.points();
    if (points.length === 0) return '';

    return points
      .map(
        (point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`,
      )
      .join(' ');
  });

  readonly areaPath = computed(() => {
    const points = this.points();
    if (points.length === 0) return '';

    const last = points[points.length - 1]!;
    return `${this.linePath()} L${last.x.toFixed(1)},${this.height()} L0,${this.height()} Z`;
  });
}
