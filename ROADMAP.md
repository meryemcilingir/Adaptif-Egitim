# ROADMAP.md

> Fazlar, görevler ve ilerleme durumu.
> Durum kodları: `[ ]` yapılacak · `[~]` devam ediyor · `[x]` tamamlandı · `[!]` bloke

**Son güncelleme:** 2026-07-28

> **Sprint eşlemesi:** Sprint 1 → Faz 0–1 · Sprint 2 → Faz A (veri modeli + dashboard) ·
> Sprint 3 → Faz B (katalog yönetimi: program, ders, kazanım, grafik, yayın akışı) ·
> **Sprint 7 → Faz 5–6 (sınav oturumu, autosave/offline, değerlendirme ve rubrik)**

---

## İlerleme Özeti

| Faz | Kapsam | Durum |
|-----|--------|-------|
| 0 | Dokümantasyon & proje kurulumu | `[x]` |
| 1 | Temel altyapı (mimari, layout, DS, auth, mock API, state) | `[x]` |
| A | **Veri modeli, ölçekli demo veri ve 6 rol dashboard'u (Sprint 2)** | `[x]` |
| B | **Katalog yönetimi: program/ders/kazanım CRUD, grafik, yayın akışı (Sprint 3)** | `[x]` |
| C | **İçerik yönetimi, öğrenme yolu, öneri motoru, öğrenci paneli (Sprint 4)** | `[x]` |
| 3 | **Soru bankası & versiyonlama (Sprint 5)** | `[x]` |
| 4 | **Blueprint, sınav sihirbazı, doğrulama motoru (Sprint 6)** | `[x]` |
| 5–6 | **Sınav oturumu, öğrenci deneyimi ve değerlendirme (Sprint 7)** | `[x]` |
| 4 | Blueprint & sınav oluşturucu | `[ ]` |
| 5 | Sınav oturumu & autosave | `[ ]` |
| 6 | Değerlendirme & rubrik | `[ ]` |
| 7 | Ustalık hesaplayıcı ve öneri motorunun sınav verisiyle beslenmesi | `[ ]` |
| 8 | Derin analitik ekranları (cohort, madde, öğrenci) | `[ ]` |
| 9 | Audit, ileri senaryolar, gerçek zamanlı akış | `[ ]` |
| 10 | Kullanıcı yönetimi, test, performans, a11y, teslim | `[ ]` |

---

## Faz A — Veri Modeli & Dashboard Ekosistemi (Sprint 2) `[x]`

### A.1 Modeller
- [x] `User`, `UserSummary`, `StudentPerformance`, `UserState`
- [x] `Notification` + `NotificationFeed` + görünüm eşlemesi
- [x] `LearningPath` / `LearningPathStep` (ayrı dosyaya taşındı)
- [x] `analytics.model.ts`: `CategoryValue`, `TimeSeriesPoint`, `NamedSeries`, `MatrixData`,
      `RankedEntry`, `DistributionBucket`, `MetricDelta`
- [x] `dashboard.model.ts`: rol bazlı **discriminated union** (6 payload tipi)
- [x] Mevcut modeller korundu: Course, LearningOutcome, ContentItem, Question,
      QuestionVersion, Exam, ExamBlueprint, ExamSession, Attempt, Rubric,
      MasteryScore, Recommendation, ItemAnalysis, AuditEvent

### A.2 Kalıcılık
- [x] `AsyncKeyValueStore` arayüzü (DIP) + `IndexedDbStore` + `MemoryAsyncStore`
- [x] `FakeDb.init()` asenkron yükleme; `provideAppInitializer` ile açılışta beklenir
- [x] Şema sürümü 2 → eski tarayıcı verisi otomatik yeniden üretilir
- [x] Gerekçe: veri seti ~5 MB; localStorage kotası yetmiyor (ADR-013)

### A.3 Demo veri (gerçek üretim sayıları)
- [x] 10 program · 12 cohort · 2 dönem
- [x] **102 öğrenci** · **20 eğitmen** · 4 ölçme uzmanı · 3 gözlemci · 1 program yöneticisi · 1 admin
- [x] **20 ders** · 112 kazanım · 224 içerik · 4.918 içerik ilerleme kaydı
- [x] **300 soru** · 351 soru versiyonu · 20 rubrik · 20 blueprint
- [x] **60 sınav** (36 kapalı, 20 planlı, 4 taslak/hazırlık)
- [x] **1.020 sınav denemesi** (ikinci hak senaryosu dâhil)
- [x] 2.493 ustalık skoru · 612 öneri · 190 madde analizi
- [x] 176 denetim kaydı · 530 bildirim
- [x] Küçük cohort (3 kişi) bilinçli bırakıldı → gizlilik eşiği (BR-17) demo edilebilir

