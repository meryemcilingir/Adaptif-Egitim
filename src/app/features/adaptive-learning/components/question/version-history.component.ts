import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { QuestionVersion } from '../../models/question.model';

/** Karşılaştırma isteği: hangi iki versiyon seçildi. */
export interface CompareRequest {
  readonly from: number;
  readonly to: number;
}

/**
 * Versiyon geçmişi.
 *
 * Versiyonlar en yeniden eskiye doğru sıralanır. Kullanıcı iki versiyon seçip
 * karşılaştırabilir; seçim iki kayıtla sınırlıdır — üçüncü seçim en eskiyi düşürür,
 * böylece "önce temizle" adımı gerekmez.
 */
@Component({
  selector: 'app-version-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppEmptyStateComponent, AppIconComponent, RelativeTimePipe],
  templateUrl: './version-history.component.html',
  styleUrl: './version-history.component.scss',
})
export class VersionHistoryComponent {
  readonly versions = input.required<readonly QuestionVersion[]>();
  /** Sorunun yayında olan versiyonu — listede işaretlenir. */
  readonly publishedVersion = input<number | null>(null);

  readonly compare = output<CompareRequest>();

  private readonly selectionState = signal<readonly number[]>([]);
  readonly selection = this.selectionState.asReadonly();

  readonly canCompare = computed(() => this.selectionState().length === 2);

  isSelected(versionNumber: number): boolean {
    return this.selectionState().includes(versionNumber);
  }

  toggle(versionNumber: number): void {
    this.selectionState.update((current) => {
      if (current.includes(versionNumber)) {
        return current.filter((value) => value !== versionNumber);
      }
      // En fazla iki seçim: yeni seçim en eskiyi dışarı iter.
      return current.length < 2 ? [...current, versionNumber] : [current[1]!, versionNumber];
    });
  }

  runCompare(): void {
    const [first, second] = [...this.selectionState()].sort((a, b) => a - b);
    if (first === undefined || second === undefined) return;

    this.compare.emit({ from: first, to: second });
  }
}
