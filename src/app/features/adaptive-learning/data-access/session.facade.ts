import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of, shareReplay } from 'rxjs';

import { ApiError } from '../../../core/api/api-error';
import { ToastStore } from '../../../core/observability/toast.store';
import { OutboxQueue } from '../../../core/storage/outbox-queue';
import {
  AnswerConflict,
  AnswerDraft,
  AnswerValue,
  ConnectionState,
  SessionQuestionView,
  SessionView,
  SubmissionReceipt,
  emptyAnswerValue,
  isAnswered,
} from '../models/exam-session.model';
import {
  ClockReading,
  TIMER_THRESHOLD_LABELS,
  crossedThreshold,
  readClock,
  serverOffset,
  serverTime,
} from '../domain/exam-clock';
import {
  NavigatorState,
  buildSubmitSummary,
  navigatorStateOf,
  sameAnswer,
} from '../domain/session.rules';
import { SessionRepository } from './session.repository';

/** Autosave gecikmesi — her tuş vuruşunda istek atılmaz. */
const AUTOSAVE_DEBOUNCE_MS = 900;
/** Değişiklik olmasa da düzenli aralıkla kaydedilir (şartname: ~30 sn). */
const PERIODIC_SAVE_MS = 30_000;
/** Sayaç ve bağlantı denetimi sıklığı. */
const TICK_MS = 1000;
const HEARTBEAT_MS = 15_000;

export type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

/** Navigatörde bir sorunun özeti. */
export interface NavigatorEntry {
  readonly questionId: string;
  readonly number: number;
  readonly state: NavigatorState;
}

/**
 * Sınav oturumu orkestrasyonu.
 *
 * Sorumlulukları: sunucu saatiyle senkron sayaç, cevapların gecikmeli ve
 * periyodik kaydı, bağlantı kesilince kuyruğa alma ve dönünce senkron, soru
 * navigasyonu, işaretleme ve teslim.
 *
 * Zamanla ilgili tüm kararlar `domain/exam-clock.ts` ve `domain/session.rules.ts`
 * içindeki saf fonksiyonlardan gelir; burada yalnızca zamanlayıcılar ve durum
 * yönetimi vardır.
 */
@Injectable()
export class SessionFacade {
  private readonly repository = inject(SessionRepository);
  private readonly outbox = inject(OutboxQueue);
  private readonly toast = inject(ToastStore);
  private readonly destroyRef = inject(DestroyRef);

  /* ── Durum ─────────────────────────────────────────────────────────────── */

  private readonly viewState = signal<SessionView | null>(null);
  private readonly statusState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  private readonly errorState = signal<ApiError | null>(null);

  private readonly answerState = signal<ReadonlyMap<string, AnswerValue>>(new Map());
  private readonly versionState = signal<ReadonlyMap<string, number>>(new Map());
  private readonly dirtyState = signal<ReadonlySet<string>>(new Set());

  private readonly indexState = signal(0);
  private readonly saveStatusState = signal<SaveState>('idle');
  private readonly lastSavedState = signal<string | null>(null);
  private readonly connectionState = signal<ConnectionState>('online');
  private readonly submittingState = signal(false);

  /** Sunucu ile istemci saati arasındaki fark (BR-07). */
  private offsetMs = 0;
  private nowMs = signal(Date.now());
  private tabSwitchCount = 0;
  private lastRemainingMs = Number.POSITIVE_INFINITY;

  private tickHandle: ReturnType<typeof setInterval> | null = null;
  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  private periodicHandle: ReturnType<typeof setInterval> | null = null;
  private autosaveHandle: ReturnType<typeof setTimeout> | null = null;

  /** Süre dolduğunda bir kez tetiklenir; ekran bunu dinleyip teslim eder. */
  private readonly expiredState = signal(false);

  /* ── Okunur yüzey ──────────────────────────────────────────────────────── */