### A.4 Rol bazlı dashboard'lar
- [x] Rol → builder kaydı (`DASHBOARD_BUILDERS`) — yeni rol mevcut kodu değiştirmez
- [x] Student: ustalık trendi, kazanım dağılımı, ısı haritası, öneriler, son içerikler, zayıf kazanımlar
- [x] Instructor: değerlendirme kuyruğu, ders bazlı trend, soru durumu, risk altındaki öğrenciler, ders ilerlemesi
- [x] Measurement: zorluk/ayırt edicilik histogramları, madde bulutu (scatter), blueprint kapsaması, yavaş maddeler
- [x] Program Manager: cohort karşılaştırma, yayın hattı, cohort × kazanım matrisi, ders sağlığı
- [x] Observer: salt okunur özet + gizlenen grupların açıkça bildirilmesi
- [x] Admin: rol dağılımı, denetim trendi/türleri, sistem sağlığı, veri hacmi

### A.5 Yeniden kullanılabilir dashboard bileşenleri
- [x] `KpiGrid`, `QuickActions`, `NotificationList`, `UpcomingExams`, `ProgressGroup`,
      `RankedList`, `StatisticsList`, `RecentContent`, `GradingQueue`, `DashboardCommon`
- [x] `chart-adapters.ts` — domain şekilleri → ApexCharts serileri (tek dönüşüm katmanı)
- [x] `AppChartCard`'a `scatter` tipi ve marker desteği eklendi

### A.6 Bildirim altyapısı
- [x] `NotificationRepository` + `NotificationFacade` (iyimser okundu işaretleme + rollback)
- [x] Header'da bildirim merkezi (rozet, panel, tümünü okundu işaretle)
- [x] `/api/notifications`, `/api/notifications/:id/read`, `/api/notifications/read-all`

### A.7 Dinamik sidebar
- [x] Menü izin matrisinden filtrelenir; boş gruplar render edilmez
- [x] `:me` yer tutucusu ile kişisel bağlantılar (`/student/:me/analytics`)
- [x] `PLATFORM_ADMIN` artık `session:start` iznine sahip değil (öğrenciye özgü eylem)

### A.8 Kalite
- [x] 68 unit test yeşil (mastery, recommendation, entity-store, query-engine,
      dashboard-context, chart-adapters, analytics)
- [x] Production build temiz; konsolda hata yok
- [x] Loading (skeleton) / empty / error + retry / unauthorized durumları tüm dashboard'larda

---

## Faz 0 — Dokümantasyon & Kurulum `[x]`

- [x] `AI_CONTEXT.md`, `ARCHITECTURE.md`, `PROJECT_RULES.md`, `DESIGN_SYSTEM.md`, `ROADMAP.md`
- [x] Angular 21 (standalone, zoneless, SCSS) projesi
- [x] Bağımlılıklar: `apexcharts`, `ng-apexcharts`, `lucide-angular`
- [x] Klasör iskeleti (`core`, `shared`, `layout`, `features/adaptive-learning`)

---

## Faz 1 — Temel Altyapı `[x]`

### 1.1 Design System
- [x] `src/styles/_tokens.scss` — renk, tipografi, spacing, radius, shadow, z-index, motion
- [x] `_reset.scss`, `_typography.scss`, `_utilities.scss`, `_animations.scss`, `_scrollbar.scss`
- [x] Inter fontu + `index.html` meta/tema ayarı

### 1.2 Core / API
- [x] `ApiClient` (get/post/put/patch/delete + `PageRequest`/`PageResponse`)
- [x] `ApiError` + `ApiErrorCode` + `error-mapping.interceptor`
- [x] `auth.interceptor`, `correlation.interceptor`, `retry.interceptor`, `loading.interceptor`
- [x] `api-endpoints.ts` — tüm endpoint'ler tek yerde

