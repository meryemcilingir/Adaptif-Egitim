import { describe, expect, it } from 'vitest';

import {
  crossedThreshold,
  formatDuration,
  humanizeDuration,
  readClock,
  serverOffset,
  serverTime,
  urgencyOf,
} from './exam-clock';

const START = '2026-03-10T09:00:00.000Z';
const EXPIRES = '2026-03-10T10:00:00.000Z';

const at = (iso: string) => Date.parse(iso);

describe('serverOffset', () => {
  it('istemci geride kaldığında pozitif fark üretir', () => {
    const offset = serverOffset('2026-03-10T09:00:30.000Z', at('2026-03-10T09:00:00.000Z'));
    expect(offset).toBe(30_000);
  });

  it('istemci saati ileri alınmışsa negatif fark üretir', () => {
    const offset = serverOffset('2026-03-10T09:00:00.000Z', at('2026-03-10T09:05:00.000Z'));
    expect(offset).toBe(-300_000);
  });

  /* BR-07'nin özü: öğrenci saatini geri alırsa süre uzamamalı. */
  it('istemci saati geri alınsa da düzeltilmiş zaman sunucuyu izler', () => {
    const offset = serverOffset('2026-03-10T09:30:00.000Z', at('2026-03-10T09:30:00.000Z'));
    const tampered = at('2026-03-10T09:00:00.000Z');

    expect(serverTime(tampered, offset)).toBe(at('2026-03-10T09:00:00.000Z'));
    expect(readClock(START, EXPIRES, serverTime(tampered, offset)).remainingMs).toBe(3_600_000);
  });
});

describe('readClock', () => {
  it('kalan ve geçen süreyi hesaplar', () => {
    const reading = readClock(START, EXPIRES, at('2026-03-10T09:45:00.000Z'));

    expect(reading.remainingMs).toBe(900_000);
    expect(reading.elapsedMs).toBe(2_700_000);
    expect(reading.totalMs).toBe(3_600_000);
    expect(reading.percentRemaining).toBe(25);
    expect(reading.expired).toBe(false);
  });

  it('süre dolduğunda negatife düşmez', () => {
    const reading = readClock(START, EXPIRES, at('2026-03-10T11:00:00.000Z'));

    expect(reading.remainingMs).toBe(0);
    expect(reading.expired).toBe(true);
    expect(reading.elapsedMs).toBe(3_600_000);
  });

  it('başlamadan önce sorulursa geçen süre negatif olmaz', () => {
    const reading = readClock(START, EXPIRES, at('2026-03-10T08:00:00.000Z'));
    expect(reading.elapsedMs).toBe(0);
  });
});

describe('urgencyOf', () => {
  it('eşiklere göre aciliyet verir', () => {
    expect(urgencyOf(20 * 60_000)).toBe('normal');
    expect(urgencyOf(5 * 60_000)).toBe('warning');
    expect(urgencyOf(60_000)).toBe('critical');
    expect(urgencyOf(0)).toBe('critical');
  });
});

describe('crossedThreshold', () => {
  it('eşik geçildiğinde bir kez bildirir', () => {
    expect(crossedThreshold(10 * 60_000 + 1000, 10 * 60_000 - 1000)).toBe(600_000);
  });

  it('eşiğin altında kalmaya devam ederken tekrar bildirmez', () => {
    expect(crossedThreshold(9 * 60_000, 8 * 60_000)).toBeNull();
  });

  it('eşiğin üstündeyken bildirmez', () => {
    expect(crossedThreshold(30 * 60_000, 20 * 60_000)).toBeNull();
  });

  /* Sekme arka planda kalınca tarayıcı zamanlayıcıyı kısar ve büyük sıçrama olur. */
  it('birden fazla eşik aynı anda geçilirse en acil olanı bildirir', () => {
    expect(crossedThreshold(12 * 60_000, 30_000)).toBe(60_000);
  });
});

describe('formatDuration', () => {
  it('bir saatin altında dakika:saniye gösterir', () => {
    expect(formatDuration(125_000)).toBe('02:05');
  });

  it('bir saatin üstünde saat:dakika:saniye gösterir', () => {
    expect(formatDuration(3_725_000)).toBe('01:02:05');
  });

  it('negatif değeri sıfırlar', () => {
    expect(formatDuration(-5000)).toBe('00:00');
  });
});

describe('humanizeDuration', () => {
  it('ölçeğe göre en anlamlı iki birimi seçer', () => {
    expect(humanizeDuration(2 * 86_400_000)).toBe('2 gün 0 saat');
    expect(humanizeDuration(3 * 3_600_000 + 15 * 60_000)).toBe('3 saat 15 dakika');
    expect(humanizeDuration(90_000)).toBe('1 dakika 30 saniye');
    expect(humanizeDuration(45_000)).toBe('45 saniye');
  });
});
