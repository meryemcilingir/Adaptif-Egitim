# DESIGN_SYSTEM.md

> Tasarım dili, token'lar, tipografi, spacing ve ortak bileşen kataloğu.
> **Hiçbir ekranda "serbest stil" yazılmaz** — her değer buradaki token'dan gelir.
> Yeni bir bileşen/stil kararı alındığında önce burası güncellenir.

---

## 1. Tasarım Dili

Hedef: **Enterprise SaaS yönetim paneli.** Referans çizgi: Linear, Stripe Dashboard,
Vercel Dashboard, Notion, GitHub Projects.

| Yapılacak | Yapılmayacak |
|-----------|--------------|
| Minimal, temiz, profesyonel | "Eğitim sitesi" görünümü |
| Beyaz kart + açık gri arka plan + ince border | Renkli gradient bloklar, kalabalık arayüz |
| Hafif shadow + 1px border | Büyük/dramatik gölge |
| Bol whitespace, 8px grid | Sıkışık, rastgele boşluk |
| Tek accent renk (indigo), gerisi nötr | Çok renkli palet |
| Lucide ikonlar | Emoji, eski tip ikon setleri |
| Sakin mikro-animasyon (150–200ms) | Dikkat dağıtan animasyon |

**Tema:** Light theme (tek tema). Tüm renkler CSS custom property olarak tanımlanır ki
ileride dark theme eklenebilsin.

---

## 2. Renk Token'ları

```scss
// src/styles/_tokens.scss
:root {
  /* --- Yüzeyler --- */
  --color-bg:              #F8FAFC;   /* sayfa arka planı */
  --color-surface:         #FFFFFF;   /* kart */
  --color-surface-subtle:  #F9FAFB;   /* tablo başlığı, hover zemin */
  --color-surface-muted:   #F3F4F6;   /* devre dışı, skeleton */
  --color-overlay:         rgb(15 23 42 / 45%);

  /* --- Kenarlıklar --- */
  --color-border:          #E5E7EB;
  --color-border-strong:   #D1D5DB;
  --color-border-focus:    #4F46E5;

  /* --- Metin --- */
  --color-text:            #111827;   /* primary */
  --color-text-secondary:  #6B7280;
  --color-text-tertiary:   #9CA3AF;
  --color-text-inverse:    #FFFFFF;

  /* --- Marka / Aksiyon --- */
  --color-primary:         #4F46E5;
  --color-primary-hover:   #4338CA;
  --color-primary-active:  #3730A3;
  --color-primary-subtle:  #EEF2FF;   /* soft zemin */
  --color-primary-border:  #C7D2FE;

  /* --- Anlamsal --- */
  --color-success:         #22C55E;
  --color-success-subtle:  #F0FDF4;
  --color-success-border:  #BBF7D0;
  --color-success-text:    #15803D;

  --color-warning:         #F59E0B;
  --color-warning-subtle:  #FFFBEB;
  --color-warning-border:  #FDE68A;
  --color-warning-text:    #B45309;

  --color-danger:          #EF4444;
  --color-danger-subtle:   #FEF2F2;
  --color-danger-border:   #FECACA;
  --color-danger-text:     #B91C1C;

  --color-info:            #0EA5E9;
  --color-info-subtle:     #F0F9FF;
  --color-info-border:     #BAE6FD;
  --color-info-text:       #0369A1;

  --color-neutral-subtle:  #F3F4F6;
  --color-neutral-border:  #E5E7EB;
  --color-neutral-text:    #4B5563;
}
```

### Grafik paleti (ApexCharts)

Kategorik seriler için sıra: indigo → sky → emerald → amber → rose → violet → teal → slate.

```scss
--chart-1: #4F46E5;  --chart-2: #0EA5E9;  --chart-3: #10B981;  --chart-4: #F59E0B;
--chart-5: #F43F5E;  --chart-6: #8B5CF6;  --chart-7: #14B8A6;  --chart-8: #64748B;
```

**Heatmap (ustalık) skalası** — düşükten yükseğe:
`#FEE2E2 → #FED7AA → #FEF08A → #BBF7D0 → #86EFAC → #22C55E`

