import { AfterViewInit, Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Öğe görünür olduğunda odağı ona taşır.
 * Diyalog ve form açılışlarında klavye kullanıcısının doğrudan yazmaya başlaması için.
 */
@Directive({ selector: '[appAutofocus]' })
export class AutofocusDirective implements AfterViewInit {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly appAutofocus = input(true);
  readonly focusDelay = input(0);

  ngAfterViewInit(): void {
    if (!this.appAutofocus()) return;
    setTimeout(() => this.host.nativeElement.focus(), this.focusDelay());
  }
}
