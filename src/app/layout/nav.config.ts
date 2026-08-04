import { Permission } from '../core/auth/permission.model';
import { AppIconName } from '../shared/icons/app-icons';

/**
 * Sidebar menüsü.
 *
 * Yetkisiz bağlantı gizlenmez — HİÇ render edilmez. Menü tanımı ile route
 * guard'ları AYNI izinleri kullanır, böylece ikisi birbirinden ayrışamaz.
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

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    title: 'Öğrenme',
    items: [
      {
        label: 'Panel',
        link: '/learning/dashboard',
        icon: 'layout-dashboard',
        permissions: ['analytics:student'],
        exact: true,
      },
      {
        /*
         * "Sınavlarım" ÖĞRENCİYE özgüdür: kişinin kendi gireceği sınavları
         * listeler. `exam:read` ile kapılanınca gözlemci ve eğitmen de menüde
         * görüyor ama her zaman boş bir liste buluyordu. Sınava girebilme izni
         * olan tek rol öğrencidir; kapı da o izinle kurulur.
         */
        label: 'Sınavlarım',
        link: '/my-exams',
        icon: 'file-check',
        permissions: ['session:start'],
      },
      {
        label: 'Programlar',
        link: '/programs',
        icon: 'graduation-cap',
        permissions: ['course:read'],
      },
      { label: 'Dersler', link: '/courses', icon: 'library', permissions: ['course:read'] },
      {
        label: 'İçerikler',
        link: '/contents',
        icon: 'circle-play',
        permissions: ['content:read'],
        exact: true,
      },
      {
        // Yalnızca öğrencide bulunan izin — kişisel çalışma planı ekranı.
        label: 'Öğrenme yolum',
        link: '/learning/path',
        /* `workflow` kazanım haritasının ikonu; kişisel plan sıralı bir görev listesidir. */
        icon: 'list-checks',
        permissions: ['session:start'],
      },
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
    ],
  },
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
      {
        label: 'Trendler',
        link: '/analytics/trends',
        icon: 'trending-up',
        permissions: ['analytics:cohort'],
      },
      {
        label: 'Kazanım analitiği',
        link: '/analytics/outcomes',
        icon: 'target',
        permissions: ['analytics:cohort'],
      },
      {
        label: 'Ustalık haritası',
        link: '/analytics/mastery',
        icon: 'grid-2x2',
        permissions: ['analytics:cohort'],
      },
      {
        label: 'Cohort analitiği',
        link: '/cohort-analytics',
        icon: 'users',
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
        label: 'Karşılaştırma',
        link: '/analytics/compare',
        icon: 'git-compare',
        permissions: ['analytics:cohort'],
      },
      {
        label: 'Soru zorluk analizi',
        link: '/analytics/difficulty',
        icon: 'flask-conical',
        permissions: ['analytics:item'],
      },
      {
        label: 'Madde analizi',
        link: '/item-analysis',
        icon: 'microscope',
        permissions: ['analytics:item'],
      },
      {
        label: 'Kayıtlı raporlar',
        link: '/analytics/reports',
        icon: 'file-text',
        permissions: ['analytics:student'],
      },
    ],
  },
  {
    title: 'Yönetim',
    items: [
      {
        label: 'Yönetim panosu',
        link: '/admin',
        icon: 'layout-dashboard',
        permissions: ['admin:manage'],
        exact: true,
      },
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
];

/** `:me` yer tutucusunu gerçek kullanıcı kimliğiyle değiştirir. */
export function resolveNavLink(link: string, userId: string | null): string {
  return userId ? link.replace(':me', userId) : link;
}