**Kural:** Durum yalnızca renkle anlatılmaz; badge'de her zaman metin (+ikon) bulunur.

---

## 3. Tipografi

**Font:** `Inter` (fallback: `-apple-system, "Segoe UI", Roboto, sans-serif`).
`font-feature-settings: 'cv11', 'ss01'; font-variant-numeric: tabular-nums;`
(sayısal kolonların hizalı görünmesi için tablolarda `tabular-nums` zorunlu).

| Token | Boyut / Satır | Ağırlık | Kullanım |
|-------|---------------|---------|----------|
| `--fs-display` | 30px / 38px | 700 | Nadir — boş durum başlığı |
| `--fs-h1` | 24px / 32px | 650 | Sayfa başlığı |
| `--fs-h2` | 20px / 28px | 600 | Bölüm başlığı |
| `--fs-h3` | 16px / 24px | 600 | Kart başlığı |
| `--fs-body` | 14px / 20px | 400 | Varsayılan metin |
| `--fs-body-strong` | 14px / 20px | 550 | Vurgulu metin, tablo hücresi |
| `--fs-sm` | 13px / 18px | 400 | Yardımcı metin, tablo içeriği |
| `--fs-xs` | 12px / 16px | 500 | Badge, etiket, meta |
| `--fs-metric` | 28px / 34px | 650 | KPI kart değeri (`tabular-nums`) |
| `--fs-overline` | 11px / 14px | 600 | Kart üst etiketi, `letter-spacing: .04em`, uppercase |

**Kural:** 30px üstü yazı kullanılmaz. Hiyerarşi boyuttan çok **ağırlık ve renk** ile kurulur.

---

## 4. Spacing — 8px Grid

```scss
--space-0: 0;      --space-1: 4px;    --space-2: 8px;    --space-3: 12px;
--space-4: 16px;   --space-5: 20px;   --space-6: 24px;   --space-8: 32px;
--space-10: 40px;  --space-12: 48px;  --space-16: 64px;
```

| Yer | Değer |
|-----|-------|
| Kart iç boşluğu | `--space-5` (20px), yoğun kartlarda `--space-4` |
| Kartlar arası grid boşluğu | `--space-4` (16px) |
| Sayfa içeriği padding | `--space-6` (24px), mobilde `--space-4` |
| Bölümler arası | `--space-8` (32px) |
| Form alanları arası | `--space-4` |
| Etiket ↔ input | `--space-2` |
| Buton içi | `10px 16px` (md) |

---

## 5. Radius, Shadow, Border, Z-index

```scss
--radius-sm: 6px;    --radius-md: 8px;    --radius-lg: 12px;
--radius-xl: 16px;   --radius-full: 999px;

/* Gölge: hafif. Derinlik border ile kurulur. */
--shadow-xs: 0 1px 2px rgb(16 24 40 / 5%);
--shadow-sm: 0 1px 3px rgb(16 24 40 / 8%), 0 1px 2px rgb(16 24 40 / 4%);
--shadow-md: 0 4px 12px rgb(16 24 40 / 8%);
--shadow-lg: 0 12px 32px rgb(16 24 40 / 12%);
--shadow-focus: 0 0 0 3px rgb(79 70 229 / 18%);

--border-width: 1px;

--z-dropdown: 1000; --z-sticky: 1010; --z-drawer: 1020;
--z-overlay: 1030;  --z-dialog: 1040; --z-toast: 1050; --z-tooltip: 1060;
```

**Kart standardı:**
`background: var(--color-surface); border: 1px solid var(--color-border);
border-radius: var(--radius-lg); box-shadow: var(--shadow-xs);`

---

## 6. Hareket

```scss
--duration-fast: 120ms;  --duration-base: 180ms;  --duration-slow: 260ms;
--ease-out: cubic-bezier(.16, 1, .3, 1);
--ease-in-out: cubic-bezier(.4, 0, .2, 1);
```

Animasyon yalnızca: hover, focus, dialog giriş/çıkış, toast, skeleton shimmer,
başarılı kayıt onayı (checkmark draw). `prefers-reduced-motion: reduce` altında hepsi kapanır.

---

## 7. Layout

