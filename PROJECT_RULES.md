# PROJECT_RULES.md

> Kod standardı, SOLID uygulaması, iş kuralları, izin matrisi ve "Definition of Done".
> Yeni bir kural/konvansiyon kararı alındığında burası güncellenir.

---

## 1. Altın Kurallar

1. **Tekrar etme.** Aynı işi yapan ikinci bir kod yazmadan önce `shared/` ve `core/`'a bak.
2. **Bir dosya, bir sorumluluk.** Dosya 200 satırı geçtiyse böl.
3. **UI veri kaynağını bilmez.** Component içinde `HttpClient`, `FakeDb`, `localStorage` yasak.
4. **İş kuralı component'te yaşamaz.** `domain/` içinde saf fonksiyon olarak yazılır ve test edilir.
5. **Sihirli sayı/string yok.** Sabitler `*.constants.ts` veya enum'a taşınır.
6. **`any` yasak.** Bilinmeyen tip için `unknown` + type guard.
7. **Her public metodun tek net görevi vardır.** İsim ne yaptığını söyler (`publishExam`, `recalculateMastery`).
8. **Yorum niyeti anlatır, kodu tekrar etmez.** İş kuralı yorumu zorunlu (şartname: "açıklamasız hard-coded iş kuralı bırakılmayacak").
9. **Her async işlem 5 durumu düşünür:** loading, success, empty, error, unauthorized (+retry).
10. **Yıkıcı işlem confirm dialog ister**, gerekiyorsa zorunlu gerekçe alanı açar.

---

## 2. SOLID — Bu Projede Nasıl Uygulanır

### S — Single Responsibility
| Katman | Tek sorumluluğu |
|--------|-----------------|
| `*.store.ts` | State tutmak ve türetmek. I/O yok. |
| `*.repository.ts` | HTTP + DTO↔Entity mapping. İş kuralı yok. |
| `*.facade.ts` | Orkestrasyon: store + repo + domain + toast + audit. Hesap yapmaz. |
| `domain/*.ts` | Saf iş kuralı hesabı. Angular yok, I/O yok. |
| `*.page.ts` | Kullanıcı etkileşimini facade komutuna çevirmek. |
| `shared/components` | Görsel sunum. Domain bilmez. |

### O — Open/Closed
* Mock endpoint eklemek: yeni `MockHandler[]` dizisi → registry'ye eklenir, mevcut dosya değişmez.
* Yeni grafik tipi: `AppChartCard`'a yeni `variant` config'i eklenir, `if/else` zinciri büyütülmez.
* Yeni tablo kolonu tipi: `ColumnDef.cell` template'i ile dışarıdan verilir.
* Yeni rol: `ROLE_PERMISSIONS` matrisine satır eklenir; guard kodu değişmez.

### L — Liskov Substitution
* `StorageAdapter` arayüzünün `LocalStorageAdapter` / `MemoryStorageAdapter` gerçeklemeleri
  birbirinin yerine geçebilir; test bunu kullanır.
* Kalıtım yerine **composition** tercih edilir (`EntityStore` miras alınmaz, içeri alınır).

### I — Interface Segregation
* Şişman `IService` arayüzleri yok. `Readable<T>`, `Writable<T>`, `Queryable<T>` gibi
  küçük arayüzler ayrı tutulur.
* Component `input()`'ları minimum tutulur; kullanılmayan alan geçilmez.

### D — Dependency Inversion
* Somut sınıf yerine `InjectionToken` enjekte edilir:
  `STORAGE_ADAPTER`, `CLOCK`, `ID_GENERATOR`, `RANDOM`.
* Bu sayede testte zaman/rastgelelik/depolama sahtelenebilir (sınav sayacı testi için kritik).

---

## 3. İsimlendirme ve Dosya Konvansiyonu

