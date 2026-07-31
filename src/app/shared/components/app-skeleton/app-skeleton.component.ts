import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Yükleme sırasında yerleşimin zıplamaması için kullanılan shimmer bloğu. */
@Component({
  selector: 'app-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  styles: `
    :host {
      display: block;
    }
  `,
  host: {
    class: 'skeleton',
    '[style.width]': 'width()',
    '[style.height]': 'height()',
    '[style.border-radius]': 'radius()',
    'aria-hidden': 'true',
  },
})
export class AppSkeletonComponent {
  readonly width = input('100%');
  readonly height = input('16px');
  readonly radius = input('var(--radius-sm)');
}