```
┌──────────────────────────────────────────────────────────┐
│ HEADER (h: 60px, sticky, border-bottom)                  │
│ breadcrumb · global search · rol seçici · bildirim · avatar│
├───────────┬──────────────────────────────────────────────┤
│ SIDEBAR   │ CONTENT AREA                                 │
│ w: 248px  │ max-width: 1440px, padding: 24px             │
│ collapsed │ page-header (başlık + açıklama + aksiyonlar) │
│ w: 64px   │ page-content                                 │
│           │                                              │
└───────────┴──────────────────────────────────────────────┘
```

* Sidebar: `--color-surface`, sağda 1px border, gruplu menü (`Öğrenme`, `Ölçme`, `Analitik`, `Sistem`).
* Aktif menü: `--color-primary-subtle` zemin + sol 2px indigo indicator + `--color-primary` metin.
* Menü öğeleri izin matrisine göre filtrelenir (yetkisiz link **hiç render edilmez**).
* Sınav oturumu (`/exam-session/:token`) shell dışında **tam ekran focus layout** kullanır.

### Breakpoint'ler

```scss
--bp-sm: 640px;   --bp-md: 768px;   --bp-lg: 1024px;
--bp-xl: 1280px;  --bp-2xl: 1536px;
```

| Genişlik | Davranış |
|----------|----------|
| ≥ 1280px | Sidebar açık, 4 kolon KPI grid |
| 1024–1279px | Sidebar collapsed (ikon), 3 kolon |
| 768–1023px | Sidebar drawer (overlay), 2 kolon, tablo yatay kaydırma |
| < 768px | Drawer + tek kolon; tablolar **kart listesine** dönüşür (`AppTable` mobil modu) |

---

## 8. Component Kataloğu

> Konum: `src/app/shared/components/<isim>/`
> Hepsi standalone, `OnPush`, signal `input()`/`output()` kullanır.

### 8.1 Temel

| Bileşen | Selector | Önemli input'lar |
|---------|----------|------------------|
| **AppCard** | `app-card` | `title`, `description`, `padding`, `variant`, slot: `[actions]`, `[footer]` |
| **AppButton** | `app-button` | `variant` (`primary`\|`secondary`\|`ghost`\|`danger`\|`link`), `size` (`sm`\|`md`\|`lg`), `icon`, `iconPosition`, `loading`, `disabled`, `fullWidth` |
| **AppIcon** | `app-icon` | `name` (Lucide), `size`, `strokeWidth` |
| **AppStatusBadge** | `app-status-badge` | `tone` (`neutral`\|`info`\|`success`\|`warning`\|`danger`\|`primary`), `label`, `icon`, `dot` |
| **AppAvatar** | `app-avatar` | `name`, `src`, `size` — baş harflerden deterministik renk |
| **AppTooltip** | `[appTooltip]` (direktif) | `appTooltip`, `tooltipPlacement` |
| **AppProgressBar** | `app-progress-bar` | `value`, `max`, `tone`, `showLabel` |
| **AppTabs** | `app-tabs` | `tabs`, `activeId`, `(tabChange)` |
| **AppBreadcrumb** | `app-breadcrumb` | `items` — route `data.breadcrumb`'dan otomatik |

### 8.2 Veri gösterimi

| Bileşen | Açıklama |
|---------|----------|
| **AppStatCard** | Başlık + büyük değer + trend (`+%12` yeşil ▲) + küçük ikon. KPI satırının temel taşı. |
| **AppMetricCard** | StatCard + **sparkline** (ApexCharts area, 40px). Ayrıca alt bilgi satırı. |
| **AppChartCard** | Kart + başlık + aksiyon + ApexCharts sarmalayıcı. `type` (`line`\|`area`\|`bar`\|`donut`\|`radialBar`\|`heatmap`\|`rangeBar`), `series`, `categories`. Tema renkleri otomatik uygulanır. `@defer` ile lazy render. |
| **AppTable** | Generic `AppTable<T>`. Sticky header, sort, pagination, satır seçimi, hover, kolon şablonu (`ColumnDef.cell`), responsive kart modu, `loading`/`empty`/`error` durumları, virtual scroll opsiyonu. |
| **AppPagination** | Sayfa boyutu seçici + sayfa numaraları + toplam kayıt bilgisi. |
| **AppFilterBar** | Arama input (debounce 300ms) + çoklu filtre chip'leri + "Filtreleri temizle" + aktif filtre sayacı. URL query param ile senkron. |
| **AppTimeline** | Dikey zaman çizelgesi: ikon, başlık, açıklama, zaman, aktör. Audit ve attempt geçmişinde kullanılır. |
| **AppKeyValue** | Detay panellerinde etiket/değer listesi. |
| **AppSparkline** | Salt sparkline (tablo hücresi içinde). |