| Tür | Dosya | Sınıf/Sembol | Örnek |
|-----|-------|--------------|-------|
| Sayfa | `*.page.ts` | `XxxPage` | `question-bank.page.ts` → `QuestionBankPage` |
| Bileşen | `*.component.ts` | `XxxComponent` | `exam-timer.component.ts` |
| Ortak bileşen | `app-*.component.ts` | `AppXxxComponent` | `app-table.component.ts` |
| Store | `*.store.ts` | `XxxStore` | `exam-session.store.ts` |
| Facade | `*.facade.ts` | `XxxFacade` | `grading.facade.ts` |
| Repository | `*.repository.ts` | `XxxRepository` | `question.repository.ts` |
| Domain kuralı | `*.rules.ts` / `*.calculator.ts` | saf fonksiyon | `mastery.calculator.ts` |
| Model | `*.model.ts` | `interface` / `type` | `question.model.ts` |
| Guard | `*.guard.ts` | `xxxGuard` (fonksiyon) | `permission.guard.ts` |
| Direktif | `*.directive.ts` | `XxxDirective` | `has-permission.directive.ts` |
| Mock handler | `*.handlers.ts` | `XXX_HANDLERS` | `question.handlers.ts` |
| Test | `*.spec.ts` | — | `mastery.calculator.spec.ts` |

* Dosya adları **kebab-case**, semboller **PascalCase**, değişkenler **camelCase**,
  sabitler **SCREAMING_SNAKE_CASE**.
* Selector prefix: `app-`.
* Klasör başına `index.ts` **yazılmaz** (barrel dosyaları tree-shaking'i bozar); doğrudan import edilir.

---

## 4. Angular Kullanım Kuralları

```ts
// ✅ DOĞRU
@Component({
  selector: 'app-course-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppTableComponent, AppEmptyStateComponent],
  templateUrl: './course-list.page.html',
  styleUrl: './course-list.page.scss',
})
export class CourseListPage {
  private readonly facade = inject(CourseFacade);
  readonly courses = this.facade.courses;      // signal
  readonly courseId = input.required<string>();// route param binding
  readonly selected = output<Course>();
}
```

**Zorunlu:**
- `inject()` kullan, constructor injection yazma.
- `input()` / `output()` / `model()` signal API'lerini kullan; `@Input()`/`@Output()` yazma.
- `changeDetection: OnPush` her component'te.
- Template'te yeni control flow: `@if`, `@for (… ; track x.id)`, `@switch`, `@defer`.
- `*ngIf` / `*ngFor` / `NgClass` / `NgStyle` **kullanılmaz** (yerine `@if`, `@for`, `[class.x]`, `[style.x]`).
- `styleUrl` (tekil), `templateUrl` ayrı dosya. 20 satırdan kısa şablonlar inline olabilir.
- Subscribe edilen her akış `takeUntilDestroyed()` ile temizlenir.
- Signal'ları template'te `()` ile oku; `effect()` içinde state yazma (döngü riski) — `computed` tercih et.

**Yasak:**
- `NgModule`, `zone.js`'e bağlı kod, `setTimeout` ile change detection tetikleme.
- `document`/`window`'a doğrudan erişim (gerekirse `DOCUMENT` token'ı).
- Template'te fonksiyon çağrısı ile ağır hesap (→ `computed`).
- `subscribe()` içinde `subscribe()`.

---

## 5. Reactive Forms Kuralları

* Her form `FormGroup` + tipli `FormControl<T>` ile kurulur (`nonNullable` varsayılan).
* Validator'lar `shared/validators/` altında, yeniden kullanılabilir fonksiyonlar olarak.
* **Cross-field** örnek: `blueprintTotalMatchesExamScore`, `passingScoreLteMaxScore`.
* **Async** örnek: `uniqueOutcomeCodeValidator`, `questionStemNotDuplicate`.
* **Domain** örnek: `noPrerequisiteCycleValidator`, `rubricLevelsMonotonic`.
* Hata mesajları `shared/validators/validation-messages.ts` içinde tek yerden çözülür;
  `<app-form-field>` bunları otomatik gösterir.
* Kaydet butonu: `loading` durumunda spinner + `disabled`; başarı sonrası success animasyonu.
* Kirli formdan çıkışta `unsavedChangesGuard` uyarır.

### 5.1 Alan sınırları — tek kaynak

Hiçbir input sınırsız değildir. Sınırlar modelde `*_LIMITS` sabiti olarak tanımlanır ve
**hem istemci validator'ı hem mock sunucu doğrulaması aynı sabiti** kullanır; iki taraf
ayrışamaz. Uzun metin alanlarında `<app-form-field [maxLength]>` karakter sayacı gösterir.

