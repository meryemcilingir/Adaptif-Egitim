import { Permission, Role } from '../core/auth/permission.model';
import { AppIconName } from '../shared/icons/app-icons';

/**
 * Sidebar menüsü.
 *
 * Yetkisiz bağlantı gizlenmez — HİÇ render edilmez. Her rolün menüsü AYRI
 * tanımlanır (ADR-075): aynı izne sahip iki rol (ör. `analytics:cohort`)
 * günlük işine göre tamamen farklı ekran kümesi görebilir — permission-only
 * filtreleme bunu ifade edemez. `permissions` alanı yine de KORUNUR: sidebar
 * hem "bu rol bu öğeyi görsün" hem "gerçekten bu izne sahip mi" kontrolü
 * yapar (üç seviyeli koruma — ARCHITECTURE.md §5.1), route guard'ları AYNI
 * izinleri kullanır.
 *
 * `:me` yer tutucusu, oturum açmış kullanıcının kimliğiyle değiştirilir; böylece
 * "kendi analitiğim" gibi kişisel bağlantılar da veriye dayalı tanımlanabilir.
 */
export interface NavItem {
  readonly label: string;
  readonly link: string;
  readonly icon: AppIconName;
  /** Bu izinlerden en az birine sahip olmayan kullanıcı bağlantıyı görmez. */
  readonly permissions: readonly Permission[];
  /** Alt yolları da aktif saysın mı (ör. /courses/:id) */
  readonly exact?: boolean;
}

export interface NavGroup {
  readonly title: string;
  readonly items: readonly NavItem[];
}

const PANEL: NavItem = {
  label: 'Panel',
  link: '/learning/dashboard',
  icon: 'layout-dashboard',
  permissions: ['analytics:student'],
  exact: true,
};

