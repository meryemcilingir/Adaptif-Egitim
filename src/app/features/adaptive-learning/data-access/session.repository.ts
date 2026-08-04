import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { API } from '../../../core/api/api-endpoints';
import {
  AnswerDraft,
  ConnectionState,
  SaveAnswerRequest,
  SessionView,
  SubmissionReceipt,
  WaitingRoomView,
} from '../models/exam-session.model';
import { AttemptState } from '../models/attempt.model';

/** Öğrencinin sınav geçmişindeki bir satır. */
export interface ExamHistoryRow {
  readonly attemptId: string;
  readonly examId: string;
  readonly examTitle: string;
  readonly courseCode: string;
  readonly startedAt: string;
  readonly submittedAt: string;
  readonly durationSeconds: number;
  readonly state: AttemptState;
  /** Sonuç açıklanmadıysa `null` gelir (BR-49). */
  readonly scorePercent: number | null;
  readonly passed: boolean | null;
}

/**
 * Sınav oturumu repository'si.
 *
 * `CrudRepository`'den TÜREMEZ: oturum bir katalog varlığı değildir, liste/yazma
 * uçları yoktur ve jetonla erişilir. Ortak soyutlamayı zorlamak burada yalnızca
 * kullanılmayan yüzey üretirdi.
 */
@Injectable({ providedIn: 'root' })
export class SessionRepository {
  private readonly api = inject(ApiClient);

  waitingRoom(examId: string): Observable<WaitingRoomView> {
    return this.api.get<WaitingRoomView>(API.sessions.waitingRoom(examId));
  }

  /** Oturum başlatır; yarım kalan varsa sunucu onu döndürür (BR-06). */
  start(examId: string): Observable<SessionView> {
    return this.api.post<SessionView>(API.sessions.start(examId), {});
  }

  byToken(token: string): Observable<SessionView> {
    return this.api.get<SessionView>(API.sessions.byToken(token));
  }

  saveAnswer(token: string, request: SaveAnswerRequest): Observable<AnswerDraft> {
    return this.api.put<AnswerDraft>(API.sessions.answers(token), request);
  }

  setFlag(token: string, questionId: string, flagged: boolean): Observable<SessionView> {
    return this.api.put<SessionView>(API.sessions.flag(token), { questionId, flagged });
  }

  /** Bulunulan soruyu sunucuya bildirir — yeniden bağlanınca oradan devam edilir. */
  setPosition(token: string, index: number): Observable<SessionView> {
    return this.api.put<SessionView>(API.sessions.position(token), { index });
  }

  heartbeat(
    token: string,
    connection: ConnectionState,
    fullscreen: boolean,
    tabSwitchCount: number,
  ): Observable<SessionView> {
    return this.api.post<SessionView>(API.sessions.heartbeat(token), {
      connection,
      fullscreen,
      tabSwitchCount,
    });
  }

  submit(token: string, autoSubmitted: boolean): Observable<SubmissionReceipt> {
    return this.api.post<SubmissionReceipt>(API.sessions.submit(token), { autoSubmitted });
  }

  myHistory(): Observable<readonly ExamHistoryRow[]> {
    return this.api.get<readonly ExamHistoryRow[]>(API.sessions.myHistory);
  }
}
