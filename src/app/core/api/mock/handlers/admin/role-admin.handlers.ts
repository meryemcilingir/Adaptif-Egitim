import { PERMISSIONS, Permission, Role } from '../../../../auth/permission.model';
import {
  RoleDefinition,
  lockedPermissionsOf,
  validateRoleDefinition,
} from '../../../../auth/role-definition';
import { RoleRow } from '../../../../../features/administration/models/admin.model';
import { requirePermission } from '../../mock-auth';
import { businessRule, conflict, notFound, validation } from '../../mock-errors';
import { MockContext, MockHandler, created, ok } from '../../mock-router';
import { writeAudit } from '../audit-writer';

/**
 * Rol ve izin yönetimi (Sprint 9 §4).
 *
 * Rol tanımı veritabanındadır; oturum izinleri buradan hesaplanır
 * (`mock-auth.ts`). Bu yüzden her yazma işleminden sonra ETKİ ANINDA değil bir
 * sonraki oturum tazelemesinde görünür — ekran bunu kullanıcıya söyler.
 *
 * Sistem rolleri silinemez ve anahtarları değişmez: guard'lar, veri kapsamı
 * tablosu ve tohum verisi onlara `Role` tipiyle referans verir.
 */
export const ROLE_ADMIN_HANDLERS: readonly MockHandler[] = [
  {
    method: 'GET',
    path: '/api/admin/roles',
    handle: (context) => {
      requirePermission(context, 'admin:manage');
      return ok(rows(context));
    },
  },

  {
    method: 'POST',
    path: '/api/admin/roles',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const body = readBody(context);
      const nowIso = new Date(context.now).toISOString();

      assertValid(context, { key: '', ...body }, null);

      const definition: RoleDefinition = {
        id: `rol_${context.now.toString(36)}`,
        key: keyFrom(body.name, context),
        name: body.name,
        description: body.description,
        permissions: body.permissions,
        /* Elle oluşturulan roller sistem rolü DEĞİLDİR; silinebilirler. */
        system: false,
        archivedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        version: 1,
      };

      context.db.collection('roleDefinitions').insert(definition);

      writeAudit(context, caller, 'role.created', target(definition), null, [
        {
          field: 'permissions',
          label: 'İzinler',
          oldValue: null,
          newValue: `${definition.permissions.length} izin`,
        },
      ]);

      return created(toRow(context, definition));
    },
  },

  {
    method: 'PUT',
    path: '/api/admin/roles/:id',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const existing = find(context);
      const body = readBody(context);

      assertVersion(context, existing);
      assertValid(context, { key: existing.key, ...body }, existing.id);

      /*
       * Sistem rolünün ADI değişmez.
       *
       * Ad, kod içinde `ROLE_LABELS` üzerinden görünür ve tohum verisi ona
       * dayanır; değiştirilseydi ekranlarda iki farklı isim dolaşırdı. İzinleri
       * ise düzenlenebilir — yönetimin asıl amacı budur.
       */
      const name = existing.system ? existing.name : body.name;

      const updated = context.db.collection('roleDefinitions').update(existing.id, {
        name,
        description: body.description,
        permissions: body.permissions,
        updatedAt: new Date(context.now).toISOString(),
        version: existing.version + 1,
      })!;

      writeAudit(context, caller, 'role.updated', target(updated), null, [
        {
          field: 'permissions',
          label: 'İzinler',
          oldValue: `${existing.permissions.length} izin`,
          newValue: `${updated.permissions.length} izin`,
        },
      ]);

      return ok(toRow(context, updated));
    },
  },

  {
    method: 'POST',
    path: '/api/admin/roles/:id/duplicate',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const source = find(context);
      const nowIso = new Date(context.now).toISOString();

      const name = uniqueName(context, `${source.name} (kopya)`);

      const copy: RoleDefinition = {
        id: `rol_${context.now.toString(36)}`,
        key: keyFrom(name, context),
        name,
        description: source.description,
        permissions: [...source.permissions],
        system: false,
        archivedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        version: 1,
      };

      context.db.collection('roleDefinitions').insert(copy);
      writeAudit(context, caller, 'role.duplicated', target(copy), `Kaynak: ${source.name}`);

      return created(toRow(context, copy));
    },
  },

  {
    method: 'POST',
    path: '/api/admin/roles/:id/archive',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const role = find(context);

      if (role.system) {
        throw businessRule(
          'Sistem rolleri arşivlenemez. Bunlar guard ve veri kapsamı kurallarında doğrudan kullanılır.',
        );
      }

      const restoring = role.archivedAt !== null;
      const inUse = userCount(context, role.key);

      if (!restoring && inUse > 0) {
        throw businessRule(
          `Bu rol ${inUse} kullanıcıya atanmış. Önce kullanıcıların rollerini değiştirin.`,
        );
      }

      const updated = context.db.collection('roleDefinitions').update(role.id, {
        archivedAt: restoring ? null : new Date(context.now).toISOString(),
        updatedAt: new Date(context.now).toISOString(),
        version: role.version + 1,
      })!;

      writeAudit(
        context,
        caller,
        restoring ? 'role.restored' : 'role.archived',
        target(updated),
        null,
      );

      return ok(toRow(context, updated));
    },
  },
];

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function find(context: MockContext): RoleDefinition {
  const role = context.db.collection('roleDefinitions').findById(context.params['id'] ?? '');
  if (!role) throw notFound('Rol');

  return role;
}

