# ARCHITECTURE.md

> Katmanlar, veri akışı, klasör sözleşmesi ve mimari kararlar (ADR).
> Yeni bir mimari karar alındığında **§9 ADR** bölümüne kayıt düşülür.

---

## 1. Mimari Özet

**Feature-based + katmanlı (layered) mimari.**
UI hiçbir zaman veri kaynağını bilmez. Her katman yalnızca bir alt katmanla konuşur.

```
┌──────────────────────────────────────────────────────────────┐
│  PAGE (smart component)                                      │
│  · Route seviyesindeki ekran                                 │
│  · Sadece Facade'e bağlanır, HTTP/DB bilmez                  │
└───────────────┬──────────────────────────────────────────────┘
                │ signal okur / komut çağırır
┌───────────────▼──────────────────────────────────────────────┐
│  FACADE (data-access/*.facade.ts)                            │
│  · Orkestrasyon: store + repository + domain kuralı          │
│  · Optimistic update, rollback, toast, audit tetikleme       │
└──────┬──────────────────────────┬────────────────────────────┘
       │                          │
┌──────▼────────────┐   ┌─────────▼──────────────────────────┐
│ STORE (state/)    │   │ REPOSITORY (data-access/)          │
│ · signal + computed│   │ · HTTP çağrısı + DTO↔Entity mapping│
│ · saf state, I/O yok│  │ · endpoint bilgisi burada biter     │
└───────────────────┘   └─────────┬──────────────────────────┘
                                  │
┌─────────────────────────────────▼────────────────────────────┐
│  DOMAIN (domain/) — SAF fonksiyonlar                         │
│  · Ustalık skoru, blueprint çözücü, döngü tespiti, puanlama  │
│  · Angular bağımlılığı YOK → doğrudan unit test edilir       │
└──────────────────────────────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼────────────────────────────┐
│  CORE/API — ApiClient → Interceptor zinciri                  │
│  auth → correlation → retry → error-mapping → MOCK BACKEND   │
└─────────────────────────────────┬────────────────────────────┘
                                  │
┌─────────────────────────────────▼────────────────────────────┐
│  FAKE DB (core/api/mock/db) — in-memory + localStorage       │
└──────────────────────────────────────────────────────────────┘
```

### Bağımlılık yönü (asla ters çevrilmez)

```
pages → components → shared
  ↓
facade → store
  ↓        ↓
repository → domain → models
  ↓
core/api
```

* `core` → hiçbir `feature`'ı import edemez.
* `shared` → hiçbir `feature`'ı ve `core/api/mock`'u import edemez.
* `feature` → `core` ve `shared`'i import edebilir.
* `domain/` → **hiçbir şeyi** import etmez (sadece `models/`).

---

## 2. Klasör Sözleşmesi

