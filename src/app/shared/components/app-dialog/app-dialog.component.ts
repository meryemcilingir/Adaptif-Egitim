import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';

import { AppButtonComponent } from '../app-button/app-button.component';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

/**
 * Modal diyalog.
 *
 * Erişilebilirlik: açılınca odak diyaloga taşınır, Tab odağı içeride döner (focus trap),
 * ESC kapatır, kapanınca odak tetikleyen öğeye geri döner (PROJECT_RULES.md §10).
 */
@Component({
  selector: 'app-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent],
  templateUrl: './app-dialog.component.html',
  styleUrl: './app-dialog.component.scss',
})
export class AppDialogComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly open = model(false);
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly size = input<DialogSize>('md');
  readonly closeOnBackdrop = input(true);
  readonly showClose = input(true);

  readonly closed = output<void>();

  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private previouslyFocused: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (this.open()) {
        this.previouslyFocused = document.activeElement as HTMLElement | null;
        queueMicrotask(() => this.focusFirst());
      } else {
        this.previouslyFocused?.focus?.();
        this.previouslyFocused = null;
      }
    });
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (!this.closeOnBackdrop()) return;
    if (event.target === event.currentTarget) this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
      return;
    }

    if (event.key === 'Tab') this.trapFocus(event);
  }

  private focusable(): HTMLElement[] {
    const root = this.panel()?.nativeElement ?? this.host.nativeElement;
    return [
      ...root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => element.offsetParent !== null);
  }

  private focusFirst(): void {
    const [first] = this.focusable();
    (first ?? this.panel()?.nativeElement)?.focus();
  }

  /** Tab ile odağın diyalog dışına çıkmasını engeller. */
  private trapFocus(event: KeyboardEvent): void {
    const elements = this.focusable();
    if (elements.length === 0) return;

    const first = elements[0]!;
    const last = elements[elements.length - 1]!;
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
