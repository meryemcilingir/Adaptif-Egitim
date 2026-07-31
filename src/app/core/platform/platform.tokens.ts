import { InjectionToken } from '@angular/core';

/**
 * Yan etkili platform yetenekleri arayüz arkasına alınır (DIP).
 * Sınav sayacı, versiyon üretimi ve seed verisi testte deterministik olmalı;
 * bu yüzden zaman / kimlik / rastgelelik doğrudan kullanılmaz.
 */

export interface Clock {
  /** Epoch milisaniye. */
  now(): number;
}

export interface IdGenerator {
  next(prefix?: string): string;
}

export interface RandomSource {
  /** [0, 1) aralığında sayı. */
  next(): number;
}

export const CLOCK = new InjectionToken<Clock>('CLOCK', {
  providedIn: 'root',
  factory: (): Clock => ({ now: () => Date.now() }),
});

export const ID_GENERATOR = new InjectionToken<IdGenerator>('ID_GENERATOR', {
  providedIn: 'root',
  factory: (): IdGenerator => ({
    next: (prefix = 'id') => `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
  }),
});

export const RANDOM = new InjectionToken<RandomSource>('RANDOM', {
  providedIn: 'root',
  factory: (): RandomSource => ({ next: () => Math.random() }),
});
