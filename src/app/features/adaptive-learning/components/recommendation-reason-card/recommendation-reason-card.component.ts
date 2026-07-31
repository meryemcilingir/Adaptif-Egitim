import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { DurationPipe } from '../../../../shared/pipes/duration.pipe';
import { RECOMMENDATION_RULE_LABELS, Recommendation } from '../../models/recommendation.model';

/**
 * "Neden önerildi" kartı (BR-16).
 *
 * Öneri motoru kural tabanlıdır; bu kart kararı üreten her kuralı ve o kuralın
 * dayandığı sayısal girdiyi kullanıcıya açıkça gösterir. Kara kutu bırakılmaz.
 */
@Component({
  selector: 'app-recommendation-reason-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppIconComponent, AppStatusBadgeComponent, DurationPipe],
  templateUrl: './recommendation-reason-card.component.html',
  styleUrl: './recommendation-reason-card.component.scss',
})
export class RecommendationReasonCardComponent {
  readonly recommendation = input.required<Recommendation>();
  readonly start = output<Recommendation>();

  readonly ruleLabels = RECOMMENDATION_RULE_LABELS;

  readonly priorityTone = computed(() => {
    const priority = this.recommendation().priority;
    if (priority >= 60) return 'danger' as const;
    if (priority >= 35) return 'warning' as const;
    return 'info' as const;
  });

  readonly priorityLabel = computed(() => {
    const priority = this.recommendation().priority;
    if (priority >= 60) return 'Yüksek öncelik';
    if (priority >= 35) return 'Orta öncelik';
    return 'Düşük öncelik';
  });

  /** Kanıt nesnesini okunabilir "etiket: değer" listesine çevirir. */
  evidenceEntries(
    evidence: Readonly<Record<string, number | string>>,
  ): { key: string; value: string }[] {
    return Object.entries(evidence).map(([key, value]) => ({
      key: EVIDENCE_LABELS[key] ?? key,
      value: String(value),
    }));
  }
}

/**
 * Kanıt anahtarlarının okunabilir karşılıkları.
 * Motor yeni bir kanıt alanı eklediğinde buraya bir satır eklenir; eşleşme
 * bulunamazsa ham anahtar gösterilir (bilgi kaybolmaz).
 */
const EVIDENCE_LABELS: Readonly<Record<string, string>> = {
  masteryScore: 'Ustalık skoru',
  threshold: 'Eşik',
  lowerBound: 'Alt eşik',
  upperBound: 'Üst eşik',
  scorePercent: 'Alınan puan',
  passingScore: 'Geçme puanı',
  completionPercent: 'Tamamlanma',
  contentType: 'İçerik türü',
  daysSinceLastStudy: 'Son çalışmadan bu yana (gün)',
  daysUntilExam: 'Sınava kalan gün',
  completedOutcome: 'Tamamlanan kazanım',
  missingPrerequisites: 'Eksik önkoşullar',
  requiredMastery: 'Gereken ustalık',
  outcome: 'Kazanım',
};