### 1.3 Mock API & Fake DB
- [x] `Collection<T>` + `QueryEngine` (filter/search/sort/paginate)
- [x] `FakeDb` — localStorage kalıcılık + şema versiyonu + reset
- [x] `MockRouter` (path pattern eşleştirme) + `MockHandler` sözleşmesi
- [x] `mock-backend.interceptor` — latency, hata oranı, 401/403/409/429, offline
- [x] Deterministik seed üreteci (sabit tohumlu PRNG)
- [x] İlişkili demo veri: kullanıcı, ders, kazanım, içerik, soru+versiyon, blueprint,
      sınav, oturum, attempt, cevap, rubrik, ustalık, öneri, madde analizi, audit
- [x] Auth + course + outcome + question + exam + analytics handler'ları

### 1.4 Auth & RBAC
- [x] `Role`, `Permission`, `ROLE_PERMISSIONS` matrisi
- [x] `AuthStore` (signal session) + `AuthFacade` + `AuthRepository`
- [x] `PermissionService` (`can`, `canAny`, `canAll`)
- [x] `DataScopeService` (`own`/`course`/`program`/`cohort`/`global`)
- [x] `authGuard`, `roleGuard`, `permissionGuard` (**`canMatch`**), `unsavedChangesGuard`
- [x] `*appHasPermission` direktifi
- [x] Login sayfası (demo hesap seçici ile)

### 1.5 State Altyapısı
- [x] `EntityStore<T>` — items/total/status/error/query + optimistic + rollback
- [x] `UiStore` (sidebar, breakpoint, global loading)
- [x] `EventBus` (RxJS tabanlı uygulama içi olay akışı)
- [x] `ToastStore` (bildirim kuyruğu)
- [x] `StorageAdapter` (DIP) + local/memory gerçeklemeleri + `OutboxQueue`
- [x] `AuditService`, `TelemetryService`

### 1.6 Layout & Routing
- [x] `ShellComponent` (Sidebar + Header + Content)
- [x] `SidebarComponent` — gruplu, izin filtreli, collapse/drawer
- [x] `HeaderComponent` — breadcrumb, arama, rol rozeti, bildirim, kullanıcı menüsü
- [x] `nav.config.ts` — menü tanımı
- [x] `app.routes.ts` — lazy feature route'ları + shell dışı sınav oturumu rotası
- [x] 403 / 404 sayfaları

### 1.7 Shared Component Library
- [x] `AppCard`, `AppButton`, `AppIcon`, `AppStatusBadge`, `AppAvatar`, `AppProgressBar`, `AppTabs`, `AppBreadcrumb`
- [x] `AppStatCard`, `AppMetricCard`, `AppChartCard`, `AppSparkline`
- [x] `AppTable` (sticky, sort, pagination, responsive, durumlar), `AppPagination`, `AppFilterBar`
- [x] `AppTimeline`, `AppKeyValue`
- [x] `AppLoadingState`, `AppEmptyState`, `AppErrorState`, `AppUnauthorizedState`, `AppSkeleton`
- [x] `AppDialog`, `AppConfirmDialog` (+ zorunlu gerekçe), `AppDrawer`, `AppToast`, `AppDropdown`
- [x] `AppFormField`, `AppInput`, `AppTextarea`, `AppSelect`, `AppMultiSelect`, `AppCheckbox`, `AppSwitch`, `AppSearchSelect`, `AppTagInput`
- [x] Direktifler: `appHasPermission`, `appTooltip`, `appAutofocus`
- [x] Pipe'lar: `appRelativeTime`, `appScore`, `appDuration`
- [x] `status-tone.ts`, `query-param-sync.ts`, `memoize.ts`, `mapper` yardımcıları

---

## Faz B — Katalog Yönetimi (Sprint 3) `[x]`

### B.1 Program yönetimi
- [x] `Program` tam varlık modeli (kod, ad, açıklama, koordinatör, durum, sayaçlar)
- [x] CRUD + arşivle/geri al · liste · detay
- [x] Arama · durum ve koordinatör filtresi · kolon sıralaması · sayfalama
- [x] Bütünlük kuralı: ders içeren program silinemez, ders içermeyen program yayınlanamaz
- [x] Sayaçlar (ders/kazanım/öğrenci) sunucuda türetilir, istemci hesaplamaz

### B.2 Ders yönetimi
- [x] `category`, `level`, `estimatedDurationHours` alanları eklendi
- [x] CRUD · liste · detay · eğitmen ataması
- [x] Arama · 5 filtre (durum, program, kategori, seviye, eğitmen) · sıralama · sayfalama
- [x] Bütünlük kuralı: kazanım içeren ders silinemez, yayınlanmış kazanımı olmayan ders yayınlanamaz

