import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { of, throwError } from 'rxjs';

import { ApiError } from '../api/api-error';
import { CLOCK, ID_GENERATOR } from '../platform/platform.tokens';
import { MemoryStorageAdapter } from './memory-storage.adapter';
import { OutboxItem, OutboxQueue } from './outbox-queue';
import { STORAGE_ADAPTER } from './storage.token';

function setup(): OutboxQueue {
  let counter = 0;

  TestBed.configureTestingModule({
    providers: [
      { provide: STORAGE_ADAPTER, useClass: MemoryStorageAdapter },
      { provide: CLOCK, useValue: { now: () => 1_000 } },
      { provide: ID_GENERATOR, useValue: { next: () => `out_${++counter}` } },
    ],
  });

  return TestBed.inject(OutboxQueue);
}

const answer = (questionId: string, value: string) => ({
  groupKey: 'ses1',
  endpoint: `/api/sessions/ses1/answers`,
  method: 'PUT' as const,
  body: { questionId, value },
  dedupeKey: `ses1:${questionId}`,
});

describe('OutboxQueue', () => {
  let queue: OutboxQueue;

  beforeEach(() => {
    TestBed.resetTestingModule();
    queue = setup();
  });

  it('kayıtları eklenme sırasında tutar', () => {
    queue.enqueue(answer('q1', 'a'));
    queue.enqueue(answer('q2', 'b'));

    expect(queue.items().map((item) => item.dedupeKey)).toEqual(['ses1:q1', 'ses1:q2']);
  });

  /* Çevrimdışıyken aynı soruyu defalarca değiştirmek kuyruğu şişirmemeli. */
  it('aynı anahtarlı kaydı biriktirmez, yerinde günceller', () => {
    queue.enqueue(answer('q1', 'a'));
    queue.enqueue(answer('q2', 'b'));
    queue.enqueue(answer('q1', 'c'));

    expect(queue.pendingCount()).toBe(2);
    expect(queue.items()[0].body).toEqual({ questionId: 'q1', value: 'c' });
  });

  it('birleştirilen kayıt sıradaki yerini korur', () => {
    queue.enqueue(answer('q1', 'a'));
    queue.enqueue(answer('q2', 'b'));
    queue.enqueue(answer('q1', 'c'));

    expect(queue.items().map((item) => item.dedupeKey)).toEqual(['ses1:q1', 'ses1:q2']);
  });

  it('anahtarsız kayıtlar birleşmez', () => {
    const plain = { groupKey: 'g', endpoint: '/api/x', method: 'POST' as const, body: {} };
    queue.enqueue(plain);
    queue.enqueue(plain);

    expect(queue.pendingCount()).toBe(2);
  });

  it('başarılı gönderimde kaydı kuyruktan düşürür', async () => {
    queue.enqueue(answer('q1', 'a'));
    queue.enqueue(answer('q2', 'b'));

    await new Promise<void>((resolve) => {
      queue.flush(() => of(null)).subscribe({ complete: resolve });
    });

    expect(queue.pendingCount()).toBe(0);
  });

  it('gönderim sırasını korur', async () => {
    queue.enqueue(answer('q1', 'a'));
    queue.enqueue(answer('q2', 'b'));
    queue.enqueue(answer('q3', 'c'));

    const sent: string[] = [];
    await new Promise<void>((resolve) => {
      queue
        .flush((item: OutboxItem) => {
          sent.push(item.dedupeKey ?? '');
          return of(null);
        })
        .subscribe({ complete: resolve });
    });

    expect(sent).toEqual(['ses1:q1', 'ses1:q2', 'ses1:q3']);
  });

  /* Kalıcı hata kuyrukta kalsaydı sonraki cevaplar da hiç gönderilemezdi. */
  it('kalıcı hatada kaydı düşürerek kuyruğun tıkanmasını önler', async () => {
    queue.enqueue(answer('q1', 'a'));

    const permanent = new ApiError({
      code: 'BUSINESS_RULE',
      message: 'Süre doldu.',
      httpStatus: 422,
    });

    await new Promise<void>((resolve) => {
      queue.flush(() => throwError(() => permanent)).subscribe({ complete: resolve });
    });

    expect(queue.pendingCount()).toBe(0);
  });

  it('geçici hatada kaydı kuyrukta tutar ve deneme sayacını artırır', async () => {
    queue.enqueue(answer('q1', 'a'));

    const temporary = new ApiError({
      code: 'NETWORK',
      message: 'Bağlantı yok.',
      httpStatus: 0,
    });

    await new Promise<void>((resolve) => {
      queue.flush(() => throwError(() => temporary)).subscribe({ complete: resolve });
    });

    expect(queue.pendingCount()).toBe(1);
    expect(queue.items()[0].attempts).toBe(1);
  });

  it('gruba göre temizler', () => {
    queue.enqueue(answer('q1', 'a'));
    queue.enqueue({ groupKey: 'diger', endpoint: '/api/y', method: 'POST', body: {} });

    queue.clearGroup('ses1');

    expect(queue.pendingCount()).toBe(1);
    expect(queue.pendingFor('ses1')).toHaveLength(0);
  });
});