```
src/
├── styles/                       # Design system (SCSS token + base + utilities)
│   ├── _tokens.scss              # renk, spacing, radius, shadow, z-index, typography
│   ├── _reset.scss
│   ├── _typography.scss
│   ├── _utilities.scss
│   ├── _animations.scss
│   └── _scrollbar.scss
├── styles.scss                   # yalnızca yukarıdakileri forward eder
└── app/
    ├── core/
    │   ├── api/
    │   │   ├── api-client.ts               # HttpClient sarmalayıcı (get/post/put/patch/delete)
    │   │   ├── api-endpoints.ts            # tüm endpoint string'leri TEK yerde
    │   │   ├── api-error.ts                # ApiError modeli + ApiErrorCode enum
    │   │   ├── page-request.ts             # sayfalama/sıralama/filtre DTO'ları
    │   │   ├── interceptors/
    │   │   │   ├── auth.interceptor.ts     # token + tenant header
    │   │   │   ├── correlation.interceptor.ts
    │   │   │   ├── error-mapping.interceptor.ts
    │   │   │   ├── retry.interceptor.ts    # idempotent istekte exponential backoff
    │   │   │   └── loading.interceptor.ts  # global request sayacı
    │   │   └── mock/
    │   │       ├── mock-backend.interceptor.ts   # /api/** → handler registry
    │   │       ├── mock-router.ts                # path pattern eşleştirici
    │   │       ├── mock-config.ts                # latency, hata oranı, offline anahtarı
    │   │       ├── db/
    │   │       │   ├── fake-db.ts                # koleksiyonlar + CRUD + query motoru
    │   │       │   ├── collection.ts             # generic Collection<T>
    │   │       │   └── query-engine.ts           # filter/sort/paginate/search
    │   │       ├── seed/                         # ilişkili demo veri üreticileri
    │   │       └── handlers/                     # feature başına endpoint handler'ları
    │   │           ├── crud/                     # createCrudHandlers + FieldValidator
    │   │           ├── catalog/                  # program, course, outcome, content
    │   │           ├── learning/                 # learning-context + yol/öneri/ilerleme
    │   │           ├── assessment/               # soru bankası: CRUD, versiyon, toplu işlem
    │   │           └── dashboard/                # rol başına dashboard builder'ları
    │   ├── auth/
    │   │   ├── auth.store.ts        # session signal
    │   │   ├── auth.facade.ts       # login/logout/refresh
    │   │   ├── auth.repository.ts
    │   │   ├── permission.model.ts  # Role, Permission, ROLE_PERMISSIONS matrisi
    │   │   ├── permission.service.ts# can(), canAny(), canAll()
    │   │   ├── data-scope.service.ts# veri kapsamı (kendi/cohort/program/global)
    │   │   └── guards/              # auth, role, permission, unsaved-changes
    │   ├── state/
    │   │   ├── ui.store.ts          # sidebar, tema, breakpoint
    │   │   ├── event-bus.ts         # uygulama içi RxJS event stream
    │   │   └── entity-store.ts      # generic signal tabanlı liste store'u
    │   ├── storage/
    │   │   ├── storage.token.ts     # StorageAdapter arayüzü (DIP)
    │   │   ├── local-storage.adapter.ts
    │   │   ├── memory-storage.adapter.ts   # test için
    │   │   └── outbox-queue.ts      # offline sıralı senkronizasyon kuyruğu
    │   └── observability/
    │       ├── audit.service.ts     # AuditEvent üretimi
    │       ├── telemetry.service.ts
    │       └── toast.store.ts       # bildirim kuyruğu
    ├── shared/
    │   ├── components/   # bkz. DESIGN_SYSTEM.md § Component Kataloğu
    │   ├── directives/
    │   ├── validators/
    │   ├── pipes/
    │   └── utils/
    ├── layout/
    │   ├── shell/         # sidebar + header + <router-outlet>
    │   ├── sidebar/
    │   ├── header/
    │   └── nav.config.ts  # menü tanımı (izin filtreli)
    ├── features/adaptive-learning/
    │   ├── models/
    │   ├── domain/         # learning-rules, learning-path.builder,
    │   │                   # recommendation.engine, engagement, publish-workflow…
    │   ├── data-access/     # *.repository.ts + *.facade.ts
    │   ├── state/
    │   ├── components/      # dashboard/, gamification/, learning-path/, question/,
    │   │                    # outcome-graph/, publish-actions/, recommendation-reason-card/
    │   ├── pages/           # programs/, courses/, outcomes/, contents/,
    │   │                    # learning-path/, learning-dashboard/, questions/
    │   └── adaptive-learning.routes.ts
    ├── app.config.ts
    ├── app.routes.ts
    └── app.ts
```

