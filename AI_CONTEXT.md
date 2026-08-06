# AI_CONTEXT.md

> **Bu dosya her oturumun ilk okunan dosyasıdır.**
> Projede kod yazmadan önce burayı, sonra ilgili özel dosyayı (`ARCHITECTURE.md`,
> `PROJECT_RULES.md`, `DESIGN_SYSTEM.md`, `ROADMAP.md`) oku.
> Yeni bir mimari/tasarım/kural kararı alındığında **önce ilgili dosya güncellenir**, sonra kod yazılır.

---

## 1. Proje Tek Cümlede

Öğrencinin kazanım performansına göre içerik ve soru öneren; sınav oturumlarını yöneten;
soru bankası kalite analizleri ve öğrenme analitiği sunan, **rol tabanlı, Angular 21 + Signals**
tabanlı kurumsal SaaS yönetim paneli.

**Proje adı:** Adaptif Eğitim, Sınav ve Öğrenme Analitiği Platformu
**Tip:** Frontend-only (gerçek backend yok, Mock API + Fake DB ile simüle edilir)
**Teslim:** Staj projesi — production kalitesinde kod bekleniyor.

---

## 2. Temel Kısıtlar (asla ihlal edilmez)

| # | Kısıt |
|---|-------|
| 1 | **Backend yok.** Tüm veri `core/api/mock` altındaki Mock API + `FakeDb` üzerinden gelir. Component asla `FakeDb`'ye doğrudan dokunmaz. |
| 2 | **Gerçek AI yok.** Öneri motoru *açıklanabilir kural tabanlı* çalışır; her öneri "neden önerildi" gerekçesi üretir. |
| 3 | **UI katmanı veri kaynağını bilmez.** Page → Facade → Repository → ApiClient zinciri kırılmaz. |
| 4 | **State yalnızca Signals** ile yönetilir. NgRx/Akita yok. Async akışlarda RxJS operatörleri kullanılır. |
| 5 | **Standalone component** mimarisi. `NgModule` yazılmaz. |
| 6 | **Zoneless** change detection. `zone.js` yok — mutasyon değil, signal güncellemesi yapılır. |
| 7 | Tüm formlar **Reactive Forms**. Template-driven form yasak. |
| 8 | Rol/izin kontrolü **route + işlem + veri kapsamı** seviyesinde. Sadece buton gizlemek yeterli değildir. |
| 9 | Tekrar eden kod yazılmaz — önce `shared/` içinde var mı diye bakılır. |
| 10 | Her ekranda **loading / empty / error / retry / unauthorized** durumları eksiksiz olur. |

---

## 3. Teknoloji Kartı

| Alan | Seçim | Not |
|------|-------|-----|
| Framework | Angular 21 (standalone, zoneless) | Şartname "17+" diyor; en güncel LTS seçildi |
| Dil | TypeScript (strict) | `strict: true`, `noImplicitAny`, `strictTemplates` |
| State | Angular Signals + `computed` + `linkedSignal` + `resource` | Global store yok; feature store'lar var |
| Async | RxJS 7 | Sadece HTTP, event stream, debounce, retry için |
| Kalıcılık | IndexedDB (fake DB) + localStorage (oturum, tercihler) | Veri seti ~5 MB, localStorage kotası yetmez |
| Stil | SCSS + CSS Custom Properties | Token'lar `src/styles/_tokens.scss`, breakpoint'ler `_breakpoints.scss` |
| Grafik | ApexCharts (`ng-apexcharts`) | Sarmalayıcı: `AppChartCard` |
| İkon | Lucide (`lucide-angular`) | Emoji / FontAwesome yasak |
| Font | Inter | `DESIGN_SYSTEM.md` |
| Test | Vitest + Angular Testing Library yaklaşımı | Kritik facade/rule/validator zorunlu |
| Paket yöneticisi | npm | |

---

## 4. Klasör Haritası (nereye ne yazılır)

