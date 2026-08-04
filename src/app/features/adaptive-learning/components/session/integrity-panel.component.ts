import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { IntegritySignals } from '../../models/exam-session.model';

/**
 * Sınav bütünlüğü göstergeleri.
 *
 * ÖNEMLİ: burada gerçek bir gözetim (proctoring) YOKTUR. Gösterilenler tarayıcı
 * olaylarından toplanan bilgilendirici sayaçlardır; sınavı kesmez, puanı
 * etkilemez ve tek başına bir ihlal kanıtı değildir. Panel bu çekinceyi açıkça
 * yazar — aksi hâlde değerlendirici bu sayılara hak etmediği bir ağırlık verirdi.
 */
@Component({
  selector: 'app-integrity-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, AppStatusBadgeComponent],
  templateUrl: './integrity-panel.component.html',
  styleUrl: './integrity-panel.component.scss',
})
export class IntegrityPanelComponent {
  readonly signals = input.required<IntegritySignals>();
  /** Sınav sırasında kısa gösterim, deneme detayında açıklamalı gösterim. */
  readonly compact = input(false);

  readonly connectionLabel = computed(() => {
    switch (this.signals().connection) {
      case 'online':
        return 'Bağlı';
      case 'unstable':
        return 'Kararsız';
      case 'offline':
        return 'Bağlantı yok';
    }
  });

  readonly connectionTone = computed<'success' | 'warning' | 'danger'>(() => {
    switch (this.signals().connection) {
      case 'online':
        return 'success';
      case 'unstable':
        return 'warning';
      case 'offline':
        return 'danger';
    }
  });

  /** Sekme değişimi tek başına ihlal değildir; yalnızca yoğunsa dikkat çeker. */
  readonly tabTone = computed<'neutral' | 'warning'>(() =>
    this.signals().tabSwitchCount >= 5 ? 'warning' : 'neutral',
  );
}
