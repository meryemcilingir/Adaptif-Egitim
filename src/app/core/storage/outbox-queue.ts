import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, concatMap, from, of, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ApiError } from '../api/api-error';
import { CLOCK, ID_GENERATOR } from '../platform/platform.tokens';
import { STORAGE_ADAPTER, STORAGE_KEYS } from './storage.token';

export type OutboxMethod = 'POST' | 'PUT' | 'PATCH';

export interface OutboxItem {
  readonly id: string;
  /** Aynı gruptaki kayıtlar SIRAYLA gönderilir (ör. tek sınav oturumu). */
  readonly groupKey: string;
  readonly endpoint: string;
  readonly method: OutboxMethod;
  readonly body: unknown;
  readonly createdAt: number;
  readonly attempts: number;
  readonly lastError: string | null;
}

export type OutboxSender = (item: OutboxItem) => Observable<unknown>;

const MAX_ATTEMPTS = 5;

/**
 * Bağlantı kesildiğinde yazma isteklerini sıraya alır, bağlantı gelince
 * **eklenme sırasını koruyarak** gönderir (BR-10).
 *
 * Sıra korunmazsa eski autosave yenisini ezebilir; bu yüzden `concatMap` kullanılır,
 * paralel gönderim yapılmaz.
 */
@Injectable({ providedIn: 'root' })
export class OutboxQueue {
  private readonly storage = inject(STORAGE_ADAPTER);
  private readonly idGenerator = inject(ID_GENERATOR);
  private readonly clock = inject(CLOCK);

  private readonly state = signal<readonly OutboxItem[]>(
    this.storage.get<OutboxItem[]>(STORAGE_KEYS.outbox) ?? [],
  );
  private readonly flushing = signal(false);

  readonly items = this.state.asReadonly();
  readonly pendingCount = computed(() => this.state().length);
  readonly hasPending = computed(() => this.state().length > 0);
  readonly isFlushing = this.flushing.asReadonly();

  pendingFor(groupKey: string): readonly OutboxItem[] {
    return this.state().filter((item) => item.groupKey === groupKey);
  }

  enqueue(input: Pick<OutboxItem, 'groupKey' | 'endpoint' | 'method' | 'body'>): OutboxItem {
    const item: OutboxItem = {
      ...input,
      id: this.idGenerator.next('outbox'),
      createdAt: this.clock.now(),
      attempts: 0,
      lastError: null,
    };
    this.write([...this.state(), item]);
    return item;
  }

  /**
   * Kuyruğu sırayla boşaltır.
   * Bir kayıt kalıcı hata alırsa (iş kuralı / yetki) kuyruktan düşer —
   * aksi hâlde kuyruk sonsuza dek tıkanırdı. Geçici hatada denemesi artırılır.
   */
  flush(send: OutboxSender): Observable<OutboxItem> {
    if (this.flushing()) return of();
    this.flushing.set(true);

    const queue = [...this.state()];
    return from(queue).pipe(
      concatMap((item) =>
        send(item).pipe(
          tap(() => this.remove(item.id)),
          catchError((error: unknown) => {
            this.registerFailure(item, error);
            return of(null);
          }),
          concatMap(() => of(item)),
        ),
      ),
      tap({
        complete: () => this.flushing.set(false),
        error: () => this.flushing.set(false),
      }),
    );
  }

  remove(id: string): void {
    this.write(this.state().filter((item) => item.id !== id));
  }

  clearGroup(groupKey: string): void {
    this.write(this.state().filter((item) => item.groupKey !== groupKey));
  }

  clear(): void {
    this.write([]);
  }

  private registerFailure(item: OutboxItem, error: unknown): void {
    const permanent = error instanceof ApiError && !error.retryable;
    const attempts = item.attempts + 1;

    if (permanent || attempts >= MAX_ATTEMPTS) {
      this.remove(item.id);
      return;
    }

    this.write(
      this.state().map((current) =>
        current.id === item.id
          ? {
              ...current,
              attempts,
              lastError: error instanceof Error ? error.message : 'Bilinmeyen hata',
            }
          : current,
      ),
    );
  }

  private write(items: readonly OutboxItem[]): void {
    this.state.set(items);
    this.storage.set(STORAGE_KEYS.outbox, items);
  }
}
