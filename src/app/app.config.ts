import {
  ApplicationConfig,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  inject,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeTr from '@angular/common/locales/tr';
import {
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withRouterConfig,
} from '@angular/router';
import { provideLucideIcons } from '@lucide/angular';
import { firstValueFrom } from 'rxjs';

import { authInterceptor } from './core/api/interceptors/auth.interceptor';
import { correlationInterceptor } from './core/api/interceptors/correlation.interceptor';
import { errorMappingInterceptor } from './core/api/interceptors/error-mapping.interceptor';
import { loadingInterceptor } from './core/api/interceptors/loading.interceptor';
import { retryInterceptor } from './core/api/interceptors/retry.interceptor';
import { mockBackendInterceptor } from './core/api/mock/mock-backend.interceptor';
import { FakeDb } from './core/api/mock/db/fake-db';
import { AuthFacade } from './core/auth/auth.facade';
import { ASYNC_STORE } from './core/storage/async-store.token';
import { IndexedDbStore } from './core/storage/indexed-db.store';
import { LocalStorageAdapter } from './core/storage/local-storage.adapter';
import { STORAGE_ADAPTER } from './core/storage/storage.token';
import { APP_ICONS } from './shared/icons/app-icons';
import { routes } from './app.routes';

/**
 * Uygulama sağlayıcıları.
 *
 * INTERCEPTOR SIRASI ÖNEMLİDİR (ARCHITECTURE.md §4.1):
 *   auth → correlation → loading → retry → errorMapping → mockBackend
 *
 * İstek yukarıdan aşağı, yanıt aşağıdan yukarı akar. Bu sıralamayla:
 *   · `errorMapping` ham HTTP hatasını `ApiError`'a çevirir,
 *   · `retry` bu `ApiError`'ın `retryable` bayrağına bakarak karar verir,
 *   · `mockBackend` zincirin sonunda isteği yanıtlar (ağa çıkılmaz).
 *
 * Gerçek bir backend'e geçiş: `mockBackendInterceptor` listeden çıkarılır.
 */
// Tarih/sayı biçimlendirmesi Türkçe yapılır; `DatePipe` yerel veri olmadan hata verir.
registerLocaleData(localeTr, 'tr');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'tr' },

    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' }),
      withRouterConfig({ paramsInheritanceStrategy: 'always' }),
    ),

    provideHttpClient(
      withInterceptors([
        authInterceptor,
        correlationInterceptor,
        loadingInterceptor,
        retryInterceptor,
        errorMappingInterceptor,
        mockBackendInterceptor,
      ]),
    ),

    provideLucideIcons(...APP_ICONS),

    // Depolama somut sınıfa değil, arayüze bağlanır (DIP). Testte bellek gerçeklemesi verilir.
    { provide: STORAGE_ADAPTER, useClass: LocalStorageAdapter },
    // Sahte veritabanı birkaç MB tuttuğu için localStorage değil IndexedDB kullanılır.
    { provide: ASYNC_STORE, useClass: IndexedDbStore },

    /*
     * Açılış sırası önemlidir:
     *  1. Sahte veritabanı yüklenir (asenkron) — aksi hâlde ilk istek boş veri görür.
     *  2. Depodaki oturum doğrulanır; guard'lar doğru state ile çalışır.
     */
    provideAppInitializer(() => {
      // `inject()` yalnızca senkron bağlamda çağrılabilir; bağımlılıklar await'ten ÖNCE alınır.
      const db = inject(FakeDb);
      const auth = inject(AuthFacade);
      return db.init().then(() => firstValueFrom(auth.restoreSession()));
    }),
  ],
};