| Sabit | Alan | Sınır |
|-------|------|-------|
| `CONTENT_LIMITS.title` | İçerik başlığı | min 3, max 100 |
| `CONTENT_LIMITS.description` | Açıklama | max 500 |
| `CONTENT_LIMITS.tag` / `tagCount` | Etiket | tek etiket max 30, en çok 10 etiket |
| `CONTENT_LIMITS.estimatedDurationMinutes` | Tahmini süre | 1–600 (pozitif tam sayı) |
| `CONTENT_LIMITS.url` | Kapak görseli / kaynak adresi | max 500, `http(s)://` zorunlu |
| `QUESTION_LIMITS.title` | Soru başlığı | min 5, max 150 |
| `QUESTION_LIMITS.stem` | Soru gövdesi (zengin metin) | max 3000 — **düz metin** üzerinden sayılır |
| `QUESTION_LIMITS.explanation` | Açıklama | max 2000 |
| `QUESTION_LIMITS.tag` / `tagCount` | Etiket | tek etiket max 30, en çok 10 etiket |
| `QUESTION_LIMITS.estimatedSolveTimeSeconds` | Tahmini çözüm süresi | 10–3600 sn (pozitif tam sayı) |
| `QUESTION_LIMITS.points` | Puan | 1–100 |
| `QUESTION_LIMITS.outcomeCount` | Bağlı kazanım | en az 1, en çok 5 |

Bağlantı doğrulaması `shared/utils/url.util.ts → isHttpUrl()` ile yapılır; `httpUrl()`
form validator'ı ve `FieldValidator.url()` sunucu kuralı aynı fonksiyonu çağırır.
Etiket listesi `tagList()` validator'ı ile hem adet hem tek etiket uzunluğu için sınırlanır.

---

## 6. İzin Matrisi

Format: `resource:action`

| Permission | STUDENT | INSTRUCTOR | ASSESSMENT_SPECIALIST | PROGRAM_MANAGER | OBSERVER | PLATFORM_ADMIN |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| `course:read` | ✔ (kendi) | ✔ | ✔ | ✔ | ✔ | ✔ |
| `course:write` | | ✔ | | ✔ | | ✔ |
| `course:publish` | | | | ✔ | | ✔ |
| `outcome:read` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `outcome:write` | | ✔ | | ✔ | | ✔ |
| `outcome:map` | | | | ✔ | | ✔ |
| `content:read` | ✔ | ✔ | | ✔ | ✔ | ✔ |
| `content:write` | | ✔ | | ✔ | | ✔ |
| `question:read` | | ✔ | ✔ | ✔ | | ✔ |
| `question:write` | | ✔ | ✔ | | | ✔ |
| `question:publish` | | ✔ | ✔ | | | ✔ |
| `blueprint:read` | | ✔ | ✔ | ✔ | | ✔ |
| `blueprint:write` | | ✔ | ✔ | | | ✔ |
| `exam:read` | ✔ (atanan) | ✔ | ✔ | ✔ | ✔ | ✔ |
| `exam:write` | | ✔ | ✔ | | | ✔ |
| `exam:publish` | | ✔ | | ✔ | | ✔ |
| `session:start` | ✔ | | | | | |
| `session:terminate` | | ✔ | | ✔ | | ✔ |
| `attempt:read` | ✔ (kendi) | ✔ | ✔ | ✔ | ✔ | ✔ |
| `attempt:grade` | | ✔ | | | | ✔ |
| `attempt:override` | | | | ✔ | | ✔ |
| `rubric:write` | | ✔ | | | | ✔ |
| `analytics:student` | ✔ (kendi) | ✔ | ✔ | ✔ | ✔ | ✔ |
| `analytics:cohort` | | ✔ | ✔ | ✔ | ✔ | ✔ |
| `analytics:item` | | | ✔ | ✔ | | ✔ |
| `audit:read` | | | | | | ✔ |
| `admin:manage` | | | | | | ✔ |

> **Not:** `session:start` yalnızca öğrencide bulunur — platform yöneticisi dâhil hiçbir rol
> sınav oturumu başlatamaz. Bu izin aynı zamanda "öğrenciye özgü menü" filtresi olarak da
> kullanılır (`Öğrenme yolum`, `Gelişimim`).

