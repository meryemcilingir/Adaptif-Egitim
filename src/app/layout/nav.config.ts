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
        icon: 'sparkles',
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
    ],
  },
  {
    title: 'Analitik',
    items: [
      {
        label: 'Gelişimim',
        link: '/student/:me/analytics',
        icon: 'chart-line',
        permissions: ['session:start'],
      },
      {
        label: 'Cohort analitiği',
        link: '/cohort-analytics',
        icon: 'users',
        permissions: ['analytics:cohort'],
      },
      {
        label: 'Madde analizi',
        link: '/item-analysis',
        icon: 'microscope',
        permissions: ['analytics:item'],
      },
    ],
  },
  {
    title: 'Sistem',
    items: [
      {
        label: 'Kullanıcılar',
        link: '/users',
        icon: 'user-round',
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