export const NAV_GROUPS_BY_ROLE: Readonly<Record<Role, readonly NavGroup[]>> = {
  /*
   * Öğrenci: kendi dersleri, çalışma planı, sınavları, ilerlemesi. Program/
   * Kazanım yönetimi ekranları izin olarak var olsa bile menüde gösterilmez —
   * öğrencinin günlük işi bunlar değildir.
   */
  STUDENT: [
    {
      title: 'Öğrenmem',
      items: [
        PANEL,
        { label: 'Derslerim', link: '/courses', icon: 'library', permissions: ['course:read'] },
        {
          label: 'Öğrenme yolum',
          link: '/learning/path',
          icon: 'list-checks',
          permissions: ['session:start'],
        },
        {
          label: 'İçerikler',
          link: '/contents',
          icon: 'circle-play',
          permissions: ['content:read'],
          exact: true,
        },
      ],
    },
    {
      title: 'Sınavlar',
      items: [
        {
          label: 'Sınavlarım',
          link: '/my-exams',
          icon: 'file-check',
          permissions: ['session:start'],
        },
        {
          label: 'Sonuçlarım',
          link: '/exam-results',
          icon: 'clipboard-list',
          permissions: ['session:start'],
        },
      ],
    },
    {
      title: 'İlerlemem',
      items: [
        {
          label: 'Genel bakış',
          link: '/analytics',
          icon: 'chart-column',
          permissions: ['analytics:student'],
          exact: true,
        },
        {
          label: 'Gelişimim',
          link: '/student/:me/analytics',
          icon: 'chart-line',
          permissions: ['session:start'],
        },
      ],
    },
  ],

  /*
   * Eğitmen: yalnızca kendi dersleri (veri kapsamı `course` — mock-auth.ts).
   * Soru bankası, blueprint ve sınav oluşturma Ölçme Uzmanının işidir; burada
   * hiç görünmez.
   */
  INSTRUCTOR: [
    {
      title: 'Derslerim',
      items: [
        PANEL,
        { label: 'Derslerim', link: '/courses', icon: 'library', permissions: ['course:read'] },
        {
          label: 'İçerikler',
          link: '/contents',
          icon: 'circle-play',
          permissions: ['content:read'],
          exact: true,
        },
      ],
    },
    {
      title: 'Sınavlar ve Değerlendirme',
      items: [
        {
          label: 'Sorularım',
          link: '/question-bank',
          icon: 'circle-help',
          permissions: ['question:read'],
        },
        { label: 'Sınavlar', link: '/exams', icon: 'file-check', permissions: ['exam:read'] },
        {
          label: 'Değerlendirme',
          link: '/grading',
          icon: 'clipboard-list',
          permissions: ['attempt:grade'],
        },
        {
          label: 'Denemeler',
          link: '/attempts',
          icon: 'history',
          permissions: ['attempt:read'],
        },
      ],
    },
    {
      title: 'Analitik',
      items: [
        {
          label: 'Ders Analitiği',
          link: '/analytics',
          icon: 'chart-column',
          permissions: ['analytics:student'],
          exact: true,
        },
      ],
    },
  ],

  /*
   * Ölçme Uzmanı: soru bankası → blueprint → sınav oluşturucu hattının tek
   * sahibi. Program/Ders/Kazanım burada AYRI menü değildir — bu bilgiler
   * yalnızca blueprint ve sınav oluşturucu içinde referans olarak kullanılır.
   */
  ASSESSMENT_SPECIALIST: [
    { title: 'Panel', items: [PANEL] },
    {
      title: 'Ölçme',
      items: [
        {
          label: 'Soru bankası',
          link: '/question-bank',
          icon: 'circle-help',
          permissions: ['question:read'],
        },
        {
          label: 'Ölçme planları',
          link: '/blueprints',
          icon: 'file-text',
          permissions: ['blueprint:read'],
        },
        { label: 'Sınavlar', link: '/exams', icon: 'file-check', permissions: ['exam:read'] },
      ],
    },
    {
      title: 'Analitik',
      items: [
        {
          label: 'Genel bakış',
          link: '/analytics',
          icon: 'chart-column',
          permissions: ['analytics:student'],
          exact: true,
        },
        {
          label: 'Kazanım analitiği',
          link: '/analytics/outcomes',
          icon: 'target',
          permissions: ['analytics:cohort'],
        },
        {
          label: 'Madde analizi',
          link: '/item-analysis',
          icon: 'microscope',
          permissions: ['analytics:item'],
        },
        {
          label: 'Soru zorluk analizi',
          link: '/analytics/difficulty',
          icon: 'flask-conical',
          permissions: ['analytics:item'],
        },
        {
          label: 'Kazanım Isı Haritası',
          link: '/analytics/mastery',
          icon: 'grid-2x2',
          permissions: ['analytics:cohort'],
        },
        {
          label: 'Kayıtlı raporlar',
          link: '/analytics/reports',
          icon: 'file-text',
          permissions: ['analytics:student'],
        },
      ],
    },
  ],

  /*
   * Program Yöneticisi: program/ders/kazanım kataloğunun akademik sahibi.
   * Soru bankası, blueprint ve madde analizi Ölçme Uzmanının işidir.
   */
  PROGRAM_MANAGER: [
    { title: 'Panel', items: [PANEL] },
    {
      title: 'Program Yönetimi',
      items: [
        {
          label: 'Programlar',
          link: '/programs',
          icon: 'graduation-cap',
          permissions: ['course:read'],
        },
        { label: 'Dersler', link: '/courses', icon: 'library', permissions: ['course:read'] },
        {
          label: 'Kazanımlar',
          link: '/outcomes',
          icon: 'target',
          permissions: ['outcome:read'],
          exact: true,
        },
        {
          label: 'Kazanım haritası',
          link: '/outcomes/map',
          icon: 'workflow',
          permissions: ['outcome:read'],
        },
        {
          label: "Cohort'lar",
          link: '/cohort-analytics',
          icon: 'users',
          permissions: ['analytics:cohort'],
        },
        {
          // Ayrı bir takvim ekranı yok; akademik dönemler salt-okunur burada gösterilir.
          label: 'Akademik takvim',
          link: '/admin/terms',
          icon: 'calendar',
          permissions: ['term:read'],
        },
        {
          /*
           * Hakemlik: iki değerlendiricinin anlaşamadığı cevaplarda nihai puan
           * kararı. Puanlama kuyruğu (`/grading`) BİLEREK yok — program
           * yöneticisi puanlamaz, yalnızca anlaşmazlığı çözer.
           */
          label: 'Çakışmalar',
          link: '/grading/conflicts',
          icon: 'triangle-alert',
          permissions: ['attempt:override'],
        },
      ],
    },
    {
      title: 'Analitik',
      items: [
        {
          label: 'Program analitiği',
          link: '/analytics',
          icon: 'chart-column',
          permissions: ['analytics:student'],
          exact: true,
        },
        {
          label: 'Trend analizi',
          link: '/analytics/trends',
          icon: 'chart-line',
          permissions: ['analytics:cohort'],
        },
        {
          label: 'Kazanım analitiği',
          link: '/analytics/outcomes',
          icon: 'target',
          permissions: ['analytics:cohort'],
        },
        {
          label: 'Kazanım Isı Haritası',
          link: '/analytics/mastery',
          icon: 'grid-2x2',
          permissions: ['analytics:cohort'],
        },
        {
          label: 'Başarı panosu',
          link: '/analytics/performers',
          icon: 'trophy',
          permissions: ['analytics:cohort'],
        },
        {
          label: 'Öğrenme hızı',
          link: '/analytics/velocity',
          icon: 'gauge',
          permissions: ['analytics:cohort'],
        },
        {
          label: 'Öneri motoru',
          link: '/analytics/recommendations',
          icon: 'sparkles',
          permissions: ['analytics:cohort'],
        },
        {
          label: 'Kayıtlı raporlar',
          link: '/analytics/reports',
          icon: 'file-text',
          permissions: ['analytics:student'],
        },
      ],
    },
  ],

  /*
   * Gözlemci: her şey salt okunur. Yazma izni hiç yok, bu yüzden buton
   * gizleme ayrıca kodlanmaz — izin matrisi zaten sağlıyor. Dersler ve
   * sınavlar RolesPermissions.md'de Gözlemci kapsamında DEĞİLDİR — bu rolün
   * sidebar'ı yalnızca Panel, Cohort'lar, Analitik ve Raporlar'dan oluşur.
   */
  OBSERVER: [
    { title: 'Panel', items: [PANEL] },
    {
      title: 'Görüntüleme',
      items: [
        {
          label: "Cohort'lar",
          link: '/cohort-analytics',
          icon: 'users',
          permissions: ['analytics:cohort'],
        },
        {
          label: 'Analitik',
          link: '/analytics',
          icon: 'chart-column',
          permissions: ['analytics:student'],
          exact: true,
        },
        {
          label: 'Kayıtlı raporlar',
          link: '/analytics/reports',
          icon: 'file-text',
          permissions: ['analytics:student'],
        },
      ],
    },
  ],

  /*
   * Platform Yöneticisi: akademik sürecin sahibi DEĞİLDİR, sistemin işletim
   * yöneticisidir (ADR-077). Ders/kazanım/soru/sınav kataloğu ve analitik
   * ekranları Program Yöneticisi, Ölçme Uzmanı ve Eğitmenin işidir; bu rol
   * yalnızca rol/izin, akademik dönem ve sistem parametrelerini yönetir.
   */
  PLATFORM_ADMIN: [
    { title: 'Genel', items: [PANEL] },
    {
      title: 'Yönetim',
      items: [
        {
          label: 'Kullanıcılar',
          link: '/admin/users',
          icon: 'user-round',
          permissions: ['admin:manage'],
        },
        {
          label: 'Roller ve izinler',
          link: '/admin/roles',
          icon: 'shield-check',
          permissions: ['admin:manage'],
        },
        {
          label: 'Akademik dönemler',
          link: '/admin/terms',
          icon: 'calendar',
          permissions: ['admin:manage'],
        },
        {
          label: 'Bildirim merkezi',
          link: '/admin/notifications',
          icon: 'bell',
          permissions: ['admin:manage'],
        },
        {
          label: 'Sistem ayarları',
          link: '/admin/settings',
          icon: 'settings',
          permissions: ['admin:manage'],
        },
        {
          label: 'Denetim kaydı',
          link: '/audit-log',
          icon: 'scroll-text',
          permissions: ['audit:read'],
        },
        {
          label: 'Geliştirici paneli',
          link: '/dev-tools',
          icon: 'database',
          permissions: ['admin:manage'],
        },
      ],
    },
  ],
};

