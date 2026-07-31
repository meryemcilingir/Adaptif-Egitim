import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { AppIconName } from '../../icons/app-icons';
import { AppButtonComponent } from '../app-button/app-button.component';
import { AppIconComponent } from '../app-icon/app-icon.component';

export interface DropdownItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: AppIconName;
  readonly tone?: 'default' | 'danger';
  readonly disabled?: boolean;
  readonly separatorBefore?: boolean;
}

/**
 * Aksiyon menüsü. Tablo satır aksiyonları ve kullanıcı menüsünde kullanılır.
 * Ok tuşlarıyla gezinme ve ESC ile kapanma desteklenir.
 */
@Component({
  selector: 'app-dropdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppIconComponent],
  template: `
    <app-button
      [variant]="triggerVariant()"
      [size]="triggerSize()"
      [icon]="triggerIcon()"
      [ariaLabel]="triggerLabel()"
      (pressed)="toggle()"
    >
      {{ triggerText() }}
    </app-button>

    @if (isOpen()) {
      <div
        class="dropdown__menu"
        [class]="'dropdown__menu--' + align()"
        role="menu"
        (keydown)="onKeydown($event)"
      >
        @for (item of items(); track item.id) {
          @if (item.separatorBefore) {
            <div class="dropdown__separator" role="separator"></div>
          }
          <button
            type="button"
            class="dropdown__item"
            [class.is-danger]="item.tone === 'danger'"
            role="menuitem"
            [disabled]="item.disabled ?? false"
            (click)="select(item)"
          >
            @if (item.icon; as icon) {
              <app-icon [name]="icon" [size]="14" />
            }
            {{ item.label }}
          </button>
        }
      </div>
    }
  `,
  styleUrl: './app-dropdown.component.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
})
export class AppDropdownComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly items = input.required<readonly DropdownItem[]>();
  readonly triggerIcon = input<AppIconName | null>('ellipsis-vertical');
  readonly triggerText = input('');
  readonly triggerLabel = input('İşlemler');
  readonly triggerVariant = input<'ghost' | 'secondary'>('ghost');
  readonly triggerSize = input<'sm' | 'md'>('sm');
  readonly align = input<'start' | 'end'>('end');

  readonly itemSelect = output<DropdownItem>();

  private readonly openState = signal(false);
  readonly isOpen = computed(() => this.openState());

  toggle(): void {
    this.openState.update((open) => !open);
  }

  close(): void {
    this.openState.set(false);
  }

  select(item: DropdownItem): void {
    if (item.disabled) return;
    this.close();
    this.itemSelect.emit(item);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }

  /** Menü dışına tıklanınca kapanır. */
  onDocumentClick(event: MouseEvent): void {
    if (!this.openState()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