function target(role: RoleDefinition) {
  return { type: 'Role', id: role.id, label: role.name };
}

function rows(context: MockContext): readonly RoleRow[] {
  return context.db
    .collection('roleDefinitions')
    .all()
    .map((role) => toRow(context, role))
    .sort((a, b) => Number(b.system) - Number(a.system) || a.name.localeCompare(b.name, 'tr-TR'));
}

/** Kullanıcı sayısı SAKLANMAZ, her istekte sayılır — ayrışacak ikinci kayıt olmaz. */
function toRow(context: MockContext, role: RoleDefinition): RoleRow {
  return {
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    system: role.system,
    archivedAt: role.archivedAt,
    userCount: userCount(context, role.key),
    updatedAt: role.updatedAt,
    version: role.version,
  };
}

function userCount(context: MockContext, key: string): number {
  return context.db.collection('users').filter((user) => user.roles.includes(key as Role)).length;
}

interface RoleBody {
  readonly name: string;
  readonly description: string;
  readonly permissions: readonly Permission[];
}

function readBody(context: MockContext): RoleBody {
  const body = (context.body ?? {}) as Partial<RoleBody>;

  return {
    name: (body.name ?? '').trim(),
    description: (body.description ?? '').trim(),
    // Tanınmayan izinler sessizce atılır: istemci uydurma bir izin ekleyemez.
    permissions: (body.permissions ?? []).filter((permission): permission is Permission =>
      PERMISSIONS.includes(permission as Permission),
    ),
  };
}

function assertValid(
  context: MockContext,
  body: RoleBody & { key: string },
  currentId: string | null,
): void {
  const existingNames = context.db
    .collection('roleDefinitions')
    .filter((role) => role.id !== currentId)
    .map((role) => role.name);

  const violations = validateRoleDefinition({
    key: body.key,
    name: body.name,
    description: body.description,
    permissions: body.permissions,
    existingNames,
  });

  if (violations.length > 0) {
    throw validation(
      'Rol tanımı geçersiz.',
      violations.map((violation) => ({ field: violation.field, message: violation.message })),
    );
  }

  // Kilitli izinler istemci göndermese bile korunur.
  const missing = lockedPermissionsOf(body.key).filter(
    (permission) => !body.permissions.includes(permission),
  );

  if (missing.length > 0) {
    throw businessRule('Bu rolden kaldırılamayacak izinler var.');
  }
}

function assertVersion(context: MockContext, role: RoleDefinition): void {
  const expected = (context.body as { expectedVersion?: number } | null)?.expectedVersion;

  if (typeof expected === 'number' && expected !== role.version) {
    throw conflict('Bu rol siz düzenlerken başkası tarafından değiştirildi.');
  }
}

/** Özel rol anahtarı — sistem rol anahtarlarıyla çakışmayacak biçimde. */
function keyFrom(name: string, context: MockContext): string {
  const base = name
    .toLocaleUpperCase('tr-TR')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);

  const prefix = `CUSTOM_${base || 'ROL'}`;
  const taken = new Set(context.db.collection('roleDefinitions').all().map((role) => role.key));

  if (!taken.has(prefix)) return prefix;

  let index = 2;
  while (taken.has(`${prefix}_${index}`)) index += 1;

  return `${prefix}_${index}`;
}

function uniqueName(context: MockContext, candidate: string): string {
  const taken = new Set(
    context.db
      .collection('roleDefinitions')
      .all()
      .map((role) => role.name.toLocaleLowerCase('tr-TR')),
  );

  if (!taken.has(candidate.toLocaleLowerCase('tr-TR'))) return candidate;

  let index = 2;
  while (taken.has(`${candidate} ${index}`.toLocaleLowerCase('tr-TR'))) index += 1;

  return `${candidate} ${index}`;
}