### Veri kapsamı (data scope)

| Rol | Kapsam | Anlamı |
|-----|--------|--------|
| STUDENT | `own` | Yalnızca kendi kayıtları |
| INSTRUCTOR | `course` | Eğitmeni olduğu derslerin öğrencileri |
| ASSESSMENT_SPECIALIST | `program` | Programdaki tüm sorular/sınavlar, kişisel veri anonim |
| PROGRAM_MANAGER | `program` | Programdaki tüm cohort'lar |
| OBSERVER | `cohort` | Sadece yetkilendirildiği cohort, salt okunur |
| PLATFORM_ADMIN | `global` | Tümü |

**Kural:** Kapsam kontrolü hem repository query'sinde hem mock handler'da uygulanır.
Sadece UI'da filtrelemek yetersizdir.

---

## 7. İş Kuralları (BR)

| ID | Kural | Uygulandığı yer |
|----|-------|-----------------|
| BR-01 | Kazanım önkoşul grafiğinde döngü olamaz | `domain/outcome-graph.rules.ts` → `detectCycle()`; form async validator |
| BR-02 | Yayınlanmış soru/sınav doğrudan değiştirilemez; yeni versiyon üretilir | `domain/versioning.rules.ts`; mock handler 409 döner |
| BR-03 | Eski sınavlar soruyu **snapshot** olarak taşır, yeni versiyondan etkilenmez | `Exam.questions[].questionVersionId` |
| BR-04 | Blueprint hedefleri karşılanmadan sınav yayınlanamaz | `domain/blueprint.rules.ts` → `evaluateCoverage()` |
| BR-05 | Blueprint otomatik seçim aynı soruyu tekrar kullanmaz | `domain/blueprint-solver.ts` (greedy + backtracking) |
| BR-06 | Öğrenci aynı sınav için tek aktif oturum açabilir | mock `session.handlers.ts` → 409 `SESSION_ALREADY_ACTIVE` |
| BR-07 | Süre istemci saatinden değil `serverTimeOffset`'ten hesaplanır | `domain/exam-clock.ts` + `ExamTimerComponent` |
| BR-08 | Geç gelen cevap kabul edilmez | `session.handlers.ts` → 422 `SUBMISSION_WINDOW_CLOSED` |
| BR-09 | Autosave eski versiyonla gelirse ezmez, conflict gösterir | `AnswerDraft.version` + 409 `VERSION_CONFLICT` |
| BR-10 | Bağlantı kesilince cevaplar sıralı outbox kuyruğuna alınır | `core/storage/outbox-queue.ts` |
| BR-11 | Objektif puan, doğru cevap + kısmi puan kuralına göre hesaplanır | `domain/scoring.ts` |
| BR-12 | Rubrik puan değişikliğinde gerekçe zorunlu | `grading.facade.ts` + `GradeChangeDialog` (required reason) |
| BR-13 | Rubrik kriter puanları toplamı = attempt puanı | `domain/rubric.calculator.ts` |
| BR-14 | Ustalık skoru; son cevaplar + zorluk + tekrar sayısından hesaplanır | `domain/mastery.calculator.ts` |
| BR-15 | Adaptif öneri tamamlanmış / kilitli / yayınlanmamış içeriği önermez; bir kazanımdan en çok 2, toplamda 8 öneri döner | `domain/recommendation.engine.ts` → `RECOMMENDATION_CONFIG` |
| BR-16 | Her öneri açıklanabilir gerekçe (`reasons[]`) taşır | `Recommendation.reasons` |
| BR-17 | Cohort raporu min. 5 öğrenci altında bireysel detay göstermez | `domain/privacy.rules.ts` → `MIN_COHORT_SIZE = 5` |
| BR-18 | Yayın / puan değişikliği / oturum sonlandırma / override → `AuditEvent` | `core/observability/audit.service.ts` |
| BR-19 | Ayırt edicilik < 0.2 veya zorluk < 0.2 / > 0.9 olan soru "review" bayrağı alır | `domain/item-analysis.ts` |
| BR-20 | Önkoşulu tamamlanmamış kazanımın **tüm** içerikleri `locked` olur. Önkoşul, ustalık ≥ 60 ile tamamlanmış sayılır; öğrenci kazanımın kendisinde bu eşiği geçmişse kilit uygulanmaz | `domain/learning-rules.ts` → `evaluateUnlock()` |
| BR-21 | Yayın akışı: Draft → Review → Published → Archived (+ arşivden taslağa geri alma). Geçersiz geçiş reddedilir | `domain/publish-workflow.ts`; `crud-handlers.ts` 422 döner |
| BR-22 | Yayındaki/arşivlenmiş kayıt doğrudan düzenlenemez; yalnızca taslak silinebilir | `isEditable()` / `isDeletable()`; sunucu her ikisini de zorlar |
| BR-23 | Bağlı kayıt varken silme engellenir (dersi olan program, kazanımı olan ders, bağımlısı/sorusu olan kazanım) | `assertDeletable` kancaları |
| BR-24 | Yayın için asgari içerik şartı: dersi olmayan program, yayınlanmış kazanımı olmayan ders, önkoşulu yayınlanmamış kazanım yayınlanamaz | `assertPublishable` kancaları |
| BR-25 | Program, ders ve kazanım kodları benzersizdir (büyük/küçük harf duyarsız) | `FieldValidator.unique()` |
| BR-26 | Yayınlama ve arşivleme **zorunlu gerekçe** ister; gerekçe denetim kaydına yazılır | `PublishActions` + `AppConfirmDialog.requireReason` |
| BR-27 | İçerik tek bir kazanıma bağlanır ve kazanım, içeriğin dersine ait olmalıdır | `catalog/content.handlers.ts` → `validate()` |
| BR-28 | İçeriğin yayınlanabilmesi için bağlı kazanımın yayında olması gerekir | `catalog/content.handlers.ts` → `assertPublishable` |
| BR-29 | Öğrenci ilerlemesi bulunan içerik silinemez; arşivlenir | `catalog/content.handlers.ts` → `assertDeletable` |
| BR-30 | Öğrenme yolu ve öneriler **saklanmaz**; istek anında önkoşul + ilerleme + ustalıktan türetilir | `learning/learning-context.ts`, `domain/learning-path.builder.ts` |
| BR-31 | Öğrenci yalnızca kayıtlı olduğu derslerin **yayındaki** içeriğini görür; taslak içerik öğrenciye hiç ulaşmaz | `catalog/content.handlers.ts` → `isContentVisible()` |
| BR-32 | Oyunlaştırma göstergeleri (seri, XP, başarım) gerçek çalışma verisinden hesaplanır; uydurma değer üretilmez | `domain/engagement.ts` → `XP_RULES` |
| BR-33 | İçerik ilerlemesi %100'e ulaştığında `completed` olur; harcanan süre birikimli yazılır | `learning/learning.handlers.ts` → `PUT /api/contents/:id/progress` |
| BR-34 | Sorunun cevap yapısı türüne uygun olmalıdır (seçenek sayısı, doğru sayısı, sıra numaraları). Kural tablosundan türetilir | `domain/question.rules.ts` → `validateAnswerShape()` |
| BR-35 | Soru en az 1, en fazla 5 kazanıma bağlanır ve kazanımlar sorunun dersine ait olmalıdır | `assessment/question.handlers.ts` → `validate()` |
| BR-36 | Soru **yumuşak silinir** (`deletedAt`): kayıt korunur, listelerden düşer, geri alınabilir. Yayındaki soru silinemez | `POST /questions/:id/soft-delete` · `/restore` |
| BR-37 | Zengin metin (soru gövdesi) izin listesine göre temizlenir; script, stil ve olay öznitelikleri veritabanına hiç girmez | `shared/utils/rich-text.util.ts` → `sanitizeRichText()` |
| BR-38 | Favori bilgisi kullanıcıya özeldir (`favoritedBy`); ayrı koleksiyon tutulmaz | `PUT /questions/:id/favorite` |
| BR-39 | Sınavın toplam puanı blueprint'in hedef puanına eşit olmalıdır | `domain/exam-validation.ts` → `total_points` |
| BR-40 | Sınavdaki soru dağılımı blueprint'in kazanım × zorluk hücreleriyle örtüşmelidir | `domain/exam-validation.ts` → `blueprint_match` |
| BR-41 | Blueprint'in soru istediği hiçbir kazanım sınavda boş kalamaz | `domain/exam-validation.ts` → `outcome_coverage` |
| BR-42 | Aynı soru bir sınava iki kez eklenemez; sınav sorunun **yayınlanmış en güncel sürümüne** bağlanır | `domain/exam-validation.ts` → `duplicate_question`, `unpublished_question`, `stale_version` |
| BR-43 | Sınav adı aynı ders içinde benzersiz olmalıdır; süre pozitif ve tarih penceresinden kısa olmalıdır | `domain/exam-validation.ts` → `unique_title`, `duration`, `schedule_window` |
| BR-44 | Sınav en az bir gruba atanmadan ve blueprint'e bağlanmadan yayına alınamaz | `domain/exam-validation.ts` → `cohort_required`, `empty_exam` |
| BR-45 | Yayındaki sınav doğrudan düzenlenemez; değişiklik için taslağa geri alınır ya da klonlanır | `pages/exams/exam-detail.page.ts` · `ExamDetail.isEditable` |
| BR-46 | Sınavın çalışma durumu (planlandı/devam ediyor/kapandı) saklanmaz, tarihlerden türetilir | `domain/exam-runtime.ts` → `examRuntimeStatus()` |

