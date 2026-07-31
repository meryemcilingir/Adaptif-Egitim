import { DOCUMENT, Injectable, inject } from '@angular/core';

import { StorageAdapter } from './storage.token';

/**
 * `localStorage` gerçeklemesi.
 * Kota dolması / gizli mod gibi durumlarda uygulama çökmez, sessizce belleğe düşer.
 */
@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  private readonly storage = resolveStorage(inject(DOCUMENT));
  private readonly fallback = new Map<string, string>();

  get<T>(key: string): T | null {
    const raw = this.read(key);
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      // Bozuk kayıt uygulamayı kilitlememeli — temizle ve yok say.
      this.remove(key);
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    const raw = JSON.stringify(value);
    try {
      this.storage?.setItem(key, raw);
    } catch {
      this.fallback.set(key, raw);
    }
  }

  remove(key: string): void {
    this.fallback.delete(key);
    try {
      this.storage?.removeItem(key);
    } catch {
      /* yok sayılır */
    }
  }

  keys(): readonly string[] {
    const fromStorage: string[] = [];
    try {
      for (let i = 0; i < (this.storage?.length ?? 0); i++) {
        const key = this.storage?.key(i);
        if (key) fromStorage.push(key);
      }
    } catch {
      /* yok sayılır */
    }
    return [...new Set([...fromStorage, ...this.fallback.keys()])];
  }

  clearNamespace(prefix: string): void {
    for (const key of this.keys()) {
      if (key.startsWith(prefix)) this.remove(key);
    }
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? this.fallback.get(key) ?? null;
    } catch {
      return this.fallback.get(key) ?? null;
    }
  }
}

function resolveStorage(document: Document): Storage | null {
  try {
    return document.defaultView?.localStorage ?? null;
  } catch {
    return null;
  }
}