```
src/app/
├── core/            → Uygulama genelinde TEK örnek (singleton) altyapı
│   ├── api/         → HTTP client, interceptor'lar, hata eşleme, Mock API + FakeDb
│   ├── auth/        → session, rol, izin, guard'lar, veri kapsamı
│   ├── state/       → global signal store'lar (UI state, event bus, toast)
│   ├── storage/     → localStorage / IndexedDB adapter, offline outbox kuyruğu
│   └── observability/ → audit logger, toast kuyruğu
├── shared/          → Domain bilmeyen, her yerde kullanılabilir parçalar
│   ├── components/  → AppCard, AppTable, AppDialog ... (bkz. DESIGN_SYSTEM.md)
│   ├── directives/  → *appHasPermission, appDebounce, appAutofocus
│   ├── validators/  → cross-field + async + domain validator'lar
│   ├── pipes/       → date, score, relativeTime, safeNumber
│   └── utils/       → mapper, formatter, rule helper, query-param sync
├── layout/          → Shell: Sidebar + Header + Content Area
├── features/adaptive-learning/
│   ├── models/      → entity, dto, enum, filter tipleri
│   ├── domain/      → SAF iş kuralı fonksiyonları (use-case katmanı) — test edilir
│   ├── data-access/ → repository + facade
│   ├── state/       → feature store (signals) + selector
│   ├── components/  → domaine özel bileşenler (OutcomeGraph, ExamTimer...)
│   ├── pages/       → route seviyesindeki ekranlar
│   └── adaptive-learning.routes.ts
├── app.config.ts
├── app.routes.ts
└── app.ts
```

**Karar kuralı:** Bir dosya nereye gider?
1. Domain kelimesi geçiyor mu? → `features/`
2. Uygulamada tek örneği mi olmalı, altyapı mı? → `core/`
3. Domainden bağımsız, yeniden kullanılabilir mi? → `shared/`
4. Sadece sayfa iskeleti mi? → `layout/`

---

## 5. Kullanıcı Rolleri (kısa)

| Rol | Kod | Özet |
|-----|-----|------|
| Öğrenci | `STUDENT` | Kendi dersleri, çalışma planı, sınav oturumu |
| Eğitmen | `INSTRUCTOR` | İçerik, soru, rubrik, değerlendirme, öğrenci ilerlemesi |
| Ölçme Uzmanı | `ASSESSMENT_SPECIALIST` | Soru kalitesi, blueprint, madde analizi |
| Program Yöneticisi | `PROGRAM_MANAGER` | Kazanım haritası, program, cohort, yayın |
| Gözlemci | `OBSERVER` | Yetkili cohort için salt okunur rapor |
| Platform Yöneticisi | `PLATFORM_ADMIN` | Rol, izin, dönem, sistem parametreleri |

Detaylı izin matrisi: `PROJECT_RULES.md → İzin Matrisi`.

---

## 6. Rotalar

| Route | Ekran | Yetki |
|-------|-------|-------|
| `/learning/dashboard` | Öğrenme paneli (ana ekran) | Tümü |
| `/programs` | Program listesi | `course:read` |
| `/programs/:id` | Program detayı | `course:read` |
| `/courses` | Ders listesi | `course:read` |
| `/courses/:id` | Ders detayı | `course:read` |
| `/courses/:id/path` | → `/learning/path` yönlendirmesi | `content:read` |
| `/contents` | İçerik listesi (kart + tablo) | `content:read` |
| `/contents/:id` | İçerik detayı + ilerleme | `content:read` |
| `/learning/path` | Öğrenme yolu (stepper + öneriler) | `content:read` |
| `/outcomes` | Kazanım listesi | `outcome:read` |
| `/outcomes/:id` | Kazanım detayı + önkoşullar | `outcome:read` |
| `/outcomes/map` | Kazanım/önkoşul grafiği | `outcome:read` |
| `/question-bank` | Soru bankası listesi | `question:read` |
| `/questions/new` | Yeni soru editörü | `question:write` |
| `/questions/:id/edit` | Soru editörü | `question:write` |
| `/questions/:id` | Soru detayı + versiyon geçmişi | `question:read` |
| `/exam-builder` | Blueprint + sınav oluşturucu | INSTRUCTOR, ASSESSMENT_SPECIALIST |
| `/exams` | Sınav listesi | Tümü (kapsama göre) |
| `/exam-session/:token` | Süreli sınav oturumu | STUDENT |
| `/grading` | Değerlendirme kuyruğu | INSTRUCTOR |
| `/grading/:attemptId` | Rubrikle puanlama | INSTRUCTOR |
| `/student/:id/analytics` | Öğrenci analitiği | STUDENT(kendi), INSTRUCTOR, OBSERVER |
| `/cohort-analytics` | Cohort karşılaştırma | PROGRAM_MANAGER, OBSERVER |
| `/item-analysis` | Madde analizi | ASSESSMENT_SPECIALIST |
| `/audit-log` | Denetim kaydı | PLATFORM_ADMIN |

