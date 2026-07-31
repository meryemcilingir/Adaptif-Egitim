import { InjectionToken } from '@angular/core';

/**
 * Asenkron anahtar-değer deposu.
 *
 * `StorageAdapter` (senkron, localStorage) küçük tercihler ve oturum için yeterlidir;
 * ancak sahte veritabanı megabaytlar tutar ve localStorage kotasını (≈5 MB) aşar.
 * Bu yüzden veritabanı kalıcılığı ayrı, ASENKRON bir sözleşmeye bağlanır.
 */
export interface AsyncKeyValueStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export const ASYNC_STORE = new InjectionToken<AsyncKeyValueStore>('ASYNC_STORE');
