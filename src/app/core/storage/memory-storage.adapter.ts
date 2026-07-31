import { Injectable } from '@angular/core';

import { StorageAdapter } from './storage.token';

/**
 * Bellek içi gerçekleme — testlerde `STORAGE_ADAPTER` yerine verilir (LSP).
 * Aynı sözleşmeyi karşıladığı için üretim kodunda hiçbir değişiklik gerekmez.
 */
@Injectable()
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly map = new Map<string, string>();

  get<T>(key: string): T | null {
    const raw = this.map.get(key);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }

  set<T>(key: string, value: T): void {
    this.map.set(key, JSON.stringify(value));
  }

  remove(key: string): void {
    this.map.delete(key);
  }

  keys(): readonly string[] {
    return [...this.map.keys()];
  }

  clearNamespace(prefix: string): void {
    for (const key of this.keys()) {
      if (key.startsWith(prefix)) this.remove(key);
    }
  }
}