> **Not / şartname sapması:** Şartnamedeki ağaçta `domain/` yoktur; ancak "iş kuralları …
> facade/repository/**use-case** katmanlarında tutulmalıdır" maddesi bir use-case katmanı
> gerektirir. `domain/` bu use-case katmanıdır: Angular'dan tamamen bağımsız saf fonksiyonlar.

### Bağımlılık kuralının iki bilinçli istisnası

1. **`core/api/mock/**` → `features/**/models`** — mock backend bir SUNUCU taklididir;
   sunucunun domain modellerini bilmesi doğaldır. Yalnızca tip düzeyinde bağımlılıktır.
2. **`layout/header` → `features/adaptive-learning` (bildirim merkezi)** — uygulama kabuğu
   arayüzün kompozisyon köküdür ve domain bildirimlerini yüzeye çıkarır (ADR-020).

Bunlar dışında `core` ve `shared`, `features`'a bağımlı olamaz.

### `features/` altındaki modüller

| Klasör | İçerik |
|--------|--------|
| `adaptive-learning/` | Ana domain: kazanım, içerik, soru, sınav, analitik, dashboard |
| `auth/` | Oturum ekranları (login) |
| `system/` | 403, 404, geliştirici paneli, modül yer tutucuları |

---

## 3. State Yönetimi (Signals)

### 3.1 Katman kuralları

| Katman | Yazma hakkı | Okuma |
|--------|-------------|-------|
| Store | Yalnızca kendi `WritableSignal`'ları (private) | `readonly` / `computed` dışa açar |
| Facade | Store'un public komut metodları | Store'un readonly signal'ları |
| Page | **Yazamaz** | Facade'in signal'ları |

Store asla HTTP çağırmaz. Facade asla `signal.set()`'i kendi içinde tutmaz — store metodunu çağırır.

### 3.2 Generic `EntityStore<T>`

Liste ekranlarının %90'ı aynı state'e sahiptir. Tekrarı önlemek için:

```ts
// core/state/entity-store.ts
export class EntityStore<T extends { id: string }> {
  readonly items      = computed(() => this.#items());
  readonly total      = computed(() => this.#total());
  readonly status     = computed(() => this.#status());   // idle|loading|success|error|empty
  readonly error      = computed(() => this.#error());
  readonly query      = computed(() => this.#query());    // page, size, sort, search, filters
  readonly isEmpty    = computed(() => this.status() === 'success' && this.#items().length === 0);
  // setLoading / setSuccess / setError / patchQuery / upsert / remove / replaceAll
}
```

Feature store'ları bu sınıfı **composition** ile kullanır (kalıtım değil — LSP riski yok).

### 3.3 Türetilmiş değerler

Şartname: *"Türetilen değerler tek bir hesaplama/selector katmanından üretilmelidir."*
→ Tüm türetim `computed()` içinde, `state/*.selectors.ts` dosyalarında toplanır.
Ağır hesaplar (heatmap matrisi, cohort istatistiği) `memoize()` (utils) ile sarılır.

### 3.4 URL ↔ State senkronizasyonu

`shared/utils/query-param-sync.ts`, filtre/sayfa/sıralama state'ini query param'a yazar ve
sayfa açılışında geri okur. Böylece tablo/rapor filtreleri paylaşılabilir olur.

---

## 4. Mock API Mimarisi

### 4.1 Akış

```
Repository → ApiClient → HttpClient
   → auth.interceptor      (Authorization, X-Session-Token)
   → correlation.interceptor (X-Correlation-Id)
   → retry.interceptor     (GET/idempotent → 3 deneme, exponential backoff + jitter)
   → error-mapping.interceptor (HttpErrorResponse → ApiError)
   → mockBackend.interceptor  ⟵ ZİNCİRİN SONU, ağa çıkmaz
        → MockRouter.match(method, url)
        → handler(ctx) → FakeDb
        → latency + rastgele hata + 401/403/409/429 simülasyonu
```

### 4.2 `MockRouter` — Open/Closed

Her feature kendi handler'larını **kendi dosyasında** kaydeder; merkezî `switch` yoktur:

```ts
export const COURSE_HANDLERS: MockHandler[] = [
  { method: 'GET',  path: '/api/courses',      handle: listCourses },
  { method: 'POST', path: '/api/courses',      handle: createCourse },
  { method: 'GET',  path: '/api/courses/:id',  handle: getCourse },
];
```

Yeni modül eklemek = yeni handler dizisini registry'ye eklemek. Mevcut kod değişmez.

### 4.3 Simüle edilen senaryolar

| Senaryo | Nasıl tetiklenir | Sonuç |
|---------|------------------|-------|
| Gecikme | `MockConfig.latencyMs` (150–900ms varsayılan) | Loading state görünür |
| Rastgele hata | `MockConfig.errorRate` (dev panelinden ayarlanır) | 500 + retry |
| Yetkisiz | Rol izin matrisi handler içinde kontrol edilir | 403 `FORBIDDEN` |
| Oturum yok | Token geçersiz | 401 → login'e yönlendirme |
| Çakışma | `version` alanı uyuşmazsa | 409 `VERSION_CONFLICT` |
| Rate limit | Aynı endpoint'e ardışık istek | 429 `RATE_LIMITED` |
| Offline | `MockConfig.offline = true` | Network error → outbox kuyruğu |

### 4.4 Fake DB

* `Collection<T>`: `find`, `findOne`, `insert`, `update`, `remove`, `query(QueryEngine)`.
* **Kalıcılık: IndexedDB** (`AsyncKeyValueStore` arayüzü arkasında — ADR-013).
  Yükleme asenkron olduğu için uygulama açılışında `FakeDb.init()` beklenir.
  Şema versiyonu (`DB_SCHEMA_VERSION`) değişirse eski veri atılıp yeniden seed edilir.
* Seed verisi **ilişkisel ve yoğun**: 10 program, 20 ders, 112 kazanım, 224 içerik,
  300 soru (+351 versiyon), 20 blueprint, 60 sınav, 1.020 deneme, 2.493 ustalık skoru,
  612 öneri, 190 madde analizi, 176 denetim kaydı, 530 bildirim → rapor üretmeye fazlasıyla yeterli.
* Deterministik: `platform/seeded-random.ts` içinde sabit tohumlu PRNG (mulberry32)
  → her açılışta aynı demo veri, tekrar edilebilir ekran görüntüleri ve testler.
* Türetilen veriler (ör. `LearningPath`) **saklanmaz**, istek anında hesaplanır (ADR-017).

### 4.5 Gerçek zamanlı akış

`core/api/mock/realtime/` — `RealtimeGateway` (RxJS `Subject` tabanlı SSE/WebSocket simülasyonu):
sınav oturumu tik'leri, autosave onayları, cohort canlı istatistiği, audit akışı.

---

## 5. Auth & Authorization

### 5.1 Üç seviyeli koruma

| Seviye | Uygulama |
|--------|----------|
| **Route** | `authGuard`, `roleGuard([...])`, `permissionGuard(perm)` — `canMatch` ile lazy bundle bile yüklenmez |
| **İşlem** | `PermissionService.can()` + `*appHasPermission` direktifi + facade içinde son kontrol |
| **Veri kapsamı** | `DataScopeService` → `own` \| `cohort` \| `program` \| `global`; repository query'sine `scope` parametresi ekler, mock handler bunu zorunlu kılar |

`canMatch` kullanılması şartnamedeki *"yetkisiz feature bundle erişimi engellenmelidir"*
maddesini karşılar (`canActivate` bundle'ı yükledikten sonra çalışır, `canMatch` yüklemeden önce).

### 5.2 İzin modeli

`resource:action` biçimi — örn. `question:publish`, `attempt:grade`, `cohort:read`.
`ROLE_PERMISSIONS: Record<Role, Permission[]>` tek kaynak; matris `PROJECT_RULES.md`'de.

---

## 6. Hata Yönetimi

```
HttpErrorResponse
   → error-mapping.interceptor
   → ApiError { code, message, httpStatus, details?, correlationId, retryable }
   → Facade: store.setError(apiError)
   → UI: <app-error-state [error]="..." (retry)="..."/> veya toast
```

`ApiErrorCode`: `NETWORK`, `TIMEOUT`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`,
`VALIDATION`, `VERSION_CONFLICT`, `RATE_LIMITED`, `BUSINESS_RULE`, `UNKNOWN`.

**Kural:** Component `HttpErrorResponse` tipini asla görmez; yalnızca `ApiError` görür.

### Optimistic update + rollback

```ts
const snapshot = store.snapshot();
store.applyOptimistic(patch);
repo.update(patch).subscribe({
  error: (e) => { store.restore(snapshot); toast.error('İşlem geri alındı', e.message); },
  next:  (saved) => store.commit(saved),
});
```

---

## 7. Routing

* Tüm feature route'ları **lazy** (`loadChildren` / `loadComponent`).
* Shell (layout) bir parent route'tur; içindeki `children` lazy yüklenir.
* Her route `data: { title, permission, breadcrumb }` taşır → header/breadcrumb otomatik.
* `withComponentInputBinding()` → route param'ları doğrudan `input()` signal'ına bağlanır.
* `withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })`.
* `/exam-session/:token` **shell dışında**, tam ekran layout kullanır (odaklanmış sınav modu).

---

## 8. Performans

| Teknik | Nerede |
|--------|--------|
| Route-level lazy loading | Tüm feature'lar |
| `@defer` blokları | Ağır grafikler, kazanım grafiği, heatmap |
| `track` (yeni control flow) | Tüm `@for` döngüleri |
| Memoized selector | `state/*.selectors.ts` |
| Virtual scroll | Soru bankası, audit log, cevap listesi |
| `OnPush` | Tüm componentler (zoneless zaten signal-driven) |
| `debounceTime` + `distinctUntilChanged` | Arama inputları (300ms) |
| İstek iptali | `switchMap` ile eski liste isteği iptal edilir |

---

## 9. Mimari Karar Kayıtları (ADR)

| # | Karar | Gerekçe | Tarih |
|---|-------|---------|-------|
| 001 | Angular 21 + standalone + **zoneless** | Şartname 17+ istiyor; zoneless signal mimarisiyle tam uyumlu, `zone.js` yükü yok | 2026-07-27 |
| 002 | State için **NgRx değil, saf Signals** | Şartname "Angular Signals ile kurulmalı" diyor; boilerplate azalır, `computed` selector doğal gelir | 2026-07-27 |
| 003 | `EntityStore<T>` generic sınıfı, **composition** ile kullanılır | Liste ekranlarındaki tekrarı sıfırlar; kalıtım yerine composition → LSP korunur | 2026-07-27 |
| 004 | Mock backend **HttpInterceptor** olarak | Repository katmanı gerçek HTTP yazar; ileride gerçek backend'e geçiş tek satırlık interceptor kaldırma işidir | 2026-07-27 |
| 005 | Mock handler'lar **registry** ile kaydedilir | Open/Closed — yeni modül mevcut dosyayı değiştirmez | 2026-07-27 |
| 006 | İş kuralları `domain/` altında **saf fonksiyon** | Angular'sız test edilebilirlik; facade'ler ince kalır (SRP) | 2026-07-27 |
| 007 | Route korumasında `canActivate` yerine **`canMatch`** | Yetkisiz kullanıcının feature bundle'ını indirmesi engellenir | 2026-07-27 |
| 008 | Sınav süresi **serverTimeOffset** ile hesaplanır | İstemci saati değişse/sekme pasifleşse bile sayaç doğru kalır | 2026-07-27 |
| 009 | Autosave **versiyon numarası** taşır, 409'da conflict UI'ı açılır | Şartname: eski versiyon yeni cevabı sessizce ezmemeli | 2026-07-27 |
| 010 | Storage `StorageAdapter` arayüzü arkasında (DIP) | Test'te `MemoryStorageAdapter`, prod'da `LocalStorageAdapter` | 2026-07-27 |
| 011 | Grafikler `AppChartCard` sarmalayıcısı ile | ApexCharts API'si tek yerde; tema/renk tutarlılığı garanti | 2026-07-27 |
| 012 | Tek feature kökü `features/adaptive-learning` | Şartnamedeki klasör ağacına birebir uyum; alt modüller `pages/` altında | 2026-07-27 |
| 013 | Fake DB kalıcılığı **IndexedDB**'de (`AsyncKeyValueStore` arkasında) | Demo veri ~5 MB; localStorage kotası (≈5 MB) yetmiyor ve aşıldığında sessizce belleğe düşüyordu. Yükleme asenkron olduğu için `provideAppInitializer` içinde beklenir | 2026-07-28 |
| 014 | Dashboard payload'ı **rol bazlı discriminated union** | Her rol yalnızca anlamlı veriyi alır; şablonda tip güvenli daraltma yapılır; yeni rol mevcut rollerin kodunu değiştirmez | 2026-07-28 |
| 015 | Rol → dashboard builder **registry** (`DASHBOARD_BUILDERS`) | Handler'da `switch` zinciri büyümez; yeni rol = yeni dosya + bir satır (Open/Closed) | 2026-07-28 |
| 016 | Grafik dönüşümleri tek katmanda: `shared/utils/chart-adapters.ts` | Ekranlar ApexCharts veri biçimini bilmez; kütüphane değişirse tek dosya güncellenir | 2026-07-28 |
| 017 | `LearningPath` **türetilir, saklanmaz** | Şartname: "türetilen değerler tek bir hesaplama katmanından üretilmelidir". Kalıcılaştırmak bayat veri riski doğururdu | 2026-07-28 |
| 018 | Breakpoint'ler `_breakpoints.scss`'te, `_tokens.scss`'ten ayrı | Bileşen stilleri token dosyasını `@use` ettiğinde `:root` bloğunun tamamı her bileşenin CSS'ine kopyalanıyordu (stil bütçesi aşımı) | 2026-07-27 |
| 019 | `AppChartCard` içinde `@defer (on viewport)` yerine `on immediate` | `on viewport` tetikleyicisi güvenilir çalışmadı ve kartlar boş kaldı; dashboard'da grafik birincil içeriktir. ApexCharts yine kendi lazy chunk'ında kalır | 2026-07-28 |
| 020 | `layout/` → `features/` bağımlılığına izin (yalnızca bildirim merkezi) | Uygulama kabuğu arayüzün kompozisyon köküdür; header domain bildirimlerini yüzeye çıkarır. İstisna bilinçlidir ve bu satırla sınırlıdır | 2026-07-28 |
| 021 | Durum taşıyan varlıklar için **tek CRUD fabrikası** (`createCrudHandlers`) | Program/ders/kazanım uç noktaları aynı şekle sahip; üç kez yazmak yerine varlığa özgü kısımlar config ile verilir. Fabrika içinde varlık adına göre dallanma YOK (Open/Closed) | 2026-07-28 |
| 022 | İstemcide `CrudRepository` + `CrudEngine` + `CatalogFacade` üçlüsü | Sunucudaki simetrinin istemci karşılığı; facade'ler yalnızca kendi farklarını yazar. `CrudEngine` composition ile kullanılır, `CatalogFacade` yalnızca ince bir yüzey (iş kuralı içermez, LSP korunur) | 2026-07-28 |
| 023 | Yayın iş akışı ve döngü kuralları `domain/` içinde **saf fonksiyon** | Aynı fonksiyonlar hem mock backend hem form doğrulaması tarafından kullanılır; iki taraf farklı sonuç veremez. Angular'sız oldukları için doğrudan test edilir | 2026-07-28 |
| 024 | Doğrulama sınırları `*_LIMITS` sabitlerinde tek kaynakta | Reactive Forms validator'ları, karakter sayaçları ve sunucu doğrulaması aynı sayıları okur; biri değişince diğeri ayrışamaz | 2026-07-28 |
| 025 | Yazma isteklerinde **iyimser kilitleme** (`expectedVersion`) | Aynı kaydı iki sekmede düzenleme senaryosunda sessiz üzerine yazma yerine 409 döner (BR-09 ile aynı ilke) | 2026-07-28 |
| 026 | Mock backend ve seed **dinamik import** ile yüklenir | Geliştirme amaçlı yedek katman başlangıç paketini şişirmemeli. Handler kaydı ilk API isteğinde, seed ilk açılışta yüklenir → başlangıç paketi 712 kB'den 582 kB'ye indi | 2026-07-28 |
| 027 | `AppFormField` kontrol değişimlerine abone olur | Reactive Forms `AbstractControl` bir signal değildir; nesne kimliği sabit kaldığı için `computed` asla yeniden hesaplanmıyordu. Revizyon sayacı ile karakter sayacı ve hata mesajları artık canlı güncelleniyor | 2026-07-28 |
| 028 | İçerik **tek bir kazanıma** bağlanır (`outcomeId`), çoklu ilişki kaldırıldı | Öğrenme yolu "kazanım → sıralı içerikler" bloklarından kurulur. Çoklu bağ, bir içeriğin hangi kazanımın hangi sırasında olduğunu belirsizleştiriyor ve yol üretimini deterministik olmaktan çıkarıyordu | 2026-07-28 |
| 029 | Öğrenme yolu, öneriler ve öğrenci paneli **tek derleme noktasından** beslenir (`handlers/learning/learning-context.ts`) | Üçü de aynı girdilere ihtiyaç duyar (içerik, ilerleme, ustalık, önkoşul). Ayrı ayrı toplansaydı üç ekran aynı öğrenci için farklı sonuç gösterebilirdi | 2026-07-28 |
| 030 | Kilit kararı **`domain/learning-rules.ts`** içinde tek fonksiyon (`evaluateUnlock`) | "Bir kazanım ne zaman açılır?" sorusu öneri motoru, yol üreteci ve içerik detayında ayrı ayrı yanıtlanamaz. Eşikler de aynı dosyadaki `LEARNING_THRESHOLDS` sabitinden okunur | 2026-07-28 |
| 031 | `ContentProgress` yalnızca **dokunulmuş** içerikler için kaydedilir; `locked` / `recommended` durumları saklanmaz | `not_started` varsayılan durumdur (`defaultProgress`), 100 öğrenci × 91 içerik için boş kayıt üretmek veriyi gereksiz büyütürdü. Kilit ve öneri durumları okuma anında türetilir (ADR-017 ile aynı ilke) | 2026-07-28 |
| 032 | İçerik kapsam kuralı ortak yüklem: `isContentVisible()` | Liste, detay, toplu işlem ve öğrenme uç noktaları aynı kuralı paylaşır. Öğrenci için ek olarak "yalnızca yayındaki içerik" koşulu buraya gömülüdür; ekranların filtre uygulamasına bırakılmaz (BR-31) | 2026-07-28 |
| 033 | Oyunlaştırma tamamen **arayüz seviyesinde**, hesaplama saf domain'de (`domain/engagement.ts`) | Seri, XP ve başarımlar gerçek ilerleme kayıtlarından türetilir; sunucuda ayrı bir "puan" tablosu tutulmaz. Kurallar (`XP_RULES`) tek yerde ve doğrudan test edilir | 2026-07-28 |
| 034 | Soru türleri **kayıt tablosuyla** tanımlanır (`QUESTION_TYPE_META`) | Editör, doğrulama, önizleme ve rozetler `answerShape` alanından beslenir; hiçbiri tür adına göre `switch` yazmaz. Yeni tür eklemek = tabloya bir satır (Open/Closed) | 2026-07-29 |
| 035 | Soru yayın akışı `publish-workflow.ts`'i **yeniden kullanır** | `QuestionState` katalog varlıklarıyla birebir aynı dört durumu taşıyor. İkinci bir durum makinesi yazmak yerine `QuestionState = PublishState` yapıldı; `PublishActions` bileşeni soru ekranlarında da çalışıyor | 2026-07-29 |
| 036 | Soru **yumuşak silinir** (`deletedAt`), sert silme yok | Soru sınav geçmişine bağlıdır; kaydı yok etmek geçmiş sınavların referansını koparırdı. Kayıt korunur, listelerden düşer, geri alınabilir (BR-36) | 2026-07-29 |
| 037 | Versiyon farkı **istemcide**, saf `compareVersions()` ile hesaplanır | Sunucu iki ham snapshot döner. Fark mantığı Angular'sız bir fonksiyonda durduğu için doğrudan test edilir ve gösterim değişince sunucu sözleşmesi değişmez | 2026-07-29 |
| 038 | Zengin metin editörü **dış kütüphanesiz** (`contenteditable` + izin listesi) | Hazır bir editör paketi başlangıç paketini kat kat büyütürdü. Kaydedilen HTML `sanitizeRichText()` ile temizlenir ve AYNI fonksiyon mock sunucuda da çalışır — istemci atlansa bile script veritabanına giremez (BR-37) | 2026-07-29 |
| 039 | Başlangıç paketi uyarı bütçesi 700 kB → **800 kB** | Lucide ikonları bileşen olarak import ediliyor ve her biri ~3 kB'lık AYNI SVG şablonunu inline taşıyor: 104 ikon ≈ 344 kB ham, ancak tekrar ettiği için gzip'te yalnızca 13.7 kB. Ham boyut bu durumda gerçek maliyeti yansıtmıyor; izlenen ölçüt transfer boyutudur (**119 kB**). Hata tavanı 1 MB'ta bırakıldı | 2026-07-29 |
| 040 | Satır tıklaması etkileşimli hücre öğelerinde bastırılır | `AppTable` içinde tek yerde çözüldü: aksiyon menüsüne veya seçim kutusuna tıklamak artık detay sayfasına savurmuyor. Her liste ekranının ayrı `stopPropagation` yazması gerekmez | 2026-07-29 |
| 041 | Sınavda **yazım durumu** ile **çalışma durumu** ayrıldı | `Exam.state` yalnızca yayın akışını taşır (Taslak/İncelemede/Yayında/Arşiv). "Planlandı / devam ediyor / kapandı" saklanmaz; `examRuntimeStatus(exam, now)` ile tarihlerden türetilir. İkisini tek alanda birleştirmek, saatin ilerlemesiyle kaydın kendiliğinden değişmesi anlamına gelirdi (ADR-017 ile aynı ilke) | 2026-07-31 |
| 042 | Sınav yayın akışı da `publish-workflow.ts`'i yeniden kullanır (`ExamState = PublishState`) | Katalog ve soru ile aynı dört durum; üçüncü bir durum makinesi yazılmadı. `PublishActions` bileşeni sınav ekranlarında da doğrudan çalışıyor (ADR-035 ile aynı gerekçe) | 2026-07-31 |
| 043 | Doğrulama motoru **tek saf fonksiyon**: `domain/exam-validation.ts` | Sihirbazdaki canlı kısıt paneli, detay ekranındaki özet ve sunucunun yayın öncesi denetimi (`assertPublishable`) AYNI `validateExam()` çağrısını kullanır. Panel "hazır" derken sunucunun reddetmesi mümkün değil | 2026-07-31 |
| 044 | Otomatik seçimde bir soru **yalnızca bir blueprint hücresine** sayılır | Soru birden çok kazanıma bağlı olabilir. İki hücreye birden saymak, "aynı soru iki kez eklenemez" kuralıyla birleşince sınavı blueprint toplamının altında bırakıyor ve doğrulayıcı haklı olarak hata veriyordu. Seçici hücre atamasını bir `Set` ile kilitler (`question-selector.ts`) | 2026-07-31 |
| 045 | Blueprint, sınav içinde değil **ayrı varlık**; ders geneli ve gruba özel planlar aynı listede | `cohortId === null` → ders geneli. İki ayrı ekran açmak aynı kavramı ikiye bölerdi; ayrım "Kapsam" sütunu ve grup filtresiyle yapılır | 2026-07-31 |
| 046 | Tohum verisi sınav sorularını **uygulamanın kendi seçicisiyle** üretir | Rastgele seçim, YAYINDA tohum sınavlarının kendi planlarını ihlal etmesine ve kısıt panelinin her sınavda hata göstermesine yol açıyordu. Blueprint hücreleri de bankadaki gerçek envanterle sınırlanır — plan karşılanamaz olamaz | 2026-07-31 |
| 047 | İş akışı geçişleri arayüzde `exam:publish` ile kapılanır | Sunucu, hedef durum ne olursa olsun geçiş için `permissions.publish` arar. Yazma yetkisine bakan bir arayüz, Ölçme Uzmanına 403 ile biten butonlar gösteriyordu. İki taraf artık aynı yetkiyi okur | 2026-07-31 |
