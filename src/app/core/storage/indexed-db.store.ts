import { DOCUMENT, Injectable, inject } from '@angular/core';

import { AsyncKeyValueStore } from './async-store.token';

const DB_NAME = 'adaptif';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

/**
 * IndexedDB tabanlı kalıcılık.
 *
 * Sahte veritabanı birkaç MB tuttuğu için localStorage yerine IndexedDB kullanılır.
 * IndexedDB kullanılamıyorsa (gizli mod, eski tarayıcı) sessizce belleğe düşülür:
 * uygulama çalışmaya devam eder, yalnızca yenilemede değişiklikler korunmaz.
 */
@Injectable()
export class IndexedDbStore implements AsyncKeyValueStore {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly fallback = new Map<string, unknown>();
  private connection: Promise<IDBDatabase | null> | null = null;

  async get<T>(key: string): Promise<T | null> {
    const db = await this.open();
    if (!db) return (this.fallback.get(key) as T) ?? null;

    return this.run<T | null>(db, 'readonly', (store) => store.get(key)).then(
      (value) => value ?? null,
    );
  }

  async set<T>(key: string, value: T): Promise<void> {
    const db = await this.open();
    if (!db) {
      this.fallback.set(key, value);
      return;
    }

    await this.run(db, 'readwrite', (store) => store.put(value, key));
  }

  async remove(key: string): Promise<void> {
    const db = await this.open();
    if (!db) {
      this.fallback.delete(key);
      return;
    }

    await this.run(db, 'readwrite', (store) => store.delete(key));
  }

  private open(): Promise<IDBDatabase | null> {
    this.connection ??= new Promise<IDBDatabase | null>((resolve) => {
      const indexedDb = this.window?.indexedDB;
      if (!indexedDb) {
        resolve(null);
        return;
      }

      let request: IDBOpenDBRequest;
      try {
        request = indexedDb.open(DB_NAME, DB_VERSION);
      } catch {
        resolve(null);
        return;
      }

      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });

    return this.connection;
  }

  private run<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let request: IDBRequest;
      try {
        request = operation(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
      } catch (error) {
        reject(error instanceof Error ? error : new Error('IndexedDB işlemi başarısız'));
        return;
      }

      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB işlemi başarısız'));
    });
  }
}
