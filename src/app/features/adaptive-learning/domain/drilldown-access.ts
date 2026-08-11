import { Permission, Role } from '../../../core/auth/permission.model';

/**
 * Analitik ekranlarındaki "detaya git" bağlantılarının erişim kuralları.
 *
 * Rapor gövdeleri sunucuda ÜRETİLİR ve çağıranın rolünden bağımsız olarak aynı
 * bağlantıları taşır. Eğitmen "öne çıkan bulgular" kartındaki oka bastığında
 * `analytics:item` isteyen madde analizine gidiyor ve guard onu /403'e
 * düşürüyordu: kullanıcıya önce iş vaat edilip sonra kapı yüzüne kapanıyordu.
 *
 * Burada bağlantı, HEDEF ROTANIN guard'ıyla aynı koşullara bağlanır; koşul
 * sağlanmıyorsa bağlantı `null`'a çevrilir ve ok hiç çizilmez (KPI kartı da
 * tıklanamaz olur). Guard'lar yerinde durur — bu katman yalnızca ölü bağlantıyı
 * gizler, yetkiyi belirlemez.
 *
 * Kayıt, `adaptive-learning.routes.ts` içindeki `canMatch` tanımlarının
 * aynadır; bir rotanın guard'ı değişirse buradaki satırı da güncelleyin.
 */
interface DrilldownRule {
  /** Herhangi biri yeterlidir — `permissionGuard` canAny mantığıyla çalışır. */
  readonly permissions: readonly Permission[];
  /** Verilirse rol de eşleşmelidir (`roleGuard`). */
  readonly roles?: readonly Role[];
}

const RULES: Readonly<Record<string, DrilldownRule>> = {
  '/courses': {
    permissions: ['course:read'],
    roles: ['STUDENT', 'INSTRUCTOR', 'PROGRAM_MANAGER'],
  },
  '/exams': { permissions: ['exam:read'] },
  '/question-bank': { permissions: ['question:read'] },
  '/item-analysis': { permissions: ['analytics:item'] },
  '/cohort-analytics': {
    permissions: ['analytics:cohort'],
    roles: ['PROGRAM_MANAGER', 'OBSERVER'],
  },
  '/analytics': { permissions: ['analytics:student'] },
  '/analytics/reports': { permissions: ['analytics:student'] },
  '/analytics/outcomes': { permissions: ['analytics:cohort'] },
  '/analytics/mastery': { permissions: ['analytics:cohort'] },
  '/analytics/compare': { permissions: ['analytics:cohort'] },
  '/analytics/difficulty': { permissions: ['analytics:item'] },
  '/analytics/trends': { permissions: ['analytics:cohort'], roles: ['PROGRAM_MANAGER'] },
  '/analytics/velocity': { permissions: ['analytics:cohort'], roles: ['PROGRAM_MANAGER'] },
  '/analytics/performers': { permissions: ['analytics:cohort'], roles: ['PROGRAM_MANAGER'] },
  '/analytics/recommendations': {
    permissions: ['analytics:cohort'],
    roles: ['PROGRAM_MANAGER'],
  },
};

export interface DrilldownAccess {
  readonly can: (permission: Permission) => boolean;
  readonly role: Role | null;
}

/**
 * Bağlantı açılabiliyor mu?
 *
 * Kayıtta olmayan bağlantılar (ör. `/exams/ex_12` gibi kimlik taşıyanlar) en
 * uzun eşleşen önekle değerlendirilir; hiçbiri eşleşmezse bağlantı serbest
 * bırakılır — bilinmeyen bir hedefi yanlışlıkla gizlemek, kullanıcıdan
 * çalışan bir yolu saklamak olurdu.
 */
export function canOpenDrilldown(link: string | null, access: DrilldownAccess): boolean {
  if (!link) return false;

  const key = Object.keys(RULES)
    .filter((path) => link === path || link.startsWith(`${path}/`))
    .sort((a, b) => b.length - a.length)[0];

  if (key === undefined) return true;

  const rule = RULES[key];
  if (!rule.permissions.some((permission) => access.can(permission))) return false;

  return rule.roles === undefined || (access.role !== null && rule.roles.includes(access.role));
}

/** Açılamayan bağlantıyı `null`'a çevirir; şablonlar zaten `null` bekliyor. */
export function drilldownLink(link: string | null, access: DrilldownAccess): string | null {
  return canOpenDrilldown(link, access) ? link : null;
}