---

## 8. Durum Makineleri

```
Program/Course/LearningOutcome/ContentItem (ortak akış — BR-21):
                DRAFT → REVIEW → PUBLISHED → ARCHIVED
                  ▲       │                      │
                  └───────┘                      │
                  └──────────── restore ─────────┘

Course (eski tanım, yukarıdaki ortak akışla değiştirildi):
                DRAFT → REVIEW → PUBLISHED → ARCHIVED
Question:       DRAFT → REVIEW → PUBLISHED → RETIRED     (PUBLISHED'dan düzenleme → yeni DRAFT versiyon)
Exam:           DRAFT → BLUEPRINT_OK → SCHEDULED → ACTIVE → CLOSED → ARCHIVED
ExamSession:    NOT_STARTED → IN_PROGRESS → PAUSED(disconnected) → SUBMITTED → EXPIRED | TERMINATED
Attempt:        SUBMITTED → AUTO_GRADED → PENDING_MANUAL → GRADED → RELEASED → UNDER_REVIEW
AnswerDraft:    LOCAL → SYNCING → SYNCED → CONFLICT | FAILED

Question (BR-02, BR-21):
                DRAFT → REVIEW → PUBLISHED → ARCHIVED
                  ▲       │                      │
                  └───────┘                      │
                  └──────────── restore ─────────┘
    Yayındaki soru düzenlenemez; "yeni versiyon" akışı soruyu DRAFT'a döndürür
    ve `versionNumber` artar. Eski snapshot korunur (BR-03).

ContentProgress (öğrenci ilerlemesi — BR-20, BR-33):
                not_started → in_progress → completed      (saklanan durumlar)
                locked                                     (türetilir: önkoşul eksik)
                recommended                                (türetilir: sıradaki adım)
```

