import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { AppIconName } from '../../icons/app-icons';
import { sanitizeRichText } from '../../utils/rich-text.util';
import { AppIconComponent } from '../app-icon/app-icon.component';

/** Araç çubuğu düğmesi. Yeni bir biçimlendirme eklemek = listeye bir satır eklemek. */
interface ToolbarCommand {
  readonly id: string;
  readonly label: string;
  readonly icon: AppIconName;
  /** `document.execCommand` komutu; özel davranışlar `handler` ile ayrılır. */
  readonly command?: string;
  readonly value?: string;
}

const COMMANDS: readonly ToolbarCommand[] = [
  { id: 'bold', label: 'Kalın', icon: 'bold', command: 'bold' },
  { id: 'italic', label: 'İtalik', icon: 'italic', command: 'italic' },
  { id: 'underline', label: 'Altı çizili', icon: 'underline', command: 'underline' },
  { id: 'heading', label: 'Ara başlık', icon: 'heading', command: 'formatBlock', value: 'h3' },
  { id: 'paragraph', label: 'Paragraf', icon: 'pilcrow', command: 'formatBlock', value: 'p' },
  { id: 'ul', label: 'Madde listesi', icon: 'list', command: 'insertUnorderedList' },
  { id: 'ol', label: 'Numaralı liste', icon: 'list-ordered', command: 'insertOrderedList' },
  { id: 'code', label: 'Kod', icon: 'code', command: 'formatBlock', value: 'pre' },
];

/**
 * Zengin metin editörü.
 *
 * Dış kütüphane KULLANILMAZ: `contenteditable` + tarayıcının kendi biçimlendirme
 * komutları yeterlidir ve paket boyutunu büyütmez. Kaydedilen HTML izin listesine
 * göre temizlenir (`sanitizeRichText`) — aynı fonksiyon mock sunucuda da çalışır,
 * yani istemci atlansa bile veritabanına script giremez.
 *
 * Görsel ekleme bugün URL veya panodan yapıştırma ile çalışır; `kind` alanı
 * sayesinde ileride video/ses desteklemek yeni bir düğme eklemekten ibarettir.
 */
@Component({
  selector: 'app-rich-text',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => AppRichTextComponent),
      multi: true,
    },
  ],
  templateUrl: './app-rich-text.component.html',
  styleUrl: './app-rich-text.component.scss',
})
export class AppRichTextComponent implements ControlValueAccessor {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly inputId = input.required<string>();
  readonly placeholder = input('Soru metnini yazın…');
  readonly invalid = input(false);
  readonly minHeight = input('160px');
  /** Görsel ekleme düğmesi gösterilsin mi. */
  readonly allowImages = input(true);

  private readonly editor = viewChild.required<ElementRef<HTMLElement>>('editor');

  private readonly valueState = signal('');
  private readonly disabledState = signal(false);
  private readonly focusedState = signal(false);

  readonly commands = COMMANDS;
  readonly isDisabled = this.disabledState.asReadonly();
  readonly isFocused = this.focusedState.asReadonly();
  readonly isEmpty = computed(
    () =>
      this.valueState()
        .replace(/<[^>]*>/g, '')
        .trim().length === 0,
  );

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  /* ── ControlValueAccessor ────────────────────────────────────────────── */

  writeValue(value: string | null): void {
    const html = value ?? '';
    this.valueState.set(html);

    // Yazarken imleç kaybolmasın diye DOM yalnızca dışarıdan gelen değişimde yazılır.
    const element = this.editorElement();
    if (element && element.innerHTML !== html) element.innerHTML = html;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabledState.set(isDisabled);
  }

  /* ── Düzenleme ───────────────────────────────────────────────────────── */

  onInput(): void {
    const html = this.editorElement()?.innerHTML ?? '';
    this.valueState.set(html);
    this.onChange(html);
  }

  onFocus(): void {
    this.focusedState.set(true);
  }

  onBlur(): void {
    this.focusedState.set(false);
    // Odak kaybında içerik temizlenir; kullanıcı yazarken imleç bozulmaz.
    const element = this.editorElement();
    if (element) {
      const clean = sanitizeRichText(element.innerHTML);
      if (clean !== element.innerHTML) {
        element.innerHTML = clean;
        this.valueState.set(clean);
        this.onChange(clean);
      }
    }
    this.onTouched();
  }

  /** Yapıştırmada biçim taşınmaz — düz metin eklenir, sürpriz HTML gelmez. */
  onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
  }

  run(command: ToolbarCommand): void {
    if (this.isDisabled()) return;

    this.editorElement()?.focus();
    document.execCommand(command.command ?? '', false, command.value);
    this.onInput();
  }

  /** Görsel ekleme: kullanıcıdan adres istenir, düzenleyiciye `img` eklenir. */
  insertImage(): void {
    if (this.isDisabled()) return;

    const url = window.prompt('Görsel adresi (https://…)');
    if (!url) return;

    this.editorElement()?.focus();
    document.execCommand('insertImage', false, url);
    this.onInput();
  }

  private editorElement(): HTMLElement | null {
    // `viewChild.required` şablon oluşmadan çağrılabilir; güvenli erişim.
    return this.host.nativeElement.querySelector<HTMLElement>('[contenteditable]');
  }

  /** Şablonun `editor` referansını kullanması için (a11y ve odak yönetimi). */
  focusEditor(): void {
    this.editor().nativeElement.focus();
  }
}