### 8.3 Durum bileşenleri

| Bileşen | Kullanım |
|---------|----------|
| **AppLoadingState** | Spinner veya skeleton. `variant` (`spinner`\|`skeleton-table`\|`skeleton-card`\|`skeleton-chart`), `rows`. |
| **AppEmptyState** | İkon + başlık + açıklama + birincil aksiyon. Filtreden kaynaklıysa "Filtreleri temizle" gösterir. |
| **AppErrorState** | Hata ikonu + `ApiError.message` + `Tekrar dene` + korelasyon kimliği (küçük punto). |
| **AppUnauthorizedState** | Kilit ikonu + "Bu içeriği görüntüleme yetkiniz yok" + gerekli izin adı + "Panele dön". |
| **AppSkeleton** | Tek başına shimmer bloğu (`width`, `height`, `radius`). |

### 8.4 Etkileşim

| Bileşen | Açıklama |
|---------|----------|
| **AppDialog** | Overlay + focus trap + ESC + `size` (`sm`\|`md`\|`lg`\|`xl`). Slot: başlık/gövde/footer. |
| **AppConfirmDialog** | `title`, `message`, `tone`, `confirmLabel`, **`requireReason`** (zorunlu gerekçe alanı — BR-12). `DialogService.confirm()` promise döner. |
| **AppDrawer** | Sağdan açılan panel (detay/hızlı düzenleme). |
| **AppToast** | `ToastStore` kuyruğu; `success`\|`error`\|`warning`\|`info`, aksiyon butonu (`Geri al`), otomatik kapanma. `role="status"`. |
| **AppDropdown** | Menü/aksiyon listesi, klavye navigasyonu. |

### 8.5 Form

| Bileşen | Açıklama |
|---------|----------|
| **AppFormField** | Etiket + yardımcı açıklama + zorunlu işareti + hata mesajı + karakter sayacı. Tüm input'ları sarar. Kontrolün `valueChanges`/`statusChanges` akışına abone olur — sayaç ve hata mesajı canlı güncellenir (ADR-027). |
| **AppInput** | Tek satır metin girişi (`ControlValueAccessor`). |
| **AppTextarea** | Çok satırlı metin; `maxLength` ile tarayıcı seviyesinde sert sınır. |
| **AppSelect** | Tek seçimli açılır liste. |
| **AppNumberInput** | Sayısal giriş; boş alan `NaN` değil `null` yayınlar, `min`/`max`/`suffix` destekler. |
| **AppTagInput** | Etiket girişi; adet ve uzunluk sınırını bileşen içinde uygular, öneri listesi sunar. |
| **AppMultiSelect** | Aranabilir çoklu seçim; seçilemeyen seçenekleri gizlemez, **nedeniyle** devre dışı gösterir (önkoşul döngüsü). |

> Karakter sınırı olan her alanda `AppFormField.maxLength` verilir; sayaç sınıra
> yaklaştığında uyarı rengine döner.

### 8.6 Dashboard yapı taşları (`features/.../components/dashboard/`)

Altı rol paneli de bu bileşen kümesini paylaşır; yalnızca beslenen veri değişir.
Bu sayede yeni bir rol paneli eklemek yeni bir görsel dil doğurmaz.

