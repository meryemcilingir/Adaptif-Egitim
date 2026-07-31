import { InjectionToken } from '@angular/core';

/**
 * Depolama soyutlaması (DIP — PROJECT_RULES.md §2).
 * Uygulama `localStorage`'a değil, bu arayüze bağımlıdır; testte bellek gerçeklemesi verilir.
 */
export interface StorageAdapter {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  keys(): readonly string[];
  /** Verilen önekle başlayan tüm anahtarları siler (namespace temizliği). */
  clearNamespace(prefix: string): void;
}

export const STORAGE_ADAPTER = new InjectionToken<StorageAdapter>('STORAGE_ADAPTER');

/** Uygulama genelinde kullanılan depolama anahtarları. */
export const STORAGE_KEYS = {
  session: 'adaptif.session',
  db: 'adaptif.db',
  dbSchemaVersion: 'adaptif.db.schema',
  outbox: 'adaptif.outbox',
  uiPreferences: 'adaptif.ui',
  mockConfig: 'adaptif.mock-config',
} as const;
