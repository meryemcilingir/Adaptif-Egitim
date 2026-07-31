import { Injectable } from '@angular/core';

import { AsyncKeyValueStore } from './async-store.token';

/** Testlerde `ASYNC_STORE` yerine verilen bellek gerçeklemesi (LSP). */
@Injectable()
export class MemoryAsyncStore implements AsyncKeyValueStore {
  private readonly map = new Map<string, unknown>();

  get<T>(key: string): Promise<T | null> {
    return Promise.resolve((this.map.get(key) as T) ?? null);
  }

  set<T>(key: string, value: T): Promise<void> {
    this.map.set(key, value);
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.map.delete(key);
    return Promise.resolve();
  }
}
