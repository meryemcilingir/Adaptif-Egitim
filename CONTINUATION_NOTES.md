# Devam Notu — Adaptif Eğitim Platformu

Bu doküman, bir Claude Code oturumunun bıraktığı yerden devam edebilmesi için hazırlandı.

## Proje

Türkçe üniversite staj projesi: "Adaptif Eğitim, Sınav ve Öğrenme Analitiği Platformu".
Angular 21, standalone + zoneless, signals tabanlı. Mock backend (MSW benzeri handler mimarisi,
`src/app/core/api/mock/`). TypeScript strict. Testler Vitest (`ng test` ile — `npx vitest run` DEĞİL).

Feature-based mimari: `features/adaptive-learning`, `features/administration`.
RBAC: `Role`/`Permission`, veritabanı tabanlı rol tanımları. Veri kapsamı (`DataScope`):
`own`/`course`/`cohort`/`program`/`global` — öğrenci `own` kapsamında.
`buildReportScope()` — analitik uçlarında role göre kapsam daraltmanın tek noktası (ADR-057).

## Son tamamlanan iş (bu oturumda, kod uygulandı ve doğrulandı — 470 test yeşil)

Açılır panel/menü konumlandırma sorunu kökten çözüldü:
- **Sorun**: `position: absolute` panelller (filtre menüsü, aksiyon menüsü) tablo `overflow: auto`
  kabı tarafından kırpılıyor VEYA uzun listelerde ekranın altına taşıyordu.
- **Çözüm**: Yeni saf fonksiyon [src/app/shared/utils/panel-position.ts](src/app/shared/utils/panel-position.ts)
  — `placePanel()` — tetikleyici konumuna göre `top`/`left`/`maxHeight`/`flipped` hesaplıyor.
  8 testle doğrulandı ([panel-position.spec.ts](src/app/shared/utils/panel-position.spec.ts)).
- Paneller artık `position: fixed`; `afterNextRender()` ile bir sonraki render geçişinden SONRA
  ölçülüp konumlandırılıyor (`effect`/`queueMicrotask` denenmiş, ikisi de panel render edilmeden
  tetiklendiği için başarısız olmuştu).
- Etkilenen dosyalar: `shared/components/app-filter-bar/*`, `shared/components/app-dropdown/*`.
- z-index sırası düzeltildi: `--z-sticky: 1000`, `--z-dropdown: 1010` ([src/styles/_tokens.scss](src/styles/_tokens.scss)).
- Isı haritası (heatmap) render sorunları da bu civarda çözüldü: `chart-theme.ts` içinde
  `baseYAxis()` artık `categorical` parametresi alıyor (kategorik eksende `Math.round()`
  uygulanmıyor — "NaN" etiket hatası çözüldü); heatmap için `animations: { enabled: false }`
  (0×0 hücre donma sorunu çözüldü).
- ADR-074 [ARCHITECTURE.md](ARCHITECTURE.md)'ye eklendi; [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) §11.3 güncellendi.
- "Sınava devam et" linki `/exam-session/${token}` (404 veriyordu, böyle rota yok) yerine
  `/my-exams`'e çevrildi — gerçek akış bekleme odasından (`/exams/:id/waiting-room`) geçiyor.

Bu iş TAMAMLANDI ve commit edilmemiş olabilir — `git status` ile kontrol et.

## ŞİMDİ ÜZERİNDE ÇALIŞILAN İŞ (henüz kod değişikliği YOK — sadece keşif başladı)

Kullanıcının en son verdiği 6 maddelik istek, **öğrenci paneli** (`/learning/dashboard`) için:

1. **Kart boyut eşitleme**: "Sana özel öneriler" ve "Öğrenme yolun" kartları AYNI yükseklikte,
   aynı hizada başlayıp bitmeli. (NOT: Önceki bir turda tam tersi istenmiş ve
   `:host ::ng-deep section[aria-label='Öğrenme yolu ve öneriler'] { align-items: start; }`
   eklenmişti — bu SCSS kuralı şimdi kaldırılıp/değiştirilip `align-items: stretch` gibi bir
   yaklaşıma geçilmeli. Dosya:
   `src/app/features/adaptive-learning/pages/learning-dashboard/dashboards/student-dashboard.component.scss`)