### B.3 Kazanım yönetimi
- [x] `tags`, `difficulty`, `estimatedDurationMinutes` alanları eklendi
- [x] CRUD · liste · detay
- [x] Arama (kod, ad, açıklama, etiket) · 5 filtre · sıralama · sayfalama
- [x] Bütünlük kuralı: bağımlısı veya sorusu olan kazanım silinemez;
      önkoşulu yayınlanmamış kazanım yayınlanamaz

### B.4 Önkoşul yönetimi ve döngü tespiti
- [x] `domain/outcome-graph.rules.ts` — `detectCycles`, `findCyclePath`,
      `transitivePrerequisites`, `computeDepths`, `directDependents`
- [x] Önkoşul ekleme/kaldırma/görüntüleme paneli (`PrerequisiteEditor`)
- [x] Döngü oluşturacak adaylar seçicide **devre dışı** ve gerekçeli gösterilir
- [x] Sunucu da aynı saf fonksiyonlarla reddeder — mesaj döngü yolunu kodlarla gösterir
      (`MAT101.K4 → MAT101.K7 → MAT101.K4`)
- [x] 20 unit test

### B.5 Kazanım grafiği
- [x] Düğüm tabanlı, katmanlı SVG grafik (`OutcomeGraph` + saf `graph-layout.ts`)
- [x] Önkoşul → bağımlı kenarları ok ile; döngü kenarları kırmızı/kesikli
- [x] Odak modu: düğüm seçilince yalnızca komşuları vurgulanır
- [x] Ders filtresi, seçili düğüm paneli, gösterim açıklaması
- [x] 112 düğüm · 95 kenar ile doğrulandı

### B.6 Yayın iş akışı
- [x] `domain/publish-workflow.ts` — Draft → Review → Published → Archived (+ restore)
- [x] Geçersiz geçişler engellenir; hata mesajı izin verilen geçişleri söyler
- [x] Yayın ve arşivleme **zorunlu gerekçeli** onay diyaloğu ister
- [x] Her işlem denetim kaydına eski↔yeni değer diff'i ile yazılır
- [x] Yayındaki/arşivlenmiş kayıt düzenlenemez; yalnızca taslak silinebilir
- [x] 17 unit test

### B.7 Altyapı (ölçeklenebilirlik)
- [x] `createCrudHandlers` fabrikası — üç varlık için tek CRUD + iş akışı gerçeklemesi
- [x] `CrudRepository` / `CrudEngine` / `CatalogFacade` — istemci tarafında aynı yaklaşım
- [x] `FieldValidator` — sunucu tarafı alan doğrulaması, istemciyle aynı `*_LIMITS` sabitleri
- [x] İyimser kilitleme: `expectedVersion` uyuşmazlığında 409
- [x] Yeni paylaşılan form bileşenleri: `AppTextarea`, `AppNumberInput`, `AppTagInput`,
      `AppMultiSelect`
- [x] Sayfa boyutları 10 / 25 / 50 / 100 (varsayılan 25)

### B.8 Program yöneticisi paneli
- [x] Toplam program / ders / kazanım KPI'ları · taslak ve yayında sayıları
- [x] Program dağılımı · ders dağılımı · kazanım istatistikleri grafikleri
- [x] Hızlı işlemler programlara yönlendirir; bekleyen taslak sayısı rozet olur

