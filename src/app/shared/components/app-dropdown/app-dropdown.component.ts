import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { AppIconName } from '../../icons/app-icons';
import { AppButtonComponent } from '../app-button/app-button.component';
import { AppIconComponent } from '../app-icon/app-icon.component';
import { PanelPlacement, placePanel } from '../../utils/panel-position';

export interface DropdownItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: AppIconName;
  readonly tone?: 'default' | 'danger';
  readonly disabled?: boolean;
  readonly separatorBefore?: boolean;
  /**
   * Anahtarlanabilir öğenin açık/kapalı durumu.
   *
   * Verildiğinde öğe bir aksiyon değil ONAY KUTUSU gibi çizilir. Durumu ikonla
   * anlatmak (görünürken "check", gizliyken "eye") yanlış okunuyordu: "eye"
   * ikonu çoğu kullanıcıya "görünür" diye okunduğu için menü hep aynı görünüp
   * seçim işe yaramıyor sanılıyordu.
   */
  readonly checked?: boolean;
  /** Öğenin altına yazılan kısa açıklama — seçimin neden etkisiz kaldığını söyler. */
  readonly hint?: string;
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
        role="menu"
        [class.is-flipped]="placement()?.flipped"
        [style.top.px]="placement()?.top"
        [style.left.px]="placement()?.left"
        [style.max-height.px]="placement()?.maxHeight"
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
            [attr.role]="item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'"
            [attr.aria-checked]="item.checked"
            [disabled]="item.disabled ?? false"
            (click)="select(item)"
          >
            @if (item.checked !== undefined) {
              <span class="dropdown__check" [class.is-checked]="item.checked">
                @if (item.checked) {
                  <app-icon name="check" [size]="11" [strokeWidth]="2.5" />
                }
              </span>
            } @else if (item.icon; as icon) {
              <app-icon [name]="icon" [size]="14" />
            }
            <span class="dropdown__text">
              {{ item.label }}
              @if (item.hint; as hint) {
                <span class="dropdown__hint text-xs">{{ hint }}</span>
              }
            </span>
          </button>
        }
      </div>
    }
  `,
  styleUrl: './app-dropdown.component.scss',
  host: {
    /* Panel `fixed` konumlandığı için sayfa kaydıkça yeniden hesaplanır. */
    '(window:scroll)': 'reposition()',
    '(window:resize)': 'reposition()',
  },
})
export class AppDropdownComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /*
   * Dışarı tıklama CAPTURE aşamasında dinlenir.
   *
   * `(document:click)` BUBBLE aşamasında çalışıyordu: sayfanın herhangi bir
   * yerinde `event.stopPropagation()` çağıran bir bileşene tıklandığında olay
   * `document`'a hiç ulaşmıyor, menü kapanmıyordu. Capture aşaması, hedefe
   * ulaşmadan ve herhangi bir `stopPropagation()` çağrılmadan ÖNCE çalışır;
   * bu sınıf hatayı ortadan kaldırır.
   */
  constructor() {
    const listener = (event: MouseEvent) => this.onOutsideClick(event);
    document.addEventListener('click', listener, true);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('click', listener, true));
  }

  readonly items = input.required<readonly DropdownItem[]>();
  readonly triggerIcon = input<AppIconName | null>('ellipsis-vertical');
  readonly triggerText = input('');
  readonly triggerLabel = input('İşlemler');
  readonly triggerVariant = input<'ghost' | 'secondary'>('ghost');
  readonly triggerSize = input<'sm' | 'md'>('sm');
  readonly align = input<'start' | 'end'>('end');
  /**
   * Seçimden sonra menü kapansın mı?
   *
   * Aksiyon menülerinde kapanmalı; birden çok kolonu açıp kapatmak gibi
   * ANAHTARLAMA menülerinde her tıklamada kapanmak, kullanıcıyı menüyü
   * tekrar tekrar açmaya zorlar ve seçimin sonucunu görmesini engeller.
   */
  readonly closeOnSelect = input(true);

  readonly itemSelect = output<DropdownItem>();

  private readonly openState = signal(false);
  private readonly placementState = signal<PanelPlacement | null>(null);

  readonly isOpen = computed(() => this.openState());
  readonly placement = this.placementState.asReadonly();

  toggle(): void {
    const opening = !this.openState();
    this.openState.set(opening);

    /*
     * Konum, panel DOM'a girdikten SONRA hesaplanır.
     *
     * `effect` ve `queueMicrotask` denendi: ikisi de panel şablona işlenmeden
     * çalışıp ölçümü boşa düşürüyordu. `afterNextRender` bir sonraki render
     * geçişinin ardından koşar; panel o anda kesin olarak ölçülebilir.
     */
    if (opening) afterNextRender(() => this.reposition(), { injector: this.injector });
    else this.placementState.set(null);
  }

  /**
   * Paneli tetikleyiciye göre yerleştirir.
   *
   * `fixed` konumlandırma, menünün tablo gibi kaydırma kaplarının dışına
   * taşabilmesi için gerekli (ADR-074); karşılığında konum burada hesaplanır.
   * Menü sağa yaslanır: satır aksiyonları tablonun sağ ucundadır.
   */
  reposition(): void {
    if (!this.openState()) return;

    const panel = this.host.nativeElement.querySelector<HTMLElement>('.dropdown__menu');
    const trigger = this.host.nativeElement.querySelector<HTMLElement>('button');
    if (!panel || !trigger) return;

    const rect = trigger.getBoundingClientRect();
    const width = panel.offsetWidth;

    // `end` hizasında panelin SAĞ kenarı tetikleyiciyle hizalanır.
    const left = this.align() === 'end' ? rect.right - width : rect.left;

    this.placementState.set(
      placePanel({
        trigger: { top: rect.top, bottom: rect.bottom, left, right: rect.right },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        panelWidth: width,
        /* Ölçüm kısıtsız yapılır: kısılmış yükseklik yeni ölçümü etkilemesin. */
        panelHeight: panel.scrollHeight,
      }),
    );
  }

  close(): void {
    this.openState.set(false);
    this.placementState.set(null);
  }

  select(item: DropdownItem): void {
    if (item.disabled) return;
    if (this.closeOnSelect()) this.close();
    this.itemSelect.emit(item);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }

  /** Menü dışına tıklanınca kapanır. */
  private onOutsideClick(event: MouseEvent): void {
    if (!this.openState()) return;
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }
}
