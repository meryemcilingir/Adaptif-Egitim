import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppIconName } from '../../../../shared/icons/app-icons';
import { AnalyticsInsight } from '../../models/analytics.model';

/**
 * Kural tabanlı içgörü listesi (§13).
 *
 * Her kart, iddiayı VE onu doğuran ölçümü birlikte gösterir. "Öğrenciler LO-8'de
 * zorlanıyor" cümlesinin altında "%41 ustalık (eşik %55)" yazması, yorumu
 * denetlenebilir kılar — yapay zekâ olmadığını da böyle belli eder.
 */
@Component({
  selector: 'app-insight-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  templateUrl: './insight-list.component.html',
  styleUrl: './insight-list.component.scss',
})
export class InsightListComponent {
  readonly insights = input.required<readonly AnalyticsInsight[]>();
  readonly emptyMessage = input('Bu filtrede öne çıkan bir bulgu yok.');

  readonly select = output<AnalyticsInsight>();

  readonly hasInsights = computed(() => this.insights().length > 0);

  iconOf(kind: AnalyticsInsight['kind']): AppIconName {
    switch (kind) {
      case 'critical':
        return 'circle-alert';
      case 'warning':
        return 'triangle-alert';
      case 'positive':
        return 'trending-up';
      default:
        return 'info';
    }
  }
}
