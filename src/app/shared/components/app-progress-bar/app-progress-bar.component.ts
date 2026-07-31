import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type ProgressTone = 'primary' | 'success' | 'warning' | 'danger';

@Component({
  selector: 'app-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showLabel()) {
      <div class="progress__header">
        <span class="text-xs text-muted">{{ label() }}</span>
        <span class="text-xs tabular">{{ display() }}</span>
      </div>
    }
    <div
      class="progress__track"
      role="progressbar"
      [attr.aria-valuenow]="value()"
      [attr.aria-valuemin]="0"
      [attr.aria-valuemax]="max()"
      [attr.aria-label]="label()"
    >
      <div
        class="progress__fill"
        [class]="'progress__fill--' + tone()"
        [style.width.%]="percent()"
      ></div>
    </div>
  `,
  styleUrl: './app-progress-bar.component.scss',
})
export class AppProgressBarComponent {
  readonly value = input(0);
  readonly max = input(100);
  readonly tone = input<ProgressTone>('primary');
  readonly label = input('İlerleme');
  readonly showLabel = input(false);
  /** `%42` yerine `18 / 42` biçiminde gösterim. */
  readonly showFraction = input(false);

  readonly percent = computed(() => {
    const max = this.max();
    return max > 0 ? Math.min(100, Math.max(0, (this.value() / max) * 100)) : 0;
  });

  readonly display = computed(() =>
    this.showFraction() ? `${this.value()} / ${this.max()}` : `%${Math.round(this.percent())}`,
  );
}