/**
 * Tüm rollerin menü öğelerinin BİRLEŞİMİ, tekilleştirilmiş (link bazında).
 *
 * Yalnızca breadcrumb çözümü için kullanılır (`header.component.ts`): hangi
 * grup/etiket altında olduğumuzu bulmak rol bazlı gruplamayı bilmek zorunda
 * değildir, sadece "bu link hangi grupta ve hangi etikette" bilgisine ihtiyaç
 * duyar.
 */
export const ALL_NAV_ITEMS: readonly { readonly group: string; readonly item: NavItem }[] =
  dedupeByLink(
    Object.values(NAV_GROUPS_BY_ROLE).flatMap((groups) =>
      groups.flatMap((group) => group.items.map((item) => ({ group: group.title, item }))),
    ),
  );

function dedupeByLink(
  entries: readonly { readonly group: string; readonly item: NavItem }[],
): readonly { readonly group: string; readonly item: NavItem }[] {
  const seen = new Set<string>();
  const result: { readonly group: string; readonly item: NavItem }[] = [];

  for (const entry of entries) {
    if (seen.has(entry.item.link)) continue;
    seen.add(entry.item.link);
    result.push(entry);
  }

  return result;
}

/** `:me` yer tutucusunu gerçek kullanıcı kimliğiyle değiştirir. */
export function resolveNavLink(link: string, userId: string | null): string {
  return userId ? link.replace(':me', userId) : link;
}