### B.9 Kalite
- [x] 101 unit test yeşil
- [x] Production build uyarısız; **başlangıç paketi 712 kB → 582 kB** (mock backend ve
      seed dinamik import'a alındı)
- [x] `AppFormField` reaktivite hatası düzeltildi (karakter sayacı ve hata mesajları
      Reactive Forms değişimlerini artık izliyor)

---

## Faz C — İçerik, Öğrenme Yolu ve Öneriler (Sprint 4) `[x]`

### C.1 Model ve domain
- [x] `ContentItem` yeniden tanımlandı: tür (video/pdf/sunum/quiz/ödev/dış bağlantı), tek kazanım
      bağı, zorluk, bilişsel seviye, süre, etiket, kapak görseli, kaynak adresi, yayın durumu
- [x] `ContentProgress`: `not_started | in_progress | completed | locked | recommended`,
      yüzde, süre, başlangıç/bitiş/son erişim, değerlendirme puanı
- [x] `domain/learning-rules.ts` — eşikler (`LEARNING_THRESHOLDS`) ve kilit kuralı + **test**
- [x] `domain/learning-path.builder.ts` — önkoşul + ilerleme + ustalıktan yol üretimi + **test**
- [x] `domain/recommendation.engine.ts` — 9 kural, gerekçeli çıktı + **test** (BR-15, BR-16)
- [x] `domain/engagement.ts` — seri, haftalık çalışma, XP, başarım + **test**

### C.2 Mock backend
- [x] `/api/contents` CRUD + yayın iş akışı (`createCrudHandlers`) ve alan doğrulama
- [x] `/api/contents/:id/detail` — içerik + ders + kazanım + önkoşul + ilerleme + kilit
- [x] `/api/contents/:id/progress` — ilerleme kaydı (başlat/güncelle/tamamla)
- [x] `/api/contents/bulk` — toplu yayın/arşiv/taslak/sil, kısmi başarı raporu
- [x] `/api/learning/path` ve `/api/learning/recommendations` — türetilmiş, saklanmaz
- [x] `handlers/learning/learning-context.ts` — yol, öneri ve panelin ORTAK veri derlemesi
- [x] İçerik kapsam kuralı: öğrenci yalnızca kendi derslerinin YAYINDAKİ içeriğini görür

### C.3 Ekranlar
- [x] `/contents` — kart + tablo görünümü, arama, 6 filtre, sıralama, sayfalama (10/25/50/100)
- [x] Hızlı önizleme diyaloğu ve toplu işlem çubuğu
- [x] `/contents/:id` — bilgi, önkoşul, ilerleme takibi, ilgili içerikler, yayın akışı
- [x] İçerik formu — başlık 3–100, açıklama ≤500, etiket ≤30/10 adet, süre 1–600, URL doğrulama
- [x] `/learning/path` — ders sekmeleri, stepper, gerekçeli adımlar, öneri paneli
- [x] Öğrenci paneli: hero, devam kartı, günlük hedef, seri, XP, haftalık grafik, yol,
      öneriler, zayıf/güçlü kazanım, yaklaşan sınav, son içerikler, başarımlar

---

## Faz 3 — Soru Bankası & Versiyonlama (Sprint 5) `[x]`

### 3.1 Model ve domain
- [x] `Question` yeniden tanımlandı: başlık, zengin metin gövde, Bloom seviyesi, tahmini
      çözüm süresi, ekler, favori, versiyon numarası, arşiv/yumuşak silme alanları
- [x] 8 soru türü **kayıt tablosuyla** tanımlı (`QUESTION_TYPE_META`): çoktan seçmeli,
      çoklu seçim, doğru/yanlış, sayısal, kısa cevap, açık uçlu, eşleştirme, sıralama
- [x] `domain/question.rules.ts` — cevap yapısı doğrulaması + versiyon karşılaştırma + **test**
- [x] `shared/utils/rich-text.util.ts` — izin listesi tabanlı temizleyici + **test**
- [x] Yayın akışı `publish-workflow.ts` ile paylaşıldı (ayrı durum makinesi yazılmadı)

### 3.2 Mock backend
- [x] `/api/questions` CRUD + yayın iş akışı (`createCrudHandlers`) ve alan doğrulama
- [x] `/api/questions/:id/detail` — soru + kazanım + versiyon + istatistik + kullanım
- [x] `/api/questions/:id/versions` — geçmiş listesi ve **yeni versiyon oluşturma** (BR-02)
- [x] `/api/questions/:id/versions/compare` — iki snapshot
- [x] `/duplicate`, `/favorite`, `/soft-delete`, `/restore`
- [x] `/api/questions/bulk` — yayınla/arşivle/taslağa al/sil, kısmi başarı raporu
- [x] `/api/questions/export` ve `/import/preview` (içe aktarma sözleşmesi hazır)

### 3.3 Ekranlar
- [x] `/question-bank` — arama, 9 filtre, sıralama, sayfalama (10/25/50/100),
      **kolon görünürlüğü**, favori, rozetler, hızlı önizleme, toplu işlem
- [x] `/questions/new` ve `/questions/:id/edit` — türe göre kendini şekillendiren editör,
      zengin metin, ekler, kaydetmeden önce canlı önizleme
- [x] `/questions/:id` — soru, açıklama, cevap anahtarı, kazanımlar, versiyon geçmişi,
      versiyon karşılaştırma, istatistik ve kullanım blokları
- [x] Ölçme uzmanı paneli: 6 sayaç kartı, tür/zorluk dağılımı, kazanım başına soru,
      son düzenlenenler, en çok kullanılanlar, favoriler

---

## Faz 4 — Blueprint & Sınav Oluşturucu (Sprint 6) `[x]`

- [x] `ExamBlueprint`, `Exam` modelleri + handler'lar (`blueprint.handlers.ts`, `exam.handlers.ts`)
- [x] `/blueprints` — ölçme planı listesi (ders geneli + gruba özel), filtre/sıralama/sayfalama
- [x] `/blueprints/:id` — plan detayı ve kazanım × zorluk editörü (yayındayken salt okunur)
- [x] `BlueprintEditor` — canlı özet: soru, puan, süre, kapsama, zorluk dağılımı
- [x] `ConstraintPanel` — sihirbaz ve detayda paylaşılan canlı kısıt paneli
- [x] `domain/question-selector.ts` — tekrarsız otomatik seçim, hücre kilidi + **unit test** (BR-05)
- [x] `domain/blueprint.rules.ts` — `summarizeBlueprint()`, `alignRows()` + test (BR-04)
- [x] `domain/exam-validation.ts` — 13 kurallı doğrulama motoru + test (BR-39…BR-44)
- [x] `domain/exam-runtime.ts` — tarihten türetilen çalışma durumu + test (BR-46)
- [x] Blueprint sağlanmadan ve kurallar geçmeden yayın engeli (`assertPublishable`)
- [x] `/exams/:id/wizard` — 7 adımlı sihirbaz: bilgi, blueprint, kısıtlar, soru seçimi, doğrulama, önizleme, yayın
- [x] Adım kapıları, 1200 ms gecikmeli otomatik kayıt, kaydedilmemiş değişiklik uyarısı
- [x] `/exams` — liste, çift rozet (yazım + takvim durumu), klonla/kopyala, arşivle, sil
- [x] `/exams/:id` — detay: bilgi, blueprint özeti, kısıt özeti, sorular, gruplar, kazanımlar, yayın geçmişi, istatistik
- [x] Öğrenci görünümü önizlemesi (`ExamPreview`) — başlık, yönerge, soru listesi, örnek sayaç

---

## Faz 5 — Sınav Oturumu & Autosave (Sprint 7) `[x]`

- [x] `ExamSession`, `AnswerDraft` modelleri + handler'lar (`handlers/session/`)
- [x] `/exams/:id/waiting-room` — bekleme odası, sunucu saatli geri sayım, kural listesi
- [x] `/session/:token` — kabuk dışı odak düzeni (menü ve gezinme yok)
- [x] `ExamTimer` — `serverOffset` tabanlı sayaç + test (BR-07, saat değişimi, eşik uyarıları)
- [x] `domain/exam-clock.ts` — 10/5/1 dakika eşikleri, her eşik bir kez uyarır
- [x] Soru navigasyonu, işaretleme, beş durumlu navigatör, klavye kısayolları
- [x] Autosave (900 ms debounce + 30 sn periyodik) + `SaveIndicator`
- [x] `OutboxQueue` — sıralı kuyruk, `dedupeKey` ile birleştirme, yeniden bağlanınca senkron (BR-10)
- [x] 409 çakışma çözümü — sunucu değeri alınır, kullanıcı bilgilendirilir (BR-09)
- [x] Tek aktif oturum kuralı (BR-06) · geç cevap reddi (BR-08)
- [x] Sunucu taraflı otomatik teslim — sekme kapansa da süre dolunca kapanır
- [x] Teslim özeti (boş/işaretli soru numaralarıyla) ve makbuz ekranı (puan gösterilmez, BR-49)
- [x] `/my-exams` — öğrencinin yaklaşan sınavları ve deneme geçmişi

---

## Faz 6 — Değerlendirme & Rubrik (Sprint 7) `[x]`

- [x] `Attempt`, `Rubric` handler'ları (`handlers/grading/`)
- [x] `domain/scoring.ts` — objektif + kısmi puan + **unit test** (BR-11)
- [x] `domain/rubric.calculator.ts` — kriter toplamı = puan + test (BR-13)
- [x] `domain/grading.rules.ts` — puan sınırı, gerekçe zorunluluğu, çakışma tespiti + test
- [x] `/grading` — değerlendirme kuyruğu; yalnızca iş bekleyen denemeler, bekleme süresine göre
- [x] `/grading/:attemptId` — `RubricGrader`, `AnswerGrader`, toplu kaydetme
- [x] Puan değişikliğinde zorunlu gerekçe + puan geçmişi (BR-12)
- [x] İtiraz incelemesi (`UNDER_REVIEW`) ve çakışma çözümü (BR-52)
- [x] `/attempts` ve `/attempts/:id` — deneme listesi ve detayı (cevaplar, zaman çizelgesi, bütünlük, puan geçmişi)
- [x] Ölçme uzmanı panelinde değerlendirme kartları

---

## Faz 7 — Adaptif Öneri Motoru `[ ]`

- [ ] `MasteryScore`, `Recommendation` modelleri
- [ ] `domain/mastery.calculator.ts` — son cevaplar + zorluk + tekrar → 0–100 + **test** (BR-14)
- [x] `domain/recommendation.engine.ts` — kural tabanlı, tamamlanmış/kilitli hariç + **test** (BR-15)
- [x] `RecommendationReasonCard` — girdi değerleri + karar gerekçesi (BR-16)
- [x] Öğrenme yoluna entegrasyon; ustalık değişince öneri değişir
- [ ] Ustalık skorunun sınav sonuçlarından canlı güncellenmesi (Faz 6 sonrası)

---

## Faz 8 — Analitik, Raporlama ve Öğrenme İçgörüleri `[x]`

**Domain (saf, Angular'sız, tamamı testli)**
- [x] `statistics.ts` — ortalama, medyan, std. sapma, yüzdelik, bantlama, not dağılımı
- [x] `analytics-range.ts` — 7/30/90/özel aralık, doğrulama (BR-59), önceki dönem
- [x] `insights.ts` — kural tabanlı içgörüler; her iddia KANITIYLA birlikte
- [x] `learning-velocity.ts` — hız bantları, bileşik skor, risk sinyalleri (BR-55, BR-56)

**Mock backend — `handlers/analytics/`**
- [x] `buildReportScope()` — role göre kapsam, tek noktada (ADR-057)
- [x] 15 rapor ucu: genel bakış, öğrenci, cohort, kazanım, ustalık matrisi, zorluk,
      trend, öneri, hız, başarı panosu, karşılaştırma, madde analizi + kayıtlı rapor CRUD
- [x] `seed-reports.ts` — her demo rol için bir kayıtlı rapor

**Ekranlar**
- [x] `/analytics` — 10 KPI, içgörüler, drill-down bağlantıları
- [x] `/student/:id/analytics` — 14 metrik, kazanım kırılımı, öneri geçmişi, rozetler
- [x] `/cohort-analytics` — dağılımlar, eğilim, öğrenci listesi
- [x] `/analytics/outcomes` — sayfalama/arama/filtre/sıralama ile kazanım tablosu
- [x] `/item-analysis` — zorluk, ayırt edicilik, çeldirici, kalite bayrakları
- [x] `/analytics/difficulty` — beyan edilen ↔ ölçülen zorluk, madde kalitesi saçılımı
- [x] `/analytics/mastery` — kazanım × ders ısı haritası, tıklanabilir hücreler (ADR-063)
- [x] `/analytics/trends` — beş eğilim, ortak zaman ekseni
- [x] `/analytics/recommendations` — öneri motoru performansı (BR-57)
- [x] `/analytics/velocity` — öğrenme hızı, hızlı/yavaş ilerleyenler
- [x] `/analytics/performers` — başarı panosu + gerekçeli risk listesi
- [x] `/analytics/compare` — 2–4 kayıt karşılaştırma (BR-58)
- [x] `/analytics/reports` — kayıtlı rapor, rapor oluşturucu, zamanlama (örnek, BR-60)

**Ortak bileşenler**
- [x] `AnalyticsFilterBar`, `ReportHeader`, `ExportMenu`, `InsightList`,
      `MasteryHeatmap`, `ReportBuilder`

**Kalite**
- [x] 400 unit test yeşil · production build temiz · 6 rolde yetki doğrulaması
- [ ] Memoized selector + `@defer` ile lazy chart rendering — Faz 10'a ertelendi

---

## Faz 9 — Yönetim, Sistem Operasyonları ve Denetim `[x]`

**Domain (saf, Angular'sız, tamamı testli)**
- [x] `academic-term.rules.ts` — çakışma, tek aktif dönem, geçmiş dönem kilidi, akademik yıl biçimi
- [x] `role-definition.ts` — modül bazlı izin gruplaması, sistem rolü koruması, kilitli izinler
- [x] `notification-targeting.ts` — hedef → alıcı çözümü, kampanya doğrulaması
- [x] `system-settings.rules.ts` — ayar sınırları, çapraz kural, parola politikası

**Mock backend — `handlers/admin/`**
- [x] Yönetim panosu ve sistem sağlığı (örnek veri, ölçülebilenden türetilir)
- [x] Kullanıcı CRUD + yaşam döngüsü (askıya al / etkinleştir / arşivle / geri al / kilit aç / parola sıfırla)
- [x] Rol CRUD + kopyala + arşivle; oturum izinleri artık veritabanından hesaplanır
- [x] Akademik dönem CRUD + arşiv, bütünlük kontrolüyle
- [x] Sistem ayarları (tek satırlık koleksiyon, alan bazlı denetim farkı)
- [x] Bildirim kampanyaları + hedef önizlemesi + gönderim
- [x] Genel arama (yetkiye göre süzülen altı kategori)
- [x] Denetim kaydı: modül/sonuç filtresi, gün bazlı zaman çizelgesi, IP ve başarı alanı
- [x] Giriş geçmişi ve hesap kilidi (`auth.handlers`)

**Ekranlar — `features/administration/`**
- [x] `/admin` — 10 KPI, 5 grafik, hızlı işlemler, sistem sağlığı
- [x] `/admin/users` — liste (sayfalama/arama/çoklu filtre/sıralama), satır işlemleri
- [x] `/admin/users/:id` — 5 sekmeli detay (genel, atamalar, giriş, bildirim, denetim)
- [x] `/admin/users/new` · `/admin/users/:id/edit` — tek editör, iki mod
- [x] `/admin/roles` — rol listesi + modül bazlı izin matrisi
- [x] `/admin/terms` — dönem yönetimi, canlı çakışma doğrulaması
- [x] `/admin/settings` — beş bölüm, gerçek/örnek ayrımı yazılı
- [x] `/admin/notifications` — kampanya oluşturucu + gönderim geçmişi
- [x] `/audit-log` — liste ve zaman çizelgesi görünümü

**Ortak bileşenler**
- [x] `AppExportMenu` shared'a taşındı (CSV gerçek, Excel/PDF örnek)
- [x] `ActivityTimeline`, `PermissionMatrix`, `SystemHealthCard`, `GlobalSearchPanel`

**Kalite**
- [x] 464 unit test yeşil · production build temiz
- [x] 6 rolde yetki doğrulaması; Gözlemci salt okunur
- [x] Yer tutucu ekran kalmadı (`ModulePlaceholderPage` kaldırıldı)

---

## Faz 10 — Test, Performans, A11y, Teslim `[ ]`

- [ ] Gerçek zamanlı akış (SSE/WebSocket simülasyonu) — Faz 9'dan ertelendi
- [ ] `@defer` ile lazy chart rendering — Faz 8'den ertelendi

- [ ] Tüm zorunlu unit testler yeşil (`PROJECT_RULES.md` §9)
- [ ] En az 2 integration testi yeşil
- [ ] Virtual scroll + `@defer` + memoization performans doğrulaması
- [ ] Klavye turu, focus yönetimi, aria denetimi, kontrast kontrolü
- [ ] Responsive denetim: 1440 / 1280 / 1024 / 768 / 390 px
- [ ] `npm run build` production — konsolda kritik hata yok
- [ ] `README.md`: amaç, roller, kurulum, çalıştırma, test komutları, mimari kararlar, demo hesaplar
- [ ] `TECHNICAL_NOTES.md`: bilinen eksikler + alınan teknik kararlar
- [ ] Demo videosu senaryosu: ana workflow, rol farkı, hata/rollback, rapor, audit

---

## Karar Bekleyen Konular

| Konu | Not |
|------|-----|
| Kazanım grafiği çizim tekniği | SVG + manuel layout mı, `d3-force` mü? Faz 2'de karar verilecek. |
| Virtual scroll | `@angular/cdk` eklensin mi, elle mi? Faz 3'te ölçülüp karar verilecek. |
| Dark theme | Token'lar hazır; kapsam dışı, zaman kalırsa. |