---

## 7. Domain Sözlüğü (TR ↔ EN)

| Türkçe | Kod karşılığı | Anlam |
|--------|---------------|-------|
| Kazanım | `LearningOutcome` | Öğrencinin edinmesi beklenen ölçülebilir yeterlik |
| Önkoşul | `prerequisiteIds` | Bir kazanımdan önce edinilmesi gereken kazanım |
| İçerik | `ContentItem` | Video/PDF/sunum/kısa sınav/ödev/dış bağlantı materyali |
| İçerik ilerlemesi | `ContentProgress` | Öğrencinin bir içerikteki durumu ve yüzdesi |
| Öğrenme yolu | `LearningPath` | Öğrenciye önerilen sıralı içerik listesi (türetilir) |
| Çalışma serisi | `StreakCard` | Kesintisiz çalışılan gün sayısı |
| Deneyim puanı | `ExperienceCard` | Çalışmadan türetilen XP ve seviye |
| Soru | `Question` | Ölçme maddesi; tek başlık + zengin metin gövde |
| Soru türü | `QuestionType` | 8 tür; davranış `QUESTION_TYPE_META` tablosundan gelir |
| Cevap yapısı | `AnswerShape` | Cevabın biçimi (seçenek/metin/sayı/eşleşme/sıra/rubrik) |
| Versiyon | `QuestionVersion` | Yayınlanmış sorunun değişmez anlık görüntüsü |
| Ustalık skoru | `MasteryScore` | Kazanım bazında 0–100 yeterlik değeri |
| Blueprint | `ExamBlueprint` | Sınavın kazanım/zorluk/tür/puan dağılım kısıtı |
| Oturum | `ExamSession` | Öğrencinin aktif süreli sınav oturumu |
| Deneme | `Attempt` | Tamamlanmış sınav sonucu |
| Taslak cevap | `AnswerDraft` | Autosave edilen, henüz gönderilmemiş cevap |
| Rubrik | `Rubric` | Açık uçlu soru için kriter bazlı puanlama şeması |
| Madde analizi | `ItemAnalysis` | Sorunun zorluk / ayırt edicilik / çeldirici analizi |
| Ayırt edicilik | `discrimination` | Sorunun başarılı-başarısız öğrenciyi ayırma gücü |
| Çeldirici | `distractor` | Yanlış seçenek |
| Cohort | `Cohort` | Karşılaştırma yapılan öğrenci grubu |
| Denetim kaydı | `AuditEvent` | Kim, ne zaman, neyi, nasıl değiştirdi |
| Bildirim | `Notification` | Kalıcı, okundu bilgisi taşıyan kullanıcı bildirimi |

---

## 8. Kritik İş Kuralları (özet — tamamı `PROJECT_RULES.md`'de)

