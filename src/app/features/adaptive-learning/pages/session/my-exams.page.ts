import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ApiError } from '../../../../core/api/api-error';
import { createPageRequest } from '../../../../core/api/page-request';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { ATTEMPT_STATE_LABELS } from '../../models/attempt.model';
import { Exam } from '../../models/exam.model';
import { examRuntimeStatus } from '../../domain/exam-runtime';
import { formatDuration } from '../../domain/exam-clock';
import { ExamRepository } from '../../data-access/exam.repository';
import { ExamHistoryRow, SessionRepository } from '../../data-access/session.repository';

/**
 * Öğrencinin sınav sayfası.
 *
 * İki bölüm bir arada: ÖNCE yaklaşan/açık sınavlar (yapılacak iş), SONRA geçmiş
 * denemeler (olan biten). Ayrı iki ekrana bölmek, öğrenciyi "sınavım nerede?"
 * sorusuyla iki sayfa arasında dolaştırırdı.
 *
 * Puan yalnızca sonucu AÇIKLANMIŞ denemelerde görünür (BR-49); diğerlerinde
 * sürecin hangi aşamada olduğu yazılır.
 */
@Component({
  selector: 'app-my-exams-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    AppStatusBadgeComponent,
  ],
  templateUrl: './my-exams.page.html',
  styleUrl: './my-exams.page.scss',
})
export class MyExamsPage implements OnInit {
  private readonly sessions = inject(SessionRepository);
  private readonly exams = inject(ExamRepository);
  private readonly router = inject(Router);

  private readonly historyState = signal<readonly ExamHistoryRow[]>([]);
  private readonly examState = signal<readonly Exam[]>([]);
  private readonly statusState = signal<'loading' | 'ready' | 'error'>('loading');
  private readonly errorState = signal<ApiError | null>(null);

  private readonly nowMs = Date.now();

  readonly history = this.historyState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly isLoading = computed(() => this.statusState() === 'loading');
  readonly hasError = computed(() => this.statusState() === 'error');

  readonly stateLabels = ATTEMPT_STATE_LABELS;

  /* ── Arama ve ders filtresi ───────────────────────────────────────────── */

  private readonly searchState = signal('');
  private readonly courseFilterState = signal<string | null>(null);

  readonly search = this.searchState.asReadonly();
  readonly courseFilter = this.courseFilterState.asReadonly();

  /** Sınav başlıkları hep "DERSKODU Sınav adı" biçimindedir. */
  private courseCodeOf(title: string): string {
    return title.split(' ')[0] ?? '';
  }

  readonly courseOptions = computed(() => {
    const codes = new Set<string>();
    for (const exam of this.examState()) codes.add(this.courseCodeOf(exam.title));
    for (const row of this.historyState()) codes.add(row.courseCode);
    return [...codes].sort((a, b) => a.localeCompare(b, 'tr-TR'));
  });

  private matchesFilters(title: string, courseCode: string): boolean {
    const course = this.courseFilterState();
    if (course && courseCode !== course) return false;

    const term = this.searchState().trim().toLocaleLowerCase('tr-TR');
    if (term.length === 0) return true;
    return title.toLocaleLowerCase('tr-TR').includes(term);
  }

  onSearchInput(event: Event): void {
    this.searchState.set((event.target as HTMLInputElement).value);
  }

  onCourseFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.courseFilterState.set(value === '' ? null : value);
  }

  clearFilters(): void {
    this.searchState.set('');
    this.courseFilterState.set(null);
  }

  /**
   * Girilebilir veya yaklaşan sınavlar.
   *
   * Kapanmış sınavlar burada gösterilmez; onlar zaten geçmişte yer alır.
   * Sıralama en yakın tarihli önce gelecek biçimdedir.
   */
  readonly upcoming = computed(() =>
    this.examState()
      .filter((exam) => {
        const status = examRuntimeStatus(exam, this.nowMs);
        return status === 'active' || status === 'scheduled';
      })
      .filter((exam) => this.matchesFilters(exam.title, this.courseCodeOf(exam.title)))
      .sort((a, b) => a.opensAt.localeCompare(b.opensAt)),
  );

  /*
   * Geçmiş denemeler İKİYE ayrılır: sonucu açıklanan ve değerlendirme bekleyen.
   *
   * Tek liste hâlinde puanlı ve puansız satırlar iç içe geçince "sonucum çıktı
   * mı?" sorusunu yanıtlamak için tüm listeyi taramak gerekiyordu.
   */
  readonly releasedHistory = computed(() =>
    this.history()
      .filter((row) => this.isReleased(row))
      .filter((row) => this.matchesFilters(row.examTitle, row.courseCode)),
  );

  readonly pendingHistory = computed(() =>
    this.history()
      .filter((row) => !this.isReleased(row))
      .filter((row) => this.matchesFilters(row.examTitle, row.courseCode)),
  );

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.statusState.set('loading');
    this.errorState.set(null);

    forkJoin({
      history: this.sessions.myHistory(),
      exams: this.exams.list(createPageRequest({ size: 100 })),
    }).subscribe({
      next: ({ history, exams }) => {
        this.historyState.set(history);
        this.examState.set(exams.items);
        this.statusState.set('ready');
      },
      error: (error: ApiError) => {
        this.errorState.set(error);
        this.statusState.set('error');
      },
    });
  }

  /* ── Gösterim ──────────────────────────────────────────────────────────── */

  isOpen(exam: Exam): boolean {
    return examRuntimeStatus(exam, this.nowMs) === 'active';
  }

  examStatusLabel(exam: Exam): string {
    return this.isOpen(exam) ? 'Şu anda açık' : 'Planlandı';
  }

  formatWindow(exam: Exam): string {
    const opens = new Date(exam.opensAt).toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });

    return `${opens} · ${exam.durationMinutes} dakika`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  durationOf(row: ExamHistoryRow): string {
    return formatDuration(row.durationSeconds * 1000);
  }

  toneFor(state: string) {
    return statusPresentation(state);
  }

  /** Sonuç açıklandıysa puan, açıklanmadıysa sürecin aşaması gösterilir. */
  resultLabel(row: ExamHistoryRow): string {
    if (row.scorePercent === null) return this.stateLabels[row.state];
    return `%${row.scorePercent} · ${row.passed ? 'Geçti' : 'Kaldı'}`;
  }

  isReleased(row: ExamHistoryRow): boolean {
    return row.scorePercent !== null;
  }

  /* ── Gezinme ───────────────────────────────────────────────────────────── */

  enter(exam: Exam): void {
    void this.router.navigate(['/exams', exam.id, 'waiting-room']);
  }

  openAttempt(row: ExamHistoryRow): void {
    void this.router.navigate(['/attempts', row.attemptId]);
  }
}
