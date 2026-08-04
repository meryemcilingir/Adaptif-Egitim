import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import { AnswerValue } from '../../models/exam-session.model';
import { AnswerInputComponent } from '../../components/session/answer-input.component';
import { ExamTimerComponent } from '../../components/session/exam-timer.component';
import { QuestionNavigatorComponent } from '../../components/session/question-navigator.component';
import { SaveIndicatorComponent } from '../../components/session/save-indicator.component';
import { SubmitSummaryComponent } from '../../components/session/submit-summary.component';
import { SessionFacade } from '../../data-access/session.facade';

/**
 * Sınav oynatıcı.
 *
 * Uygulama kabuğunun DIŞINDA çalışır (kendi rotası, menü yok): sınav sırasında
 * gezinme bağlantıları göstermek hem dikkat dağıtır hem de öğrenciyi yanlışlıkla
 * sınavdan çıkarabilir.
 *
 * Sayfa durum TUTMAZ; her şey `SessionFacade`'dedir. Burada yalnızca kullanıcı
 * olayları (tuş, sekme değişimi, bağlantı) facade'e bağlanır ve teslim akışının
 * onayı alınır.
 */
@Component({
  selector: 'app-exam-session-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SessionFacade],
  imports: [
    AnswerInputComponent,
    AppButtonComponent,
    AppCardComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    ExamTimerComponent,
    QuestionNavigatorComponent,
    SaveIndicatorComponent,
    SubmitSummaryComponent,
  ],
  templateUrl: './exam-session.page.html',
  styleUrl: './exam-session.page.scss',
})
export class ExamSessionPage implements OnInit, OnDestroy {
  protected readonly facade = inject(SessionFacade);
  private readonly dialogs = inject(DialogService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly token = input.required<string>();

  private readonly showSummaryState = signal(false);
  readonly showSummary = this.showSummaryState.asReadonly();

  readonly isLast = computed(
    () => this.facade.currentIndex() === this.facade.questions().length - 1,
  );
  readonly isFirst = computed(() => this.facade.currentIndex() === 0);

  readonly currentFlagged = computed(() => {
    const question = this.facade.currentQuestion();
    return question ? this.facade.isFlagged(question.questionId) : false;
  });

  constructor() {
    /*
     * Süre dolduğunda otomatik teslim.
     *
     * Sayaç facade'de yürür; burada yalnızca sonucuna tepki verilir. Onay
     * SORULMAZ — süre bittiyse öğrencinin verecek kararı kalmamıştır.
     */
    effect(() => {
      if (this.facade.expired() && !this.facade.isSubmitting()) {
        this.finish(true);
      }
    });
  }

  ngOnInit(): void {
    this.facade.load(this.token());
    this.bindConnectionEvents();
  }

  ngOnDestroy(): void {
    this.facade.release();
  }

  /* ── Tarayıcı olayları ─────────────────────────────────────────────────── */

  /**
   * Sekme kapatma uyarısı.
   *
   * Bekleyen kayıt varken sekmenin kapanması cevap kaybı demektir; tarayıcının
   * kendi onayı devreye girer.
   */
  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.facade.saveStatus() === 'saving' || this.facade.pendingCount() > 0) {
      event.preventDefault();
    }
  }

  /** Sekme değişimi bütünlük sayacına yazılır (yalnızca bilgi amaçlı). */
  @HostListener('document:visibilitychange')
  onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') this.facade.registerTabSwitch();
  }

  /**
   * Klavye kısayolları.
   *
   * Metin alanına yazarken devre dışı kalır: açık uçlu cevap yazan öğrencinin
   * her "f" harfi soruyu işaretlemeye kalkmamalı.
   */
  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        this.facade.next();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.facade.previous();
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        this.toggleFlag();
        break;
    }
  }

  private bindConnectionEvents(): void {
    const online = () => this.facade.setConnection('online');
    const offline = () => this.facade.setConnection('offline');

    window.addEventListener('online', online);
    window.addEventListener('offline', offline);

    // Sayfa açıldığında tarayıcı zaten çevrimdışı olabilir.
    if (!navigator.onLine) this.facade.setConnection('offline');

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    });
  }

  /* ── Eylemler ──────────────────────────────────────────────────────────── */

  onAnswer(value: AnswerValue): void {
    const question = this.facade.currentQuestion();
    if (question) this.facade.setAnswer(question.questionId, value);
  }

  toggleFlag(): void {
    const question = this.facade.currentQuestion();
    if (question) this.facade.toggleFlag(question.questionId);
  }

  openSummary(): void {
    this.facade.flushNow();
    this.showSummaryState.set(true);
  }

  closeSummary(): void {
    this.showSummaryState.set(false);
  }

  /** Özetten "ilkine git" bağlantıları özeti kapatıp o soruya götürür. */
  jumpToUnanswered(): void {
    this.showSummaryState.set(false);
    this.facade.goToFirstUnanswered();
  }

  jumpToFlagged(): void {
    this.showSummaryState.set(false);
    this.facade.goToFirstFlagged();
  }

  confirmSubmit(): void {
    void this.finish(false);
  }

  private async finish(autoSubmitted: boolean): Promise<void> {
    this.showSummaryState.set(false);

    this.facade.submit(autoSubmitted).subscribe({
      next: (receipt) => {
        void this.router.navigate(['/session', this.token(), 'submitted'], {
          state: { receipt },
        });
      },
      error: () => undefined,
    });
  }

  /** Tam ekran, dikkat dağıtıcıları azaltır; zorunlu değildir. */
  async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Tarayıcı izin vermediyse sessiz geçilir; sınavı engellemeyen bir kolaylık.
    }
  }

  async exit(): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'Sınavdan çık',
      message:
        'Sınavdan çıkarsanız süreniz işlemeye devam eder. Cevaplarınız kaydedilir ve daha sonra kaldığınız yerden devam edebilirsiniz.',
      confirmLabel: 'Çık',
      tone: 'warning',
    });

    if (confirmed) {
      this.facade.release();
      void this.router.navigate(['/my-exams']);
    }
  }
}

/** Odak bir metin alanındaysa kısayollar devre dışı kalır. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}