| Bileşen | Girdi | Açıklama |
|---------|-------|----------|
| **KpiGrid** | `KpiCard[]` | 4'lü KPI satırı; `AppMetricCard` kullanır (sparkline'lı) |
| **QuickActions** | `QuickAction[]` | Rolün en sık yaptığı işler; rozet bekleyen iş sayısını gösterir |
| **ProgressGroup** | `ProgressCard[]` | 3'lü ilerleme kartı satırı |
| **NotificationList** | `Notification[]` | Okunmamışlar vurgulu; tıklayınca ilgili ekrana gider |
| **UpcomingExams** | `UpcomingExamCard[]` | Tarih, süre, soru sayısı, durum rozeti; opsiyonel cohort satırı |
| **RecentContent** | `RecentContentEntry[]` | Son açılan içerikler + ilerleme çubuğu |
| **RankedList** | `RankedEntry[]` | Sıralı liste + göreli bar (zayıf kazanım, riskli öğrenci, yavaş madde…) |
| **GradingQueue** | `GradingQueueEntry[]` | Bekleme süresi arttıkça uyarı tonu yükselir |
| **StatisticsList** | `StatisticEntry[]` | Etiket · değer · açıklama üçlüsü |
| **OutcomeHighlightList** | `OutcomeHighlight[]` | Zayıf/güçlü kazanım + kısa yönlendirme; hedef içerik varsa tıklanabilir |
| **DashboardCommon** | activity + notifications + statistics | Tüm rollerde ortak alt bölüm (3 kolon) |

### 8.6.1 Oyunlaştırma yapı taşları (`components/gamification/`)

Motivasyon göstergeleri **abartısız** tutulur: konfeti, animasyonlu rozet ve ses yoktur.
Gösterilen her sayı gerçek çalışma verisinden hesaplanır (`domain/engagement.ts`).

| Bileşen | Girdi | Açıklama |
|---------|-------|----------|
| **ContinueLearningCard** | `ContinueLearningCard` | Kaldığı içerik + ilerleme + tek büyük "devam et" butonu |
| **DailyGoalCard** | `DailyGoal` | Hedef dakika, tamamlanan görev sayısı ve görev listesi |
| **StreakCard** | `StreakCard` | Gün sayısı + son 7 günün çubukları; seri riskteyse uyarı satırı |
| **XpProgress** | `ExperienceCard` | Seviye, toplam XP ve seviye içi ilerleme çubuğu |
| **AchievementGrid** | `AchievementCard[]` | Kilitli başarımlar da gösterilir; kilitliyken ilerleme yüzdesi |

### 8.6.2 Öğrenme yolu (`components/learning-path/`)

| Bileşen | Girdi | Açıklama |
|---------|-------|----------|
| **LearningPathTimeline** | `LearningPath` | Kazanım bloklarına ayrılmış stepper. Her adımda durum rozeti ve **gerekçe satırı** bulunur; kilitli adım tıklanamaz ve eksik kazanım yazılır (BR-20). `compact` girdisi ile panelde öğrencinin bulunduğu bölümden başlayarak iki bölüm gösterilir |

**Adım durumu ↔ renk:** `completed` → success · `in_progress` → primary ·
`recommended` → info · `locked` → warning · `not_started` → nötr.

### 8.6.3 Soru bankası bileşenleri (`components/question/`)

| Bileşen | Girdi | Açıklama |
|---------|-------|----------|
| **QuestionBadges** | `Question` | Tür · zorluk · durum · Bloom · kazanım · versiyon rozetleri. Dar alanda `showDetails=false` ile kısaltılır |
| **QuestionPreview** | `Question` | Öğrencinin göreceği hâle yakın gösterim. Hangi cevap bloğunun çizileceği `answerShape`'ten gelir; `showAnswers` ile cevap anahtarı gizlenir |
| **QuestionPreviewDialog** | `Question` | Önizlemeyi diyalog kabuğuna sarar; listede hızlı bakış için |
| **VersionHistory** | `QuestionVersion[]` | Sıralı geçmiş; en fazla iki versiyon seçilip karşılaştırılır |
| **VersionCompare** | `VersionComparison` | Yalnızca DEĞİŞEN alanlar; eski kırmızı, yeni yeşil bloklarda |

**Rozet dili.** Tür rozeti kısaltmadır (ÇS, ÇOK, D/Y, SAY, KC, AU, EŞL, SIR) ve birincil
tonda; zorluk rozeti anlam rengi taşır (kolay → success, orta → warning, zor → danger);
versiyon rozeti `v3` biçiminde ve tabular rakamlıdır.