Geçişler `domain/*.state-machine.ts` içinde `canTransition(from, to)` ile doğrulanır.
Geçersiz geçiş → `BUSINESS_RULE` hatası.

---

Exam / ExamBlueprint (BR-45, BR-46 — ortak akış, ADR-042):

    Draft ──► Review ──► Published ──► Archived
      ▲         │                          │
      └─────────┘                          │
      └────────────── restore ─────────────┘

  · Her geçiş `exam:publish` (blueprint için `blueprint:write`) yetkisi ister.
  · `Draft → Published` DOĞRUDAN yapılamaz; sihirbazın yayın adımı o an geçerli
    olan eylemi sunar ("İncelemeye gönder" veya "Yayınla").
  · `Review → Published` öncesi doğrulama motoru sunucuda bir kez daha çalışır
    (BR-39…BR-44); panel "hazır" dese bile sunucu son sözü söyler.
  · Çalışma durumu (planlandı / devam ediyor / kapandı) bu makinenin PARÇASI
    DEĞİLDİR; `opensAt` / `closesAt` tarihlerinden türetilir (BR-46).


## 9. Test Kuralları

**Zorunlu unit test (şartname gereği):**
- `mastery.calculator.ts`
- `recommendation.engine.ts`
- `blueprint.rules.ts` + `blueprint-solver.ts`
- `scoring.ts` + `rubric.calculator.ts`
- `outcome-graph.rules.ts` (döngü tespiti)
- `exam-clock.ts` (saat kayması senaryosu)
- `privacy.rules.ts`
- `entity-store.ts`, `query-engine.ts`
- `publish-workflow.ts` (durum makinesi, izin verilen geçişler)
- `outcome-graph.rules.ts` (döngü tespiti, katman hesabı, bağımlılıklar)
- `dashboard-context.ts` (KPI/trend/sparkline yardımcıları)
- `chart-adapters.ts` (domain → grafik dönüşümleri)
- `analytics.model.ts` (`computeDelta`)
- Cross-field ve async validator'lar
- Kritik facade'ler: `exam-session.facade.ts` (autosave/conflict), `grading.facade.ts`

