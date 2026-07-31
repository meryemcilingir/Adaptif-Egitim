import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AppIconName } from '../../icons/app-icons';
import { AppIconComponent } from '../app-icon/app-icon.component';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: AppIconName;
  readonly count?: number;
  readonly disabled?: boolean;
}

/** Sekme çubuğu — ok tuşlarıyla gezinilebilir (WAI-ARIA tab pattern). */
@Component({
  selector: 'app-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  template: `
    <div class="tabs" role="tablist" (keydown)="onKeydown($event)">
      @for (tab of tabs(); track tab.id) {
        <button
          type="button"
          class="tabs__tab"
          role="tab"
          [class.is-active]="tab.id === activeId()"
          [attr.aria-selected]="tab.id === activeId()"
          [attr.tabindex]="tab.id === activeId() ? 0 : -1"
          [disabled]="tab.disabled ?? false"
          (click)="tabChange.emit(tab.id)"
        >
          @if (tab.icon; as icon) {
            <app-icon [name]="icon" [size]="15" />
          }
          {{ tab.label }}
          @if (tab.count !== undefined) {
            <span class="tabs__count tabular">{{ tab.count }}</span>
          }
        </button>
      }
    </div>
  `,
  styleUrl: './app-tabs.component.scss',
})
export class AppTabsComponent {
  readonly tabs = input.required<readonly TabItem[]>();
  readonly activeId = input.required<string>();
  readonly tabChange = output<string>();

  onKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;

    event.preventDefault();
    const enabled = this.tabs().filter((tab) => !tab.disabled);
    const index = enabled.findIndex((tab) => tab.id === this.activeId());
    const next = enabled[(index + step + enabled.length) % enabled.length];

    if (next) this.tabChange.emit(next.id);
  }
}
