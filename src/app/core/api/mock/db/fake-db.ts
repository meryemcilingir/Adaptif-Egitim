import { Injectable, inject, signal } from '@angular/core';

import { ASYNC_STORE } from '../../../storage/async-store.token';
import { STORAGE_KEYS } from '../../../storage/storage.token';
import { Collection, Identified } from './collection';
import { COLLECTION_NAMES, CollectionName, DB_SCHEMA_VERSION, DbSchema } from './db-schema';

type Entity<K extends CollectionName> = DbSchema[K][number] & Identified;

interface PersistedDb {
  readonly schemaVersion: number;
  readonly data: DbSchema;
}

/**
 * Demo veri üreticisi DİNAMİK olarak yüklenir.
 *
 * Seed modülü ders katalogunu, soru şablonlarını ve tüm üretim mantığını içerir;
 * yalnızca ilk açılışta (veya sıfırlamada) gerekir. Dinamik import bu kodu
 * başlangıç paketinden ayırır.
 */
async function seed(): Promise<DbSchema> {
  const { buildSeed } = await import('../seed/build-seed');
  return buildSeed();
}

/**
 * Bellek içi sahte veritabanı.
 *
 * · Kalıcılık IndexedDB üzerinden yapılır; veri seti birkaç MB olduğu için
 *   localStorage kotası yetmezdi.
 * · Yükleme asenkron olduğundan uygulama açılışında `init()` beklenir
 *   (bkz. `app.config.ts` → `provideAppInitializer`).
 * · Şema sürümü değişirse eski veri atılıp yeniden seed edilir.
 * · Seed deterministiktir → demo her açılışta aynı görünür.
 */
@Injectable({ providedIn: 'root' })
export class FakeDb {
  private readonly store = inject(ASYNC_STORE);
  private readonly collections = new Map<CollectionName, Collection<Identified>>();

  private initialized = false;
  private persistHandle: ReturnType<typeof setTimeout> | null = null;

  private readonly revision = signal(0);
  /** Değişiklik sayacı — geliştirici paneli ve gerçek zamanlı akış bunu izler. */
  readonly changes = this.revision.asReadonly();

  /**
   * Uygulama açılışında bir kez çağrılır.
   * Kalıcı veri okunamazsa uygulama yine de çalışır: seed bellekte üretilir.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    let data: DbSchema;
    try {
      const persisted = await this.store.get<PersistedDb>(STORAGE_KEYS.db);
      data = persisted?.schemaVersion === DB_SCHEMA_VERSION ? persisted.data : await seed();
    } catch {
      data = await seed();
    }

    this.load(data);
    this.initialized = true;
    this.schedulePersist();
  }

  collection<K extends CollectionName>(name: K): Collection<Entity<K>> {
    if (!this.initialized) {
      // Açılış sırası `app.config.ts`'te garanti altındadır; buraya düşmek bir programlama hatasıdır.
      throw new Error('FakeDb.init() beklenmeden koleksiyona erişildi.');
    }
    return this.collections.get(name) as unknown as Collection<Entity<K>>;
  }

  /** Geliştirici panelindeki "Demo veriyi sıfırla". */
  async reset(): Promise<void> {
    await this.store.remove(STORAGE_KEYS.db);
    this.load(await seed());
    this.initialized = true;
    this.onChange();
  }

  private load(data: DbSchema): void {
    this.collections.clear();
    for (const name of COLLECTION_NAMES) {
      this.collections.set(
        name,
        new Collection(name, (data[name] ?? []) as readonly Identified[], () => this.onChange()),
      );
    }
  }

  /**
   * Yazma işlemleri sık olduğu için (autosave) kalıcılaştırma toplu yapılır;
   * her değişiklikte tüm veriyi serileştirmek arayüzü yavaşlatırdı.
   */
  private onChange(): void {
    this.revision.update((value) => value + 1);
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.persistHandle !== null) return;

    this.persistHandle = setTimeout(() => {
      this.persistHandle = null;
      void this.persist();
    }, 400);
  }

  private async persist(): Promise<void> {
    const data = COLLECTION_NAMES.reduce(
      (result, name) => {
        result[name] = [...(this.collections.get(name)?.all() ?? [])];
        return result;
      },
      {} as Record<string, unknown>,
    );

    try {
      await this.store.set<PersistedDb>(STORAGE_KEYS.db, {
        schemaVersion: DB_SCHEMA_VERSION,
        data: data as unknown as DbSchema,
      });
    } catch {
      // Kalıcılık başarısız olsa da uygulama bellekteki veriyle çalışmaya devam eder.
    }
  }
}