**Zorunlu component/integration test (en az 2 akış):**
1. Sınav oturumu: başlat → cevapla → autosave → bağlantı kesilir → yeniden bağlan → conflict → gönder.
2. Değerlendirme: rubrikle puanla → gerekçesiz kaydetmeye çalış (engellenir) → gerekçeyle kaydet → audit kaydı görünür.

Test isimlendirmesi: `it('yayınlanmış soru düzenlenince yeni versiyon üretir')` — Türkçe, davranış odaklı.

---

## 10. Erişilebilirlik (a11y)

- Her interaktif öğe klavye ile erişilebilir (`tabindex`, `Enter`/`Space`).
- Dialog açılınca focus trap; kapanınca focus tetikleyen öğeye döner.
- Tablo: `<th scope="col">`, sıralanabilir başlıkta `aria-sort`.
- Durum yalnızca renkle anlatılmaz — badge'de metin + ikon birlikte bulunur.
- Canlı bölgeler: toast `role="status"`, sınav sayacı son 5 dk `aria-live="assertive"`.
- Kontrast oranı ≥ 4.5:1 (metin), ≥ 3:1 (büyük metin / ikon).
- `prefers-reduced-motion` desteklenir.
- Görsel gizli metin için `.sr-only` yardımcı sınıfı.

---

## 11. Git Konvansiyonu

```
feat(question-bank): soru versiyonlama akışı eklendi
fix(exam-session): sekme pasifken sayaç kayması giderildi
refactor(core): EntityStore composition'a çevrildi
docs(architecture): ADR-013 eklendi
test(domain): mastery calculator sınır durumları
chore(deps): apexcharts 5.10'a yükseltildi
```

Scope = feature veya katman adı. Konu satırı Türkçe, 72 karakteri geçmez.

---

## 12. Definition of Done

Bir görev şunların **tamamı** sağlanmadan "bitti" sayılmaz:

- [ ] `npm run build` (production) uyarısız/hatasız geçiyor.
- [ ] `npm test` yeşil; yeni iş kuralı için test yazıldı.
- [ ] Tarayıcı konsolunda hata/uyarı yok.
- [ ] Loading / empty / error / retry / unauthorized durumları çalışıyor.
- [ ] Yetkisiz rolle denendi: route + buton + veri kapsamı korunuyor.
- [ ] Yıkıcı işlemde confirm dialog (+ gerekiyorsa gerekçe) var.
- [ ] Toast/bildirim geri bildirimi veriliyor.
- [ ] Klavye ile baştan sona kullanılabiliyor.
- [ ] Desktop / tablet / mobil düzen bozulmuyor.
- [ ] Filtre state'i URL'e yansıyor (liste/rapor ekranıysa).
- [ ] Yalnızca `shared/components` kullanıldı; yeni ortak parça `DESIGN_SYSTEM.md`'ye eklendi.
- [ ] Yeni karar alındıysa ilgili doküman güncellendi.
- [ ] `ROADMAP.md` durumu işaretlendi.
- [ ] Kullanılmayan dosya, `console.log`, TODO, yorum satırına alınmış kod kalmadı.