### 8.6.4 Sınav oluşturma bileşenleri (`components/exam/`)

| Bileşen | Girdi | Açıklama |
|---------|-------|----------|
| **WizardSteps** | `current`, `availability` | 7 adımlı yatay ilerleme çubuğu. Erişilemeyen adım tıklanamaz ve gerekçesi başlıkta yazar |
| **BlueprintEditor** | `rows`, `outcomes`, hedefler | Kazanım × zorluk tablosu + canlı özet şeridi. `readonlyMode` ile salt okunur (yayındaki plan) |
| **ConstraintPanel** | `ConstraintSnapshot` | Yapışkan yan panel: soru, puan, süre, kapsama, yinelenen, zorluk dağılımı, doğrulama listesi. İhlale tıklanınca ilgili adıma götürür |
| **QuestionPicker** | `selected`, `pool` | Solda sınavın soruları (sıralanabilir), sağda aday havuz. Ekleme/çıkarma/taşıma olayları yayar |
| **ExamPreview** | başlık, yönerge, sorular | Öğrencinin göreceği hâle yakın gösterim; sayaç örnektir, gerçek oturum Sprint 7'de |

**Kısıt paneli dili.** Her satır `mevcut / hedef` biçimindedir ve tabular rakam kullanır.
Hedefi tutturan satır nötr, tutturmayan uyarı tonundadır — kırmızı yalnızca yayına engel
olan ihlaller için ayrılmıştır. Panel hem sihirbazda hem sınav detayında AYNI bileşendir;
ikisi de `validateExam()` çıktısını okur, ayrı bir gösterim mantığı yoktur.

### 8.7 Domain bileşenleri (`features/.../components/`)

| Bileşen | Durum | Açıklama |
|---------|-------|----------|
| **RecommendationReasonCard** | hazır | Öneri gerekçelerini kanıtlarıyla gösterir (BR-16) |
| **PublishActions** | hazır | Durum makinesinden türetilen yayın butonları; gerekçeli onay (BR-21, BR-26) |
| **OutcomeGraph** | hazır | Katmanlı SVG önkoşul grafiği; odak modu ve döngü vurgusu. Yerleşim hesabı ayrı saf modülde (`graph-layout.ts`) |
| **PrerequisiteEditor** | hazır | Önkoşul ekleme/kaldırma/görüntüleme + bağımlı kazanım listesi |
| **AppRichText** (shared) | hazır | Dış kütüphanesiz zengin metin editörü; `contenteditable` + izin listesi temizleyici. Yapıştırmada biçim taşınmaz |
| BlueprintConstraintPanel, ExamTimer, AutosaveIndicator, RubricGrader, MasteryHeatmap | sonraki fazlar | — |

Bunlar da yalnızca yukarıdaki ortak bileşenlerden inşa edilir.

---

## 9. Dashboard Kompozisyonu

`/learning/dashboard` ürünün vitrinidir. Sıralama:

1. **Sayfa başlığı** + dönem seçici + "Rapor indir".
2. **KPI satırı** — 4 × `AppMetricCard` (sparkline'lı):
   Ortalama ustalık · Tamamlanan içerik · Aktif sınav oturumu · Bekleyen değerlendirme.
3. **İlerleme kartları** — 3 × `AppCard` + `AppProgressBar` / radial: haftalık hedef, kazanım kapsama, çalışma süresi.
4. **Grafik satırı** — `AppChartCard`: solda "Ustalık trendi" (area, 2/3 genişlik),
   sağda "Kazanım dağılımı" (donut, 1/3).
5. **MasteryHeatmap** — kazanım × hafta ısı haritası (tam genişlik).
6. **İki kolon:** solda `RecommendationReasonCard` listesi ("Neden önerildi" açıklamalı),
   sağda `Upcoming Exams` listesi (tarih, süre, durum badge).
7. **İki kolon:** solda `AppTimeline` (Recent Activity), sağda "Soru kalite göstergeleri"
   (`AppChartCard` bar) veya rol bazlı istatistik kartları.

**Rol farkı:** Aynı iskelet, farklı içerik. Öğrenci → kişisel ustalık/öneri;
Eğitmen → değerlendirme kuyruğu/sınıf ilerlemesi; Ölçme Uzmanı → madde kalitesi;
Program Yöneticisi → cohort karşılaştırma. Kart seçimi `dashboard.config.ts`'te rol bazlı tanımlıdır.

### 9.1 Öğrenci paneli sıralaması

Öğrenci paneli istatistik panosu değil, **çalışma ekranıdır**. Bu yüzden sıralama
"şimdi ne yapmalıyım → nerede duruyorum → geçmiş ve motivasyon" mantığını izler:

| # | Blok | Amaç |
|---|------|------|
| 1 | **Hero** — selamlama, ders ilerlemesi, tek büyük "Öğrenmeye devam et" | Girişte tek net eylem |
| 2 | KPI satırı (ustalık · sınav başarısı · tamamlanan içerik · haftalık çalışma) | Durum özeti |
| 3 | Kaldığın yerden devam · Bugünün hedefi · Seri + XP | Bugünün işi |
| 4 | Hızlı işlemler | Kısayollar |
| 5 | Öğrenme yolu (kompakt stepper) + Sana özel öneriler | Sıradaki adımlar ve gerekçeleri |
| 6 | Haftalık ilerleme grafiği + hafta özeti | Ritim |
| 7 | Ustalık trendi · kazanım dağılımı · ısı haritası | Derin analiz |
| 8 | Zayıf / güçlü kazanımlar (yönlendirmeli) | Nereye odaklanmalı |
| 9 | Yaklaşan sınavlar + son kullanılan içerikler | Takvim ve geçmiş |
| 10 | Başarımlar + ortak alt bölüm (etkinlik, bildirim, istatistik) | Motivasyon |

Hiç çalışma verisi yoksa (`isNewLearner`) hero'nun altında yönlendirici bir boş durum çıkar.

---

## 10. Tablo Standardı

Her tablo ekranı **istisnasız** şunları içerir:

- Sticky header (`position: sticky; top: 0; z-index: var(--z-sticky)`), `--color-surface-subtle` zemin.
- Sıralanabilir kolon (`aria-sort`, hover'da ok ikonu).
- `AppFilterBar`: arama + çoklu filtre + temizle.
- Pagination (varsayılan 25; 10/25/50/100 seçenekleri).
- Durum kolonunda `AppStatusBadge`.
- Satır hover: `--color-surface-subtle`; tıklanabilir satırda `cursor: pointer`.
- Satır aksiyonları sağda `AppDropdown` (üç nokta) içinde.
- `loading` → skeleton satırlar (yerleşim zıplamaz), `empty` → `AppEmptyState`, `error` → `AppErrorState`.
- Filtre/sayfa/sıralama **URL query param**'da.
- < 768px'te satırlar kart listesine dönüşür.

### 10.1 Kart (grid) görünümü

İçerik gibi görsel ağırlıklı listelerde tablo yanında bir kart görünümü sunulur.
İki görünüm **aynı** veri kaynağını, filtreleri ve sayfalamayı kullanır; görünüm
yalnızca sunum tercihidir ve facade'de bir signal olarak tutulur.

- Görünüm anahtarı sayfa başlığının sağında segment butonu (`Kart` / `Liste`),
  mobilde yalnızca ikon.
- Kart yapısı: 16/9 kapak (yoksa tür ikonlu placeholder) · durum rozeti + süre ·
  başlık (2 satır kırpma) · açıklama (2 satır) · ders/kazanım/zorluk üçlüsü ·
  etiketler · altbilgide `Önizle` + `Detay` + aksiyon menüsü.
- Seçim kutusu kapağın sol üstünde; seçili kart primary kenarlıkla işaretlenir.
- `grid-template-columns: repeat(auto-fill, minmax(268px, 1fr))` — ayrı breakpoint gerekmez.

### 10.2 Kolon görünürlüğü

Kolon sayısı altıyı geçen listelerde başlık satırının sağında bir "Kolonlar" menüsü bulunur.
Görünürlük **kullanıcı tercihidir**: sorguyu etkilemez, yalnızca `columns` dizisini filtreler.
Zorunlu kolonlar (seçim, ad, aksiyon) menüde yer almaz.

### 10.3 Toplu işlem (bulk actions)

- Seçim varken listenin üstünde primary tonlu bir **toplu işlem çubuğu** belirir:
  "N kayıt seçildi" + işlem menüsü + "Seçimi temizle".
- Yıkıcı olmayan işlemler de onay diyaloğu ister (kaç kaydı etkileyeceği yazılır).
- Kısmi başarı normaldir: sunucu başarılı/başarısız listesini gerekçesiyle döner,
  arayüz başarısızları uyarı toast'ında **sebebiyle** gösterir — sessizce yutmaz.

### 10.4 Satır tıklaması

Satır tıklanabilir olduğunda hücre içindeki etkileşimli öğeler (aksiyon menüsü, seçim
kutusu, favori düğmesi, bağlantı) navigasyonu **tetiklemez**. Kural `AppTable` içinde
tek yerde uygulanır; ekranlar ayrıca `stopPropagation` yazmaz.

---

## 11. Grafik Standardı

```ts
// Tüm grafiklerde ortak taban (shared/components/app-chart-card/chart-theme.ts)
{
  chart:   { fontFamily: 'Inter, sans-serif', toolbar: { show: false }, animations: { speed: 300 } },
  grid:    { borderColor: '#E5E7EB', strokeDashArray: 4, padding: { left: 8, right: 8 } },
  stroke:  { curve: 'smooth', width: 2 },
  dataLabels: { enabled: false },
  legend:  { position: 'bottom', horizontalAlign: 'left', markers: { radius: 4 } },
  tooltip: { theme: 'light', style: { fontSize: '12px' } },
  xaxis:   { axisBorder: { show: false }, axisTicks: { show: false } },
}
```

Kullanılan tipler: **line, area, bar, donut, radialBar, heatmap, rangeBar (timeline),
scatter, sparkline**.

Kurallar:
- Grafik her zaman `AppChartCard` içinde; ham `<apx-chart>` sayfaya konmaz.
- Ekranlar ApexCharts veri biçimini bilmez: dönüşüm `shared/utils/chart-adapters.ts`'te yapılır.
- Veri yokken grafik yerine `AppEmptyState`, hata varsa `AppErrorState` (+ retry).
- Yüklenirken `skeleton-chart`.
- Grafik motoru `@defer (on immediate)` ile ilk boyamadan sonra yüklenir; ApexCharts
  kendi lazy chunk'ında kalır (ADR-019).
- Renkler `--chart-*` token'larından; grafikte doğrudan hex yazılmaz.

---

## 12. Durum ↔ Renk Eşlemesi

| Durum | Tone | Etiket |
|-------|------|--------|
| `DRAFT` | neutral | Taslak |
| `REVIEW` | warning | İncelemede |
| `PUBLISHED` | success | Yayında |
| `SCHEDULED` | info | Planlandı |
| `ACTIVE` / `IN_PROGRESS` | primary | Devam ediyor |
| `CLOSED` / `SUBMITTED` | neutral | Tamamlandı |
| `EXPIRED` | danger | Süresi doldu |
| `TERMINATED` | danger | Sonlandırıldı |
| `ARCHIVED` / `RETIRED` | neutral | Arşiv |
| `PENDING_MANUAL` | warning | Değerlendirme bekliyor |
| `GRADED` | success | Puanlandı |
| `CONFLICT` | danger | Çakışma |
| `SYNCED` | success | Kaydedildi |
| `SYNCING` | info | Kaydediliyor |
| `LOCKED` | neutral | Kilitli |

Bu eşleme `shared/utils/status-tone.ts` içinde **tek yerde** tanımlıdır.

---

## 13. Yeni Bileşen Ekleme Kuralı

1. Aynı işi yapan bir bileşen var mı? Varsa **input ekleyerek** genişlet.
2. Domain bilgisi taşıyor mu? Evet → `features/.../components/`, hayır → `shared/components/`.
3. Token dışında sabit değer (hex, px) yazma.
4. `OnPush` + signal `input()`/`output()` + `host` içinde class binding.
5. Klavye ve `aria` davranışını tanımla.
6. Bu dosyadaki **§8 kataloğuna** satır ekle.
