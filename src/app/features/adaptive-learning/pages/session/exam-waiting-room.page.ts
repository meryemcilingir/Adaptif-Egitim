import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { ApiError } from '../../../../core/api/api-error';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { WaitingRoomView } from '../../models/exam-session.model';
import { humanizeDuration, serverOffset, serverTime } from '../../domain/exam-clock';
import { WAITING_PHASE_MESSAGES, canEnter } from '../../domain/session.rules';
import { SessionRepository } from '../../data-access/session.repository';

/**
 * Bekleme odası.
 *
 * Sınav başlamadan önce öğrencinin gördüğü ekran. Geri sayım SUNUCU saatine göre
 * yürür (BR-07): istemci saati ileri alınmış bir bilgisayarda düğme erken
 * açılmaz. Başlama anı geldiğinde sayfa kendiliğinden tazelenir ve "Sınava
 * başla" düğmesi etkinleşir — kullanıcıdan sayfayı yenilemesi beklenmez.
 */
@Component({
  selector: 'app-exam-waiting-room-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    AppStatusBadgeComponent,
  ],
  templateUrl: './exam-waiting-room.page.html',
  styleUrl: './exam-waiting-room.page.scss',
})
export class ExamWaitingRoomPage implements OnInit {
  private readonly repository = inject(SessionRepository);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  private readonly viewState = signal<WaitingRoomView | null>(null);
  private readonly statusState = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly errorState = signal<ApiError | null>(null);
  private readonly startingState = signal(false);
  private readonly nowMs = signal(Date.now());

  private offsetMs = 0;

  readonly view = this.viewState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.statusState() === 'loading');
  readonly hasError = computed(() => this.statusState() === 'error');
  readonly isStarting = this.startingState.asReadonly();

  readonly phaseMessages = WAITING_PHASE_MESSAGES;

  /** Başlangıca kalan süre — sunucu saatine göre. */
  readonly remainingMs = computed(() => {
    const view = this.viewState();
    if (!view) return 0;
    return Math.max(0, Date.parse(view.opensAt) - serverTime(this.nowMs(), this.offsetMs));
  });

  readonly countdown = computed(() => humanizeDuration(this.remainingMs()));

  readonly canStart = computed(() => {
    const view = this.viewState();
    return view !== null && canEnter(view.phase);
  });

  readonly startLabel = computed(() =>
    this.viewState()?.resumableToken ? 'Sınava devam et' : 'Sınava başla',
  );

  readonly openingTime = computed(() => this.formatDateTime(this.viewState()?.opensAt));
  readonly closingTime = computed(() => this.formatDateTime(this.viewState()?.closesAt));

  ngOnInit(): void {
    this.load();

    /*
     * Saniyelik tik: geri sayımı yürütür. Sayım bittiğinde durumu sunucudan
     * yeniden sorar — fazı istemci hesaplamaz, sunucu söyler.
     */
    const handle = setInterval(() => {
      this.nowMs.set(Date.now());

      const view = this.viewState();
      if (view?.phase === 'too_early' && this.remainingMs() === 0) this.load();
    }, 1000);

    this.destroyRef.onDestroy(() => clearInterval(handle));
  }

  load(): void {
    this.statusState.set(this.viewState() ? 'ready' : 'loading');
    this.errorState.set(null);

    this.repository.waitingRoom(this.id()).subscribe({
      next: (view) => {
        this.viewState.set(view);
        this.offsetMs = serverOffset(view.serverNow, Date.now());
        this.nowMs.set(Date.now());
        this.statusState.set('ready');
      },
      error: (error: ApiError) => {
        this.errorState.set(error);
        this.statusState.set('error');
      },
    });
  }

  /**
   * Sınavı başlatır.
   *
   * Yarım kalmış oturum varsa sunucu onu döndürür (BR-06); ekran ayrı bir yol
   * izlemez, her iki durumda da aynı jetonla oturum sayfasına gider.
   */
  start(): void {
    if (!this.canStart()) return;

    this.startingState.set(true);

    this.repository.start(this.id()).subscribe({
      next: (session) => {
        this.startingState.set(false);
        void this.router.navigate(['/session', session.session.token]);
      },
      error: (error: ApiError) => {
        this.startingState.set(false);
        this.errorState.set(error);
        this.statusState.set('error');
        // Hak dolması gibi durumlarda özet tazelenmeli.
        this.load();
      },
    });
  }

  back(): void {
    void this.router.navigate(['/my-exams']);
  }

  private formatDateTime(iso: string | undefined): string {
    if (!iso) return '—';

    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