1. Kazanım önkoşul grafiğinde **döngü olamaz** (DFS ile kaydetmeden önce kontrol).
2. **Yayınlanmış soru/sınav değiştirilemez** → yeni versiyon üretilir; eski sınavlar eski snapshot'ı korur.
3. **Blueprint hedefleri karşılanmadan** sınav yayınlanamaz.
4. Öğrenci aynı sınav için **birden fazla aktif oturum** açamaz (tek aktif oturum token'ı).
5. Sınav süresi **istemci saatinden değil**, sunucu referans zamanından (`serverTimeOffset`) hesaplanır.
6. Autosave **eski versiyonla gelirse sessizce ezmez** → `409 Conflict` gösterilir.
7. Rubrik puan değişikliğinde **gerekçe zorunlu**.
8. Adaptif öneri **tamamlanmış/kilitli içeriği** tekrar önermez.
9. Cohort raporu **minimum öğrenci sayısı (5)** altındaysa bireysel detay göstermez.
10. Her yayın / puan değişikliği / oturum sonlandırma / override **AuditEvent üretir**.

---

## 9. Demo Hesaplar

| E-posta | Şifre | Rol |
|---------|-------|-----|
| `student@adaptif.dev` | `demo1234` | Öğrenci |
| `instructor@adaptif.dev` | `demo1234` | Eğitmen |
| `specialist@adaptif.dev` | `demo1234` | Ölçme Uzmanı |
| `manager@adaptif.dev` | `demo1234` | Program Yöneticisi |
| `observer@adaptif.dev` | `demo1234` | Gözlemci |
| `admin@adaptif.dev` | `demo1234` | Platform Yöneticisi |

---

## 10. Yeni Bir Özellik Eklerken İzlenecek Sıra

1. `ROADMAP.md`'de faz/görev var mı? Yoksa ekle.
2. `models/` → tip tanımla (entity + dto + filter).
3. `domain/` → saf iş kuralı fonksiyonu + **unit test**.
4. Mock: `core/api/mock/seed/` → veri, `.../handlers/` → endpoint handler.
5. `data-access/` → repository (HTTP) + facade (orkestrasyon).
6. `state/` → signal store + computed selector.
7. `pages/` → smart component; sadece facade'e bağlanır.
8. UI'da **yalnızca** `shared/components` kullanılır; yeni ortak parça gerekiyorsa önce `DESIGN_SYSTEM.md`'ye eklenir.
9. Route + guard + izin tanımı.
10. Bitince: `ROADMAP.md` durumu güncellenir; yeni karar varsa ilgili doküman güncellenir.

---

## 11. Doküman Sorumlulukları

| Dosya | Neyi barındırır | Ne zaman güncellenir |
|-------|-----------------|----------------------|
| `AI_CONTEXT.md` | Genel bağlam, sözlük, hızlı harita | Rol/route/teknoloji değişince |
| `ARCHITECTURE.md` | Katmanlar, veri akışı, klasör sözleşmesi, ADR'ler | Mimari karar alınınca |
| `PROJECT_RULES.md` | Kod standardı, SOLID, iş kuralları, izin matrisi, DoD | Kural/konvansiyon değişince |
| `DESIGN_SYSTEM.md` | Token, tipografi, spacing, component kataloğu | Yeni UI bileşeni / stil kararı |
| `ROADMAP.md` | Fazlar, görev listesi, ilerleme durumu | Her görev bitiminde |

---

## 12. Demo Veri Ölçeği

Fake DB deterministik olarak üretilir (sabit tohumlu PRNG) ve **IndexedDB**'de saklanır.

| Koleksiyon | Adet | Koleksiyon | Adet |
|---|--:|---|--:|
| Kullanıcı | 131 | Soru | 300 |
| — öğrenci | 102 | Soru versiyonu | 351 |
| — eğitmen | 20 | Sınav | 60 |
| Program | 10 | Sınav denemesi | 1.020 |
| Cohort | 12 | Ustalık skoru | 2.493 |
| Ders | 20 | Öneri | 612 |
| Kazanım | 112 | Madde analizi | 190 |
| İçerik | 224 | Denetim kaydı | 176 |
| İçerik ilerlemesi | 4.918 | Bildirim | 530 |

> Son cohort (3 öğrenci) bilinçli olarak küçük bırakılmıştır — gizlilik eşiği (BR-17)
> demo sırasında gerçekten tetiklenir.

---

## 13. Dashboard Ekosistemi

Her rolün **kendi payload tipi** vardır; hepsi `role` alanıyla ayrışan bir birleşim oluşturur
(`models/dashboard.model.ts`). Sunucu tarafında rol → builder eşlemesi
`handlers/dashboard/` altındadır; yeni rol eklemek mevcut kodu değiştirmez.

| Rol | Panelin odağı |
|-----|---------------|
| Öğrenci | Ustalık trendi, ısı haritası, açıklanabilir öneriler, son içerikler, yaklaşan sınavlar |
| Eğitmen | Değerlendirme kuyruğu, ders bazlı trend, soru bankası durumu, risk altındaki öğrenciler |
| Ölçme Uzmanı | Zorluk/ayırt edicilik histogramları, madde bulutu, blueprint kapsaması, yavaş maddeler |
| Program Yöneticisi | Cohort karşılaştırma, yayın hattı, cohort × kazanım matrisi, ders sağlığı |
| Gözlemci | Salt okunur özet + gizlenen grupların açık bildirimi |
| Platform Yöneticisi | Rol dağılımı, denetim trendi, sistem sağlığı, veri hacmi |

Ortak bloklar (KPI satırı, hızlı işlemler, bildirimler, etkinlik akışı, istatistikler)
TEK bileşen kümesiyle render edilir: `components/dashboard/`.

---

## 14. Katalog Yönetimi (Faz B)

Program → Ders → Kazanım hiyerarşisi ortak bir altyapı üzerine kuruludur:

| Katman | Ortak parça | Varlığa özgü olan |
|--------|-------------|-------------------|
| Mock API | `createCrudHandlers` fabrikası | doğrulama, kapsam, bütünlük kuralları |
| HTTP | `CrudRepository` | yalnızca `endpoints` |
| State | `CrudEngine` (+ `EntityStore`) | — |
| Facade | `CatalogFacade` | kazanımda önkoşul/grafik ek davranışı |
| Ekran | `AppTable` + `AppFilterBar` + form diyaloğu | kolon ve filtre tanımı |

**Yayın akışı (BR-21):** `Draft → Review → Published → Archived`, arşivden taslağa geri alma.
Geçersiz geçiş 422 ile reddedilir; yayın ve arşivleme zorunlu gerekçe ister ve denetim
kaydına eski↔yeni değer diff'i yazılır.

**Döngü tespiti (BR-01):** `domain/outcome-graph.rules.ts` içindeki saf fonksiyonlar hem
formda (aday seçenek devre dışı + gerekçe) hem sunucuda (422 + döngü yolu) kullanılır.

---

## 15. Adaptif Öğrenme (Faz C)

Öğrencinin gerçekten ders çalıştığı katman. Üç ekran (öğrenci paneli, öğrenme yolu,
içerik detayı) **aynı veriyi** görür çünkü üçü de tek bir derleme noktasından beslenir.

```
Kazanım önkoşulları ─┐
Tamamlanan içerik  ──┤→ handlers/learning/learning-context.ts
Ustalık skorları   ──┘        │
                              ├─→ domain/learning-path.builder.ts → LearningPath
                              └─→ domain/recommendation.engine.ts → Recommendation[]
```

**İçerik türleri:** `video · pdf · presentation · quiz · assignment · external_link`.
Bir kazanım içinde pedagojik sıra `CONTENT_TYPE_ORDER` ile sabittir:
video → sunum → PDF → kısa sınav → ödev → dış bağlantı.

**Öneri kuralları (AI YOK, kural tabanlı — BR-15/BR-16).** Her kural puan üretir ve o
puanın gerekçesini (`explanation` + sayısal `evidence`) taşır; toplam puan sıralamayı belirler:

| Kural | Tetikleyici | Ağırlık |
|-------|-------------|---------|
| `prerequisite_gap` | Önkoşul eksik → ileri içerik kilitli | 45 |
| `failed_assessment` | Son değerlendirme < %50 → kolay içerik | 40 |
| `low_mastery_watch` | Ustalık < 40 → anlatım içeriği (video/sunum/PDF) | 35 |
| `mid_mastery_practice` | Ustalık 40–70 → ölçme içeriği (quiz/ödev) | 28 |
| `incomplete_content` | Yarım kalan içerik | 22 |
| `spaced_repetition` | 7+ gündür çalışılmadı → tekrar | 20 |
| `exam_upcoming` | Yaklaşan sınav kapsamı (gün sayısıyla ölçeklenir) | 18 |
| `next_in_sequence` | Önceki adımlar bitti → sıradaki içerik | 15 |
| `high_mastery_advance` | Ustalık > 80 → sonraki kazanım | 12 |

**Eşikler tek yerde:** `domain/learning-rules.ts → LEARNING_THRESHOLDS`
(`lowMastery 40 · midMastery 70 · highMastery 80 · unlockMastery 60 · staleDays 7 · failingScore 50`).

**Oyunlaştırma** yalnızca arayüz seviyesindedir; seri, XP ve başarımlar gerçek ilerleme
kayıtlarından `domain/engagement.ts` ile hesaplanır (BR-32).

---

## 16. Soru Bankası (Faz 3)

Sprint 6'daki Blueprint ve Sınav Oluşturucu'nun üzerine kurulacağı katman.

**Tür kayıt tablosu.** Sorunun davranışı tür adına göre değil, `QUESTION_TYPE_META`
tablosundaki `answerShape` alanına göre belirlenir:

| `answerShape` | Türler | Editörde görünen |
|---------------|--------|------------------|
| `options` | çoktan seçmeli · çoklu seçim · doğru/yanlış | seçenek listesi + doğru işareti |
| `numeric` | sayısal | beklenen değer + tolerans |
| `text` | kısa cevap | örnek cevap |
| `pairs` | eşleştirme | sol ↔ sağ satırları |
| `sequence` | sıralama | sıra numaralı öğeler |
| `manual` | açık uçlu | cevap anahtarı yok (rubrik) |

Editör, doğrulayıcı (`validateAnswerShape`), önizleme ve liste rozetleri **aynı tablodan**
beslenir. Yeni bir tür eklemek = tabloya bir satır + önizlemede bir şekil bloğu.

**Versiyonlama (BR-02, BR-03).** Yayındaki soru düzenlenemez. "Yeni versiyon oluştur"
akışı mevcut hâli snapshot olarak korur, soruyu taslağa döndürür ve `versionNumber`'ı
artırır. Kullanıcının girdiği değişiklik notu `pendingChangeNote` alanında taşınır ve
soru yeniden yayınlandığında snapshot'a yazılır. Sınavlar soruya değil snapshot'a bağlıdır.

**Versiyon karşılaştırma** istemcide, saf `compareVersions()` ile hesaplanır ve yalnızca
DEĞİŞEN alanları döner ("Orta → Zor" gibi okunabilir değerlerle).

---


---

## 18. Sınav Oluşturma (Faz 4)

**Blueprint = ölçme planı.** Kazanım × zorluk tablosudur: her hücre "bu kazanımdan kaç
kolay/orta/zor soru sorulacak" der. `cohortId === null` ise plan ders genelidir; doluysa
gruba özeldir. Hedef toplam puan ve hedef süre de plandan gelir.

**İki ayrı durum.** `Exam.state` YAZIM durumudur (Taslak/İncelemede/Yayında/Arşiv) ve
`publish-workflow.ts`'i katalogla paylaşır. "Planlandı / devam ediyor / kapandı" ise
ÇALIŞMA durumudur, saklanmaz — `examRuntimeStatus(exam, now)` tarihlerden türetir.
Listelerde ikisi ayrı rozetlerde gösterilir; farklı sorulara cevap verirler (ADR-041).

**Tek doğrulama motoru.** `validateExam()` 13 kuralı çalıştırır (BR-39…BR-44). Aynı
fonksiyonu üç yer kullanır: sihirbazdaki canlı kısıt paneli, detay ekranındaki kısıt
özeti ve sunucunun yayın öncesi denetimi. Bu yüzden panel "hazır" derken sunucunun
reddetmesi mümkün değildir (ADR-043).

**Otomatik seçim.** `selectQuestions()` blueprint hücrelerini gezer ve her hücre için
yayında + en güncel sürüme sahip soruları seçer. Bir soru birden çok kazanıma bağlı
olsa bile YALNIZCA BİR hücreye sayılır; aksi hâlde seçici ile doğrulayıcı ayrışırdı
(ADR-044). Bankada karşılığı olmayan hücreler `shortfalls` olarak raporlanır.

**Sihirbaz.** 7 adım: bilgi → blueprint → kısıtlar → soru seçimi → doğrulama →
önizleme → yayın. Adımlar `stepAvailability()` ile kapılanır, taslak 1200 ms gecikmeyle
otomatik kaydedilir. Yayın adımı durum makinesinin O AN izin verdiği eylemi sunar;
taslak bir sınav doğrudan yayına alınamaz.

**Yetki.** İş akışı geçişleri `exam:publish` ister (blueprint için `blueprint:write`).
Yazma yetkisi tek başına yetmez — arayüz de aynı yetkiye bakar (ADR-047).

---

## 19. Sınav Oturumu ve Değerlendirme (Faz 5–6)

**Sınav ekranı kabuğun dışındadır** (`/session/:token`). Menü ve gezinme bağlantısı
yoktur: sınav sırasında dikkat dağıtmamalı ve öğrenci yanlışlıkla dışarı çıkmamalıdır.
Teslim makbuzu da (`/session/:token/submitted`) aynı gerekçeyle kabuk dışındadır.

**Süre asla istemci saatinden hesaplanmaz** (BR-07). Sunucu her yanıtta `serverNow`
gönderir; istemci farkı bir kez ölçer (`serverOffset`) ve sayacı hep bu düzeltmeyle
yürütür. Otomatik teslim de istemciye bırakılmaz: sunucu, oturuma her dokunulduğunda
süreyi denetler ve gerekirse denemeyi kendisi oluşturur — sekme kapalıyken de sınav
kapanır.

**Autosave üç yoldan çalışır.** Cevap değişince 900 ms gecikmeyle, ayrıca 30 saniyede
bir, ayrıca soru değişiminde ve ekrandan çıkarken. Bağlantı kesilirse istekler
`OutboxQueue`'ya sıralı biçimde alınır (BR-10); aynı sorunun tekrarlanan kayıtları
`dedupeKey` ile birleşir, bağlantı gelince yalnızca son değer gider.

**Çakışma sunucu lehine çözülür** (BR-09). Çakışma pratikte öğrencinin sınavı iki
sekmede açmasından doğar ve iki cevap da kendisine aittir; süre akarken "hangisini
istersiniz?" diye sormak yanlış olurdu. Sunucudaki değer alınır, kullanıcıya ne
olduğu açıkça söylenir.

**Öğrenciye doğru cevap gönderilmez** (BR-47). Seçenek doğruluğu, beklenen cevap,
eşleştirme karşılıkları ve doğru sıra `buildQuestionViews()` içinde ayıklanır.
Seçenekler öğrenciye özel ama KARARLI biçimde karıştırılır: tohum oturum jetonundan
türetilir, böylece sayfa yenilendiğinde sıra değişmez.

**Teslimden sonra puan gösterilmez** (BR-49). Açık uçlu cevaplar henüz
değerlendirilmemişken not vermek yanıltıcı olurdu. Makbuz teslimin gerçekleştiğini
kanıtlar ve sürecin nasıl ilerleyeceğini anlatır.

**Rubrik puanı elle girilemez** (BR-13). Değerlendirici kriter başına bir seviye seçer,
puan `evaluateRubric()` ile hesaplanır ve sorunun puanına ölçeklenir. Sunucu da
istemciden gelen puanı değil seviye kimliklerini kaynak alır.

**Gerekçe yalnızca MEVCUT bir puan değişirken zorunludur** (BR-12). İlk puanlamada
gerekçe istemek, değerlendiriciyi her soruda anlamsız metin yazmaya iterdi.

**Çakışma ve itiraz saklanmaz, `scoreHistory`'den türetilir** (ADR-050). Kim ne puan
verdi bilgisi zaten orada; ikinci bir kaynak tutmak ayrışma riski doğururdu. İtiraz
kayıtları `İTİRAZ:`, çakışma kararları `ÇAKIŞMA:` önekiyle ayrışır.
## 18. Analitikte Doğruluk Sözleşmesi (Sprint 8)

**Kapsam tek yerde kurulur** (ADR-057). `buildReportScope()` çağıranın rolüne göre
program / ders / grup / öğrenci kümesini belirler; rapor üreticileri hazır kapsamı
alır. Hiçbir uç kendi rol filtresini yazmaz — yazsaydı, unutulan bir filtre sessizce
veri sızdırırdı. Kapsam dışı öğrenci `404` döner, `403` değil (BR-54).

**Ölçüm yokluğu sıfır değildir** (ADR-060, BR-55). Hiç etkinliği olmayan öğrenci
%0 ustalıkla "riskli" görünüyordu — 102 öğrencinin 57'si. Artık her risk sinyali
yalnızca KENDİ ölçümü varsa değerlendirilir; ölçülmemiş öğrenciler ayrı sayılır ve
hiçbir listeye girmez. Aynı ilke karşılaştırma tablosunda `sampleSize` ile, öneri
analizinde "öneri üretilmedi" mesajıyla uygulanır.

**Birikimli oran iki ana göre karşılaştırılır** (ADR-058). Tamamlama oranı bir
durum ölçüsüdür; önceki dönemi "o dönemde tamamlananlar" sayınca %789 artış çıkıyordu.
`completionRateAsOf()` aynı kümeyi iki farklı ana göre ölçer.

**Öneri kabulü davranıştan ölçülür** (ADR-059, BR-57). Öneriden sonra içeriğin
açılması "kabul", tamamlanması "isabet"tir. Kayıtta bir "kabul edildi" alanı olsaydı
motorun kendi hakkındaki iddiası olurdu.

**Her içgörü kanıt taşır.** `buildInsights()` ürettiği her cümlenin yanına dayandığı
ölçümü koyar. Gerekçesiz bir "risk altında" etiketi öğretim elemanına ne yapacağını
söylemez, öğrenci için de haksız bir damgadır (BR-56).

**Zamanlama ve dışa aktarım dürüstçe etiketlenir** (BR-60). Zamanlayıcı ve e-posta
gönderimi yoktur; ekran bunu gizlemek yerine yazar. CSV gerçek dosya üretir, Excel
ve PDF "örnek" etiketlidir.

## 19. Yönetimde Doğruluk Sözleşmesi (Sprint 9)

**İzinler artık veritabanından okunur** (ADR-066). `ROLE_PERMISSIONS` derleme
zamanı sabiti TOHUM kaynağıdır; tohumlandıktan sonra doğruluk kaynağı
`roleDefinitions` koleksiyonudur. Yönetici bir rolün izinlerini değiştirdiğinde
etki `permissionsFromDefinitions()` üzerinden yayılır ve kullanıcının bir
sonraki oturumunda geçerli olur — ekran bunu söyler, yoksa "kaydettim ama
değişmedi" izlenimi doğardı.

**Sistem rolleri korunur** (ADR-067). Altı rol silinemez ve adları değişmez;
kod içinde `Role` tipiyle referans alınırlar. Platform Yöneticisinden
`admin:manage` kaldırılamaz: kaldırılabilseydi sistem kendini dışarıdan kilitler
ve ancak veritabanı sıfırlanarak açılırdı.

**Durum bayrağı yerine takvim** (ADR-065). Dönemin `active` alanı kaldırıldı;
durum `termStatus(term, now)` ile hesaplanır. Aynı ilke sınav çalışma durumunda
(ADR-041) ve yayın akışında da geçerlidir: saatin ilerlemesiyle kendiliğinden
yanlışa düşen bir alan tutulmaz.

**Kilit sayaçtan türetilir** (ADR-068, BR-65). `failedLoginCount` sınıra
ulaştığında hesap kilitlidir; ayrı bir bayrak yoktur. Kilit kontrolü parola
doğrulamasından sonra yapılır ki hesabın varlığı sızmasın.

**Alıcılar gönderim anında çözülür** (ADR-069, BR-68). Kampanya bir şablondur;
"kaç kişiye gidecek?" önizlemesi ile gerçek gönderim AYNI fonksiyonu kullanır,
dolayısıyla önizleme yanıltamaz.

**Formlar sinyal değildir** (ADR-070). `computed` içinde `form.valid` ya da
`getRawValue()` okumak bağımlılık kurmaz; değer önce `toSignal(form.valueChanges)`
ile bir sinyale kopyalanır. Bu hata sınıfı üç ekranda birden görüldü: dönem
çakışma uyarısı hiç çıkmıyor, ayar ihlali donuyor, bildirim düğmesi hep pasif
kalıyordu.

**Form içinde tek gönderim yolu** (ADR-071). `type="submit"` ile `(pressed)`
birlikte bağlanınca tek tıklama iki gönderim üretiyordu; form içindeki düğme
yalnızca `type="submit"` taşır.

**Örnek olan söylenir** (BR-71). Sistem sağlığı, IP adresleri, e-posta gönderimi
ve zamanlanmış rapor/bildirim — hepsi örnektir ve ekranda öyle etiketlenir.
Çalışmayan bir göstergeyi çalışıyormuş gibi sunmak, çalışan her şeye duyulan
güveni de zedeler.

## 17. Güncel Durum

> Bu bölüm her önemli aşamada güncellenir.

- **Tamamlanan:** Faz 0–1 (altyapı), **Faz A** (veri modeli + 6 rol dashboard'u),
  **Faz B** (program/ders/kazanım yönetimi, kazanım grafiği, yayın akışı),
  **Faz C** (içerik yönetimi, öğrenme yolu, öneri motoru, öğrenci öğrenme paneli),
  **Faz 3** (soru bankası: CRUD, versiyonlama, editör, ölçme uzmanı paneli),
  **Faz 4** (blueprint, 7 adımlı sınav sihirbazı, kısıt paneli, doğrulama motoru),
  **Faz 5–6** (sınav oturumu, autosave/offline, teslim akışı, rubrikli değerlendirme),
  **Faz 8** (analitik, raporlama, öğrenme içgörüleri — 13 ekran, 15 rapor ucu),
  **Faz 9** (yönetim paneli, kullanıcı/rol/dönem/ayar yönetimi, bildirim merkezi,
  denetim kaydı — 9 ekran, veritabanı tabanlı RBAC).
- **2026-08-04:** RBAC yeniden düzenlemesi (ADR-075/076) — sidebar rol bazlı
  (`NAV_GROUPS_BY_ROLE`), izin matrisi gerçek LMS iş bölümüne göre sıkılaştırıldı
  (Eğitmen artık soru bankası/blueprint/sınav yazamaz; Program Yöneticisi madde analizi
  yapmaz, akademik takvimi salt okunur görür — yeni `term:read` izni).
- **Sonraki:** Faz 10 — test, performans, erişilebilirlik ve teslim. Detay: `ROADMAP.md`.