2. **Sabit gün sırası**: Çalışma serisi (streak) ve haftalık ilerleme kartlarında güncel gün
   HER ZAMAN en sağda kalıyor (kayan pencere). Kullanıcı bunun yerine haftanın günlerinin SABİT
   sırada (muhtemelen Pazartesi'den başlayarak) durmasını istiyor — gün değiştikçe kartlar
   kaymasın.
   - İncelenen dosya: [src/app/features/adaptive-learning/domain/engagement.ts](src/app/features/adaptive-learning/domain/engagement.ts)
   - `buildWeeklyStudy(progress, nowMs)` fonksiyonu: `today - (6 - index)` mantığıyla "bugün en
     sağda" mantığında kayan 7 günlük pencere üretiyor. Bu, tam olarak şikayet edilen davranış.
     Düzeltme: haftanın başlangıcına (Pazartesi, ISO hafta) göre sabit index hesaplanmalı, öyle
     ki gün değişince kart pozisyonları KAYMASIN, sadece "bugün" işareti hafta içinde ilerlesin.
   - `calculateStreak()` fonksiyonu da kontrol edilmeli — henüz okunmadı, aynı kayan mantığı
     kullanıyor olabilir.
   - `streak-card` bileşeni (muhtemelen
     `src/app/features/adaptive-learning/components/...streak-card...`) henüz bulunup okunmadı —
     haftalık görünümü nasıl render ettiğine bakılmalı.

3. **Liste kırpma**: "Son etkinlik" (veya benzeri uzayan bir liste — muhtemelen öğrenme yolu ya
   da bir aktivite akışı) son 5 öğeyle sınırlanmalı, kartlar eşit boyda görünmeli. Hangi bileşen
   olduğu henüz kesin belirlenmedi — `student-dashboard.component.html` içinde aranmalı.

4. **Ustalık ibaresi kaldırma**: Öğrenme yolu kartlarındaki "ustalık %60" gibi metin kaldırılmalı,
   "0/3 adım" gibi adım sayacı KALMALI. Muhtemelen
   `src/app/features/adaptive-learning/components/...` altında öğrenme yolu kartı bileşeninde
   (örn. `learning-path-card` veya benzeri — henüz bulunmadı).

5. **Sınavlar/Denemeler ekranı sadeleştirme**: Öğrencinin gördüğü sınav/deneme listesi ekranı
   (muhtemelen `/my-exams` route'u, `features/adaptive-learning` altında bir sayfa) karmaşık
   görünüyor. "Sonuçlananlar" / "Değerlendirme bekleyenler" gibi durumlara göre ayrılıp
   düzenlenmeli. Henüz ilgili sayfa dosyası bulunup okunmadı.

6. **Analitik gizliliği (ÖNEMLİ — güvenlik/RBAC kuralı)**: Öğrenci, genel bakış/analitik
   ekranlarında SINIF/KOHORT ORTALAMASINI görebilmeli (kendini karşılaştırmak için) ama diğer
   BİREYSEL öğrencilerin verilerini (kim risk altında, kim zorlanıyor, "at-risk" listesi, ustalık
   eğilimi gibi başkalarına ait detaylar) KESİNLİKLE görmemeli.
   - Kontrol edilmesi gereken: "Başarı panosu" (`performers.page` gibi bir sayfa — muhtemelen
     `features/adaptive-learning` veya `features/administration` altında), risk altındaki
     öğrenciler listesi, ve bunların ROUTE GUARD / permission kontrolüyle öğrenci rolüne kapalı
     olup olmadığı.
   - `buildReportScope()` (ADR-057) mock backend tarafında zaten kapsam daraltması yapıyor olabilir
     — ama FRONTEND tarafında ilgili sayfaların/route'ların öğrenci rolüne route guard ile kapalı
     olduğu da doğrulanmalı (permission model: `src/app/core/auth/permission.model.ts`).
   - Bu muhtemelen hem route guard hem de UI bileşeni (öğrenci dashboard'undaki "genel bakış"
     kartı/grafiği) değişikliği gerektirecek.

## Sıradaki adımlar (önerilen sıra)

1. `student-dashboard.component.html` dosyasını baştan sona oku — hangi bölümler hangi
   bileşenlere karşılık geliyor tam olarak gör (öneriler kartı, öğrenme yolu kartı, streak-card,
   weekly-progress, son etkinlik listesi).
2. Madde 1 (kart eşitleme) ve madde 2 (sabit gün sırası) — bunlar net ve dar kapsamlı, önce
   bunları uygula.
3. Madde 3 ve 4'ü aynı geçişte, ilgili bileşenleri bulup uygula.
4. Madde 5 için sınav/deneme listesi sayfasını bul (`grep -r "my-exams"` veya route dosyasına bak:
   `src/app/features/adaptive-learning/adaptive-learning.routes.ts`), mevcut durumunu incele,
   sonuçlanan/bekleyen ayrımı ekle.
5. Madde 6 için önce mevcut route guard'ları ve `performers`/risk sayfalarının route tanımlarını
   incele — öğrenci rolünün bu route'lara erişimi var mı kontrol et
   (`adaptive-learning.routes.ts`, `permission.model.ts`). Varsa kapat; öğrenci dashboard'undaki
   "genel bakış" bölümüne sadece kohort ortalaması + kendi karşılaştırması gösterecek şekilde
   düzenle.
6. Her değişiklikten sonra `ng test` çalıştır, mümkünse dev server açıp `/learning/dashboard`'u
   öğrenci rolüyle tarayıcıda kontrol et.

## Dikkat edilmesi gerekenler

- Kod stilinde yorum yazmama alışkanığı genelde geçerli, ama bu projede WHY açıklayan kısa
  yorumlar (özellikle CSS/timing ile ilgili tuhaflıklar için) önceki turlarda kullanılmış ve
  kabul görmüş — o tarza devam edilebilir.
- Satır sonları `.gitattributes` ile sabitlenmiş (bkz. son commit `04cdff9`) — dosya yazarken
  `\n` newline kullan (Python scriptlerinde `newline='\n'` ile yapıldığı gibi).
- Git durumunu kontrol etmeden büyük silme/reset işlemi yapma; `git status` şu an birçok
  değiştirilmiş dosya gösteriyor (önceki turların ürünü) — bunlar muhtemelen commit edilmemiş
  in-progress çalışma, silinmemeli.