  readonly view = this.viewState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.statusState() === 'loading');
  readonly hasError = computed(() => this.statusState() === 'error');
  readonly isReady = computed(() => this.statusState() === 'ready');

  readonly saveStatus = this.saveStatusState.asReadonly();
  readonly lastSavedAt = this.lastSavedState.asReadonly();
  readonly connection = this.connectionState.asReadonly();
  readonly isSubmitting = this.submittingState.asReadonly();
  readonly expired = this.expiredState.asReadonly();
  readonly pendingCount = this.outbox.pendingCount;

  readonly questions = computed<readonly SessionQuestionView[]>(
    () => this.viewState()?.questions ?? [],
  );

  readonly currentIndex = this.indexState.asReadonly();
  readonly currentQuestion = computed<SessionQuestionView | null>(
    () => this.questions()[this.indexState()] ?? null,
  );

  readonly flagged = computed<ReadonlySet<string>>(
    () => new Set(this.viewState()?.session.flaggedQuestionIds ?? []),
  );

  private readonly visited = computed<ReadonlySet<string>>(
    () => new Set(this.viewState()?.session.visitedQuestionIds ?? []),
  );

  private readonly answeredIds = computed<ReadonlySet<string>>(() => {
    const answers = this.answerState();
    const ids = new Set<string>();
    for (const [questionId, value] of answers) {
      if (isAnswered(value)) ids.add(questionId);
    }
    return ids;
  });

  readonly navigator = computed<readonly NavigatorEntry[]>(() => {
    const current = this.currentQuestion()?.questionId ?? null;
    const flagged = this.flagged();
    const visited = this.visited();
    const answeredIds = this.answeredIds();

    return this.questions().map((question, index) => ({
      questionId: question.questionId,
      number: index + 1,
      state: navigatorStateOf({
        questionId: question.questionId,
        currentQuestionId: current,
        flagged,
        visited,
        answeredIds,
      }),
    }));
  });

  /** Sayaç okuması — her saniye tazelenir, sunucu saatine göre. */
  readonly clock = computed<ClockReading | null>(() => {
    const session = this.viewState()?.session;
    if (!session) return null;

    return readClock(
      session.startedAt,
      session.expiresAt,
      serverTime(this.nowMs(), this.offsetMs),
    );
  });

  readonly summary = computed(() => {
    const drafts = this.draftsForSummary();
    return buildSubmitSummary(
      this.questions().map((question) => question.questionId),
      drafts,
      this.flagged(),
    );
  });

  answerFor(questionId: string): AnswerValue | null {
    return this.answerState().get(questionId) ?? null;
  }

  isFlagged(questionId: string): boolean {
    return this.flagged().has(questionId);
  }

  /* ── Yaşam döngüsü ─────────────────────────────────────────────────────── */

  load(token: string): void {
    this.statusState.set('loading');
    this.errorState.set(null);

    this.repository.byToken(token).subscribe({
      next: (view) => this.adopt(view),
      error: (error: ApiError) => {
        this.errorState.set(error);
        this.statusState.set('error');
      },
    });
  }

  start(examId: string): Observable<SessionView> {
    this.statusState.set('loading');

    // Teslimle aynı gerekçe: iki abonelik iki istek demektir.
    const request = this.repository
      .start(examId)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));

    request.subscribe({
      next: (view) => this.adopt(view),
      error: (error: ApiError) => {
        this.errorState.set(error);
        this.statusState.set('error');
      },
    });

    return request;
  }

  /** Ekran kapanırken çağrılır: bekleyen kayıt gönderilir, zamanlayıcılar durur. */
  release(): void {
    this.flushNow();
    this.stopTimers();
  }

  private adopt(view: SessionView): void {
    this.viewState.set(view);
    this.statusState.set('ready');

    this.offsetMs = serverOffset(view.session.serverNow, Date.now());
    this.nowMs.set(Date.now());
    this.lastSavedState.set(view.lastSavedAt);
    this.connectionState.set(view.session.connection);
    this.tabSwitchCount = view.integrity.tabSwitchCount;

    // Sunucudaki taslaklar yerel duruma alınır; boş sorular için boş değer kurulur.
    const answers = new Map<string, AnswerValue>();
    const versions = new Map<string, number>();

    for (const question of view.questions) {
      answers.set(question.questionId, emptyAnswerValue(question.answerKind));
      versions.set(question.questionId, 0);
    }
    for (const draft of view.answers) {
      answers.set(draft.questionId, draft.value);
      versions.set(draft.questionId, draft.version);
    }

    this.answerState.set(answers);
    this.versionState.set(versions);
    this.dirtyState.set(new Set());

    // Yeniden bağlanmada öğrenci kaldığı sorudan devam eder (şartname 8).
    this.indexState.set(
      Math.max(0, Math.min(view.questions.length - 1, view.session.currentQuestionIndex)),
    );

    this.lastRemainingMs = this.clock()?.remainingMs ?? Number.POSITIVE_INFINITY;
    this.startTimers();
  }

  private startTimers(): void {
    this.stopTimers();

    this.tickHandle = setInterval(() => this.tick(), TICK_MS);
    this.heartbeatHandle = setInterval(() => this.sendHeartbeat(), HEARTBEAT_MS);
    this.periodicHandle = setInterval(() => this.flushNow(), PERIODIC_SAVE_MS);

    this.destroyRef.onDestroy(() => this.stopTimers());
  }

  private stopTimers(): void {
    for (const handle of [this.tickHandle, this.heartbeatHandle, this.periodicHandle]) {
      if (handle !== null) clearInterval(handle);
    }
    if (this.autosaveHandle !== null) clearTimeout(this.autosaveHandle);

    this.tickHandle = null;
    this.heartbeatHandle = null;
    this.periodicHandle = null;
    this.autosaveHandle = null;
  }

  /**
   * Saniyelik döngü.
   *
   * Eşik uyarıları burada tetiklenir ve her eşik YALNIZCA BİR KEZ gösterilir
   * (`crossedThreshold`). Süre bittiğinde `expired` işaretlenir; teslimi ekran
   * yapar, çünkü onay diyaloğu ve yönlendirme sunum katmanının işidir.
   */
  private tick(): void {
    this.nowMs.set(Date.now());

    const reading = this.clock();
    if (!reading) return;

    const crossed = crossedThreshold(this.lastRemainingMs, reading.remainingMs);
    if (crossed !== null) {
      this.toast.warning(TIMER_THRESHOLD_LABELS[crossed]);
    }
    this.lastRemainingMs = reading.remainingMs;

    if (reading.expired && !this.expiredState()) {
      this.expiredState.set(true);
    }
  }

  /* ── Cevaplar ──────────────────────────────────────────────────────────── */

  /**
   * Cevabı yerel duruma yazar ve gecikmeli kaydı tetikler.
   *
   * Değer gerçekten değişmediyse hiçbir şey yapılmaz: kullanıcı bir seçeneği
   * işaretleyip geri aldığında sunucuya istek gitmemelidir.
   */
  setAnswer(questionId: string, value: AnswerValue): void {
    const current = this.answerState().get(questionId);
    if (current && sameAnswer(current, value)) return;

    this.answerState.update((map) => new Map(map).set(questionId, value));
    this.dirtyState.update((set) => new Set(set).add(questionId));

    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.autosaveHandle !== null) clearTimeout(this.autosaveHandle);
    this.autosaveHandle = setTimeout(() => this.flushNow(), AUTOSAVE_DEBOUNCE_MS);
  }

  /** Bekleyen tüm değişiklikleri gönderir (adım değişimi, periyodik, çıkış). */
  flushNow(): void {
    const view = this.viewState();
    const dirty = [...this.dirtyState()];
    if (!view || dirty.length === 0) return;

    this.dirtyState.set(new Set());
    this.saveStatusState.set(this.connectionState() === 'offline' ? 'offline' : 'saving');

    for (const questionId of dirty) {
      this.saveOne(view.session.token, questionId);
    }
  }

  private saveOne(token: string, questionId: string): void {
    const value = this.answerState().get(questionId);
    if (!value) return;

    const request = {
      questionId,
      value,
      version: this.versionState().get(questionId) ?? 0,
      answeredAt: new Date(serverTime(Date.now(), this.offsetMs)).toISOString(),
    };

    /*
     * Çevrimdışıyken istek atılmaz, kuyruğa alınır (BR-10). Aynı sorunun
     * tekrarlanan kayıtları `dedupeKey` ile birleşir; bağlantı gelince yalnızca
     * son değer gider.
     */
    if (this.connectionState() === 'offline') {
      this.outbox.enqueue({
        groupKey: token,
        endpoint: `/api/sessions/${token}/answers`,
        method: 'PUT',
        body: request,
        dedupeKey: `${token}:${questionId}`,
      });
      this.saveStatusState.set('offline');
      return;
    }

    this.repository.saveAnswer(token, request).subscribe({
      next: (draft) => this.acceptDraft(draft),
      error: (error: ApiError) => this.handleSaveError(token, questionId, request, error),
    });
  }

  private acceptDraft(draft: AnswerDraft): void {
    this.versionState.update((map) => new Map(map).set(draft.questionId, draft.version));
    this.lastSavedState.set(draft.savedAt);

    // Başka bir kayıt sürüyorsa "kaydedildi" demek yanıltıcı olurdu.
    if (this.dirtyState().size === 0) this.saveStatusState.set('saved');
  }

  /**
   * Kayıt hatası.
   *
   * Üç ayrı durum vardır ve hepsi farklı davranış ister:
   * · Ağ hatası GEÇİCİDİR → kuyruğa alınır, bağlantı gelince gönderilir.
   * · Sürüm çakışması (BR-09) → sunucudaki cevap daha yenidir; sessizce
   *   ezilmez, yerel duruma alınır ve kullanıcı bilgilendirilir.
   * · Diğer iş kuralı hataları KALICIDIR (örn. süre doldu) → tekrar denenmez.
   */
  private handleSaveError(
    token: string,
    questionId: string,
    body: unknown,
    error: ApiError,
  ): void {
    if (error.code === 'VERSION_CONFLICT') {
      this.resolveConflict(error);
      return;
    }

    if (error.retryable) {
      this.connectionState.set('offline');
      this.saveStatusState.set('offline');
      this.outbox.enqueue({
        groupKey: token,
        endpoint: `/api/sessions/${token}/answers`,
        method: 'PUT',
        body,
        dedupeKey: `${token}:${questionId}`,
      });
      return;
    }

    this.saveStatusState.set('error');
    this.toast.error(error.message);
  }

  /**
   * Sürüm çakışmasını çözer (BR-09).
   *
   * Karar SUNUCU LEHİNEDİR ve bu bilinçli: çakışma pratikte öğrencinin sınavı
   * iki sekmede açmasından doğar ve iki cevap da kendisine aittir. Kullanıcıya
   * "hangisini istersiniz?" diye sormak, sınav süresi akarken çözülmesi zor bir
   * soru yöneltmek olurdu. Kaybedilen değer sessizce atılmaz; ne olduğu açıkça
   * söylenir ve ekrandaki cevap sunucudakiyle eşitlenir.
   */
  private resolveConflict(error: ApiError): void {
    const details = error.details as Partial<AnswerConflict> | undefined;
    const questionId = details?.questionId;
    const serverValue = details?.serverValue;

    if (!questionId || !serverValue) {
      this.saveStatusState.set('error');
      this.toast.error(error.message);
      return;
    }

    this.answerState.update((map) => new Map(map).set(questionId, serverValue));
    this.versionState.update((map) =>
      new Map(map).set(questionId, details?.serverVersion ?? 0),
    );
    this.dirtyState.update((set) => {
      const next = new Set(set);
      next.delete(questionId);
      return next;
    });

    this.saveStatusState.set('saved');
    this.toast.warning(
      'Bu soru başka bir sekmede güncellenmiş.',
      'Ekrandaki cevap, en son kaydedilen hâliyle değiştirildi.',
    );
  }

  /* ── Bağlantı ──────────────────────────────────────────────────────────── */

  /** Tarayıcının online/offline olayları buraya bağlanır. */
  setConnection(connection: ConnectionState): void {
    const previous = this.connectionState();
    if (previous === connection) return;

    this.connectionState.set(connection);

    if (connection === 'offline') {
      this.saveStatusState.set('offline');
      this.toast.warning('Bağlantı kesildi. Cevaplarınız cihazınızda saklanıyor.');
      return;
    }

    this.toast.success('Bağlantı geri geldi. Bekleyen cevaplar gönderiliyor.');
    this.syncOutbox();
  }

  registerTabSwitch(): void {
    this.tabSwitchCount += 1;
  }

  /** Kuyruktaki cevapları sırayla gönderir. */
  private syncOutbox(): void {
    const view = this.viewState();
    if (!view || this.outbox.pendingFor(view.session.token).length === 0) {
      this.saveStatusState.set('saved');
      return;
    }

    this.saveStatusState.set('saving');

    this.outbox
      .flush((item) =>
        this.repository.saveAnswer(view.session.token, item.body as never).pipe(),
      )
      .subscribe({
        complete: () => {
          this.saveStatusState.set(this.outbox.pendingCount() === 0 ? 'saved' : 'error');
          this.reloadQuietly();
        },
      });
  }

  private sendHeartbeat(): void {
    const view = this.viewState();
    if (!view || this.connectionState() === 'offline') return;

    this.repository
      .heartbeat(view.session.token, this.connectionState(), isFullscreen(), this.tabSwitchCount)
      .subscribe({
        next: (updated) => this.mergeSession(updated),
        // Kalp atışı başarısızsa bağlantı gitmiş demektir; kullanıcı zaten uyarılır.
        error: () => this.setConnection('offline'),
      });
  }

  /** Sunucu durumunu tazeler ama yerel cevapları EZMEZ. */
  private reloadQuietly(): void {
    const view = this.viewState();
    if (!view) return;

    this.repository.byToken(view.session.token).subscribe({
      next: (fresh) => {
        this.mergeSession(fresh);
        this.lastSavedState.set(fresh.lastSavedAt);

        const versions = new Map(this.versionState());
        for (const draft of fresh.answers) versions.set(draft.questionId, draft.version);
        this.versionState.set(versions);
      },
      error: () => undefined,
    });
  }

  private mergeSession(fresh: SessionView): void {
    this.offsetMs = serverOffset(fresh.session.serverNow, Date.now());
    this.viewState.update((current) =>
      current ? { ...current, session: fresh.session, integrity: fresh.integrity } : fresh,
    );
  }

  /* ── Navigasyon ────────────────────────────────────────────────────────── */

  goTo(index: number): void {
    const bounded = Math.max(0, Math.min(this.questions().length - 1, index));
    if (bounded === this.indexState()) return;

    // Soru değişirken bekleyen cevap gönderilir; geride kayıp bırakılmaz.
    this.flushNow();
    this.indexState.set(bounded);

    const view = this.viewState();
    if (!view || this.connectionState() === 'offline') return;

    this.repository.setPosition(view.session.token, bounded).subscribe({
      next: (updated) => this.mergeSession(updated),
      error: () => undefined,
    });
  }

  next(): void {
    this.goTo(this.indexState() + 1);
  }

  previous(): void {
    this.goTo(this.indexState() - 1);
  }

  toggleFlag(questionId: string): void {
    const view = this.viewState();
    if (!view) return;

    const flagged = !this.isFlagged(questionId);

    // İyimser güncelleme: işaret anında görünür, sunucu arkadan onaylar.
    this.viewState.update((current) =>
      current
        ? {
            ...current,
            session: {
              ...current.session,
              flaggedQuestionIds: flagged
                ? [...current.session.flaggedQuestionIds, questionId]
                : current.session.flaggedQuestionIds.filter((id) => id !== questionId),
            },
          }
        : current,
    );

    this.repository.setFlag(view.session.token, questionId, flagged).subscribe({
      next: (updated) => this.mergeSession(updated),
      error: () => this.reloadQuietly(),
    });
  }

  /** İşaretli ilk soruya atlar — teslim özetinden kullanılır. */
  goToFirstFlagged(): void {
    const index = this.questions().findIndex((question) => this.isFlagged(question.questionId));
    if (index >= 0) this.goTo(index);
  }

  goToFirstUnanswered(): void {
    const answered = this.answeredIds();
    const index = this.questions().findIndex(
      (question) => !answered.has(question.questionId),
    );
    if (index >= 0) this.goTo(index);
  }

  /* ── Teslim ────────────────────────────────────────────────────────────── */

  submit(autoSubmitted: boolean): Observable<SubmissionReceipt> {
    const view = this.viewState();
    if (!view) return of() as Observable<SubmissionReceipt>;

    this.submittingState.set(true);
    this.flushNow();
    this.stopTimers();

    /*
     * `shareReplay` şart: ekran da bu observable'a abone olup makbuzu alır.
     * Paylaşılmasaydı ikinci abonelik ikinci bir POST tetikler ve sunucu
     * "bu oturum zaten teslim edilmiş" diye reddederdi (BR-48).
     */
    const request = this.repository
      .submit(view.session.token, autoSubmitted)
      .pipe(shareReplay({ bufferSize: 1, refCount: false }));

    request.subscribe({
      next: () => {
        this.submittingState.set(false);
        this.outbox.clearGroup(view.session.token);
      },
      error: (error: ApiError) => {
        this.submittingState.set(false);
        this.toast.error(error.message);
      },
    });

    return request;
  }

  /** Özet için taslak listesi — yerel cevaplardan üretilir. */
  private draftsForSummary(): AnswerDraft[] {
    const token = this.viewState()?.session.token ?? '';

    return [...this.answerState().entries()].map(([questionId, value]) => ({
      id: questionId,
      sessionToken: token,
      questionId,
      value,
      version: this.versionState().get(questionId) ?? 0,
      syncState: 'SYNCED' as const,
      updatedAt: '',
      savedAt: null,
    }));
  }
}

/** Tam ekran durumu — tarayıcı dışında (test/SSR) her zaman false. */
function isFullscreen(): boolean {
  return typeof document !== 'undefined' && document.fullscreenElement !== null;
}
