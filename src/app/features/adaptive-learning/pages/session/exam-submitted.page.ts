import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { SubmissionReceipt } from '../../models/exam-session.model';
import { formatDuration } from '../../domain/exam-clock';

/**
 * Teslim makbuzu.
 *
 * PUAN GÖSTERİLMEZ (BR-49). Teslimden hemen sonra not vermek, açık uçlu cevaplar
 * daha değerlendirilmemişken yanıltıcı bir "sonuç" sunardı; ayrıca öğrenciler
 * arasında anlık karşılaştırma baskısı yaratır. Ekran yalnızca teslimin
 * gerçekleştiğini kanıtlar ve sürecin nasıl ilerleyeceğini anlatır.
 *
 * Makbuz yönlendirme durumundan (`router state`) okunur; sayfa yenilenirse
 * makbuz kaybolur ve öğrenci sınav geçmişine yönlendirilir.
 */
@Component({
  selector: 'app-exam-submitted-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppCardComponent, AppEmptyStateComponent, AppIconComponent],
  templateUrl: './exam-submitted.page.html',
  styleUrl: './exam-submitted.page.scss',
})
export class ExamSubmittedPage {
  private readonly router = inject(Router);

  private readonly receiptState = signal<SubmissionReceipt | null>(
    (this.router.getCurrentNavigation()?.extras.state?.['receipt'] as SubmissionReceipt) ??
      (history.state?.['receipt'] as SubmissionReceipt) ??
      null,
  );

  readonly receipt = this.receiptState.asReadonly();

  readonly submittedAt = computed(() => {
    const receipt = this.receiptState();
    if (!receipt) return '';

    return new Date(receipt.submittedAt).toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  readonly duration = computed(() =>
    formatDuration((this.receiptState()?.durationSeconds ?? 0) * 1000),
  );

  goToHistory(): void {
    void this.router.navigate(['/my-exams']);
  }

  goToDashboard(): void {
    void this.router.navigate(['/learning/dashboard']);
  }
}
