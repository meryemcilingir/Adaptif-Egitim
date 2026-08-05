import {
  PERMISSIONS,
  PERMISSION_LABELS,
  Permission,
  ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  Role,
} from './permission.model';

/**
 * Çalışma zamanında yönetilebilen rol tanımı (Sprint 9 §4).
 *
 * `ROLE_PERMISSIONS` derleme zamanı bir sabittir ve öyle kalır: uygulamanın
 * tanıdığı ALTI sistem rolünün VARSAYILAN izinlerini tanımlar. Rol yönetimi
 * ekranı bu varsayılanların üzerine yazabilsin diye tanımlar veritabanında
 * saklanır ve oturum izinleri oradan hesaplanır.
 *
 * İki kaynak arasındaki ilişki tek yönlüdür: sabit → tohum. Tohumlandıktan
 * sonra doğruluk kaynağı veritabanıdır; sabit yalnızca sıfırlama referansıdır.
 * Ters yön kurulsaydı (sabit her açılışta veritabanının üzerine yazsaydı)
 * yöneticinin yaptığı hiçbir değişiklik kalıcı olmazdı.
 */

export interface RoleDefinition {
  readonly id: string;
  /** Sistem rollerinde `Role` değeriyle aynıdır; özel rollerde türetilir. */
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly Permission[];
  /**
   * Sistem rolü silinemez ve anahtarı değişmez.
   *
   * Kod içinde `Role` tipiyle referans verilirler (guard'lar, kapsam tablosu,
   * tohum verisi); silinmeleri çalışan kodu kırardı.
   */
  readonly system: boolean;
  /** Bu rolü taşıyan kullanıcı sayısı — listede gösterilir, saklanmaz. */
  readonly archivedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

export const ROLE_NAME_LIMITS = { min: 3, max: 50 } as const;
export const ROLE_DESCRIPTION_MAX = 200;

/**
 * İzinlerin modül gruplaması (§4).
 *
 * Şartname izinleri "Programs → View / Create / Edit / Delete" gibi modül
 * bazında istiyor. İkinci bir izin listesi TANIMLANMAZ: var olan
 * `resource:action` izinleri yalnızca GÖSTERİM için gruplanır. Yeni bir izin
 * eklendiğinde buraya da yazılmazsa `UNGROUPED` altında görünür — sessizce
 * kaybolmaz.
 */
export interface PermissionGroup {
  readonly key: string;
  readonly label: string;
  readonly permissions: readonly Permission[];
}

const GROUP_DEFINITIONS: readonly { key: string; label: string; prefixes: readonly string[] }[] = [
  { key: 'catalog', label: 'Program ve dersler', prefixes: ['course', 'outcome', 'content'] },
  { key: 'assessment', label: 'Soru ve sınav', prefixes: ['question', 'blueprint', 'exam', 'rubric'] },
  { key: 'session', label: 'Sınav oturumu', prefixes: ['session'] },
  { key: 'grading', label: 'Değerlendirme', prefixes: ['attempt'] },
  { key: 'analytics', label: 'Analitik ve raporlama', prefixes: ['analytics'] },
  { key: 'administration', label: 'Yönetim', prefixes: ['admin', 'audit', 'term'] },
];

export const PERMISSION_GROUPS: readonly PermissionGroup[] = buildGroups();

function buildGroups(): readonly PermissionGroup[] {
  const assigned = new Set<Permission>();

  const groups = GROUP_DEFINITIONS.map((definition) => {
    const permissions = PERMISSIONS.filter((permission) => {
      const resource = permission.split(':')[0] ?? '';
      const matches = definition.prefixes.includes(resource);
      if (matches) assigned.add(permission);
      return matches;
    });

    return { key: definition.key, label: definition.label, permissions };
  }).filter((group) => group.permissions.length > 0);

  const ungrouped = PERMISSIONS.filter((permission) => !assigned.has(permission));

  return ungrouped.length === 0
    ? groups
    : [...groups, { key: 'other', label: 'Diğer', permissions: ungrouped }];
}

export function permissionLabel(permission: Permission): string {
  return PERMISSION_LABELS[permission];
}

/**
 * Kaldırılamayan izinler.
 *
 * Platform yöneticisinden `admin:manage` alınırsa rol yönetimi ekranına bir
 * daha kimse giremez ve sistem kendini dışarıdan kilitler. Bu tek izin, tek
 * yerde korunur.
 */
export const LOCKED_PERMISSIONS: Readonly<Record<string, readonly Permission[]>> = {
  PLATFORM_ADMIN: ['admin:manage'],
};

export function lockedPermissionsOf(key: string): readonly Permission[] {
  return LOCKED_PERMISSIONS[key] ?? [];
}

export function isPermissionLocked(key: string, permission: Permission): boolean {
  return lockedPermissionsOf(key).includes(permission);
}

export interface RoleViolation {
  readonly field: 'name' | 'description' | 'permissions';
  readonly message: string;
}

export function validateRoleDefinition(input: {
  key: string;
  name: string;
  description: string;
  permissions: readonly Permission[];
  existingNames: readonly string[];
}): readonly RoleViolation[] {
  const violations: RoleViolation[] = [];
  const name = input.name.trim();

  if (name.length < ROLE_NAME_LIMITS.min) {
    violations.push({
      field: 'name',
      message: `Rol adı en az ${ROLE_NAME_LIMITS.min} karakter olmalıdır.`,
    });
  }
  if (name.length > ROLE_NAME_LIMITS.max) {
    violations.push({
      field: 'name',
      message: `Rol adı en fazla ${ROLE_NAME_LIMITS.max} karakter olabilir.`,
    });
  }
  if (
    input.existingNames.some(
      (existing) => existing.toLocaleLowerCase('tr-TR') === name.toLocaleLowerCase('tr-TR'),
    )
  ) {
    violations.push({ field: 'name', message: 'Bu adda bir rol zaten var.' });
  }

  if (input.description.length > ROLE_DESCRIPTION_MAX) {
    violations.push({
      field: 'description',
      message: `Açıklama en fazla ${ROLE_DESCRIPTION_MAX} karakter olabilir.`,
    });
  }

  if (input.permissions.length === 0) {
    violations.push({
      field: 'permissions',
      message: 'Rol en az bir izin taşımalıdır. İzinsiz rol kullanıcıyı boş bir uygulamaya bırakır.',
    });
  }

  const missing = lockedPermissionsOf(input.key).filter(
    (permission) => !input.permissions.includes(permission),
  );

  if (missing.length > 0) {
    violations.push({
      field: 'permissions',
      message: `Bu rolden kaldırılamayacak izinler var: ${missing
        .map(permissionLabel)
        .join(', ')}.`,
    });
  }

  return violations;
}

/** Sistem rollerinin tohum tanımları — veritabanı boşken bir kez yazılır. */
export function systemRoleSeeds(nowIso: string): readonly Omit<RoleDefinition, 'id'>[] {
  return ROLES.map((role: Role) => ({
    key: role,
    name: ROLE_LABELS[role],
    description: ROLE_DESCRIPTIONS[role],
    permissions: [...ROLE_PERMISSIONS[role]],
    system: true,
    archivedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    version: 1,
  }));
}

/**
 * Kullanıcının izinleri.
 *
 * Rol tanımı bulunamazsa derleme zamanı varsayılana düşülür: bir tanım
 * arşivlenmiş ya da silinmiş olsa bile kullanıcı izinsiz kalmaz, en azından
 * rolünün bilinen varsayılanını taşır.
 */
export function permissionsFromDefinitions(
  roles: readonly Role[],
  definitions: readonly RoleDefinition[],
): readonly Permission[] {
  const byKey = new Map(definitions.map((definition) => [definition.key, definition]));

  return [
    ...new Set(
      roles.flatMap((role) => {
        const definition = byKey.get(role);
        return definition && definition.archivedAt === null
          ? definition.permissions
          : ROLE_PERMISSIONS[role];
      }),
    ),
  ];
}
