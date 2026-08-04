import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppIconName } from '../../../../shared/icons/app-icons';
import { ConnectionState } from '../../models/exam-session.model';
import { SaveState } from '../../data-access/session.facade';

/**
 * Kayıt ve bağlantı göstergesi.
 *
 * Bunlar AYRI iki rozet değil, tek bir gösterge: öğrenci için asıl soru
 * "cevabım güvende mi?" — bağlantının kesilmesi de kaydın gecikmesi de aynı
 * kaygıyı doğurur. Bekleyen kayıt varsa sayısı da yazılır ki "kayboldu mu?"
 * sorusu oluşmasın.
 */
@Component({
  selector: 'app-save-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  template: `
    <span class="indicator" [class]="'is-' + tone()" role="status" aria-live="polite">
      <app-icon [name]="icon()" [size]="14" />
      <span class="text-sm">{{ text() }}</span>
    </span>
  `,
  styleUrl: './save-indicator.component.scss',
})
export class SaveIndicatorComponent {
  readonly state = input.required<SaveState>();
  readonly connection = input.required<ConnectionState>();
  readonly lastSavedAt = input<string | null>(null);
  readonly pending = input(0);

  readonly tone = computed<'neutral' | 'info' | 'success' | 'warning' | 'danger'>(() => {
    if (this.connection() === 'offline') return 'warning';

    switch (this.state()) {
      case 'saving':
        return 'info';
      case 'saved':
        return 'success';
      case 'error':
        return 'danger';
      case 'offline':
        return 'warning';
      default:
        return 'neutral';
    }
  });

  readonly icon = computed<AppIconName>(() => {
    if (this.connection() === 'offline') return 'wifi-off';

    switch (this.state()) {
      case 'saving':
        return 'loader-circle';
      case 'saved':
        return 'cloud-upload';
      case 'error':
        return 'circle-alert';
      case 'offline':
        return 'wifi-off';
      default:
        return 'cloud';
    }
  });

  readonly text = computed(() => {
    const pending = this.pending();

    if (this.connection() === 'offline') {
      return pending > 0
        ? `Çevrimdışı — ${pending} cevap cihazınızda bekliyor`
        : 'Çevrimdışı — cevaplarınız cihazınızda saklanıyor';
    }

    switch (this.state()) {
      case 'saving':
        return 'Kaydediliyor…';
      case 'saved':
        return this.savedLabel();
      case 'error':
        return 'Kaydedilemedi — bağlantınızı kontrol edin';
      case 'offline':
        return 'Bağlantı bekleniyor';
      default:
        return this.lastSavedAt() ? this.savedLabel() : 'Otomatik kayıt açık';
    }
  });

  /**
   * "Saved at 09:42" biçimi.
   *
   * Göreli zaman ("2 dakika önce") burada KULLANILMAZ: sınav sırasında öğrenci
   * saatle yarışıyor ve mutlak saat, kaydın ne zaman alındığını tereddütsüz
   * gösterir.
   */
  private savedLabel(): string {
    const saved = this.lastSavedAt();
    if (!saved) return 'Kaydedildi';

    const time = new Date(saved).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `Kaydedildi · ${time}`;
  }
}
