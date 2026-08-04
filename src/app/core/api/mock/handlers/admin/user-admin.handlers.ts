import { Role, ROLES } from '../../../../auth/permission.model';
import { AuditChange } from '../../../../observability/audit.model';
import {
  USER_LIMITS,
  UserDetail,
  UserDraft,
} from '../../../../../features/administration/models/admin.model';
import { User } from '../../../../../features/adaptive-learning/models/user.model';
import { checkPassword } from '../../../../../features/adaptive-learning/domain/system-settings.rules';
import { MockUser } from '../../db/db-schema';
import { equals, inList, includesId } from '../../db/query-engine';
import { requirePermission } from '../../mock-auth';
import { businessRule, conflict, notFound, validation } from '../../mock-errors';
import { MockContext, MockHandler, created, ok } from '../../mock-router';
import { writeAudit } from '../audit-writer';
import { readSettings } from '../auth.handlers';

/**
 * Kullanıcı yönetimi (Sprint 9 §2, §3).
 *
 * Parola alanı yanıt gövdesine ASLA konmaz; her kayıt `toPublicUser` ile
 * temizlenerek döner (tek çıkış noktası → unutma riski yok).
 *
 * Yaşam döngüsü işlemleri (askıya al / etkinleştir / arşivle / kilidi aç /
 * parola sıfırla) TEK bir uçta toplanır: beşi de aynı şeyi yapar — durumu
 * değiştir, denetim kaydı yaz. Beş ayrı handler yazmak beş kopya demekti.
 */

/** Yaşam döngüsü eylemleri ve karşılık geldikleri durum değişikliği. */
const LIFECYCLE = {
  disable: { state: 'SUSPENDED', action: 'user.disabled', label: 'Askıya alındı' },
  enable: { state: 'ACTIVE', action: 'user.enabled', label: 'Etkinleştirildi' },
  archive: { state: 'ARCHIVED', action: 'user.archived', label: 'Arşivlendi' },
  restore: { state: 'ACTIVE', action: 'user.restored', label: 'Arşivden çıkarıldı' },
} as const;

type LifecycleAction = keyof typeof LIFECYCLE;

export const USER_ADMIN_HANDLERS: readonly MockHandler[] = [
  {
    method: 'GET',
    path: '/api/users',
    handle: (context) => {
      requirePermission(context, 'admin:manage');

      const page = context.db.collection('users').query(context.page, {
        searchable: (user: MockUser) => [
          user.fullName,
          user.email,
          user.username,
          user.department,
          user.title,
        ],
        filters: {
          role: includesId<MockUser>((user) => user.roles),
          state: inList<MockUser>((user) => user.state),
          programId: equals<MockUser>((user) => user.programId),
          department: inList<MockUser>((user) => user.department),
        },
        defaultSort: { field: 'fullName', direction: 'asc' },
      });

      return ok({ ...page, items: page.items.map(toPublicUser) });
    },
  },

  {
    /* `/detail` daha özgül; `:id` handler'ından ÖNCE gelmelidir. */
    method: 'GET',
    path: '/api/users/:id/detail',
    handle: (context) => {
      requirePermission(context, 'admin:manage');
      return ok(buildDetail(context, findUser(context)));
    },
  },

  {
    method: 'GET',
    path: '/api/users/:id',
    handle: (context) => {
      requirePermission(context, 'admin:manage');
      return ok(toPublicUser(findUser(context)));
    },
  },

  {
    method: 'POST',
    path: '/api/users',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const draft = readDraft(context);

      assertUniqueIdentity(context, draft, null);

      const nowIso = new Date(context.now).toISOString();
      const settings = readSettings(context.db);

      const user: MockUser = {
        id: `usr_${context.now.toString(36)}`,
        fullName: draft.fullName,
        email: draft.email,
        username: draft.username,
        department: draft.department,
        title: draft.title,
        avatarUrl: null,
        roles: draft.roles,
        primaryRole: draft.primaryRole,
        programId: draft.programId,
        courseIds: draft.courseIds,
        cohortIds: draft.cohortIds,
        /*
         * Yeni kullanıcı ACTIVE değil INVITED başlar.
         *
         * Hesap ancak sahibi ilk girişini yapınca gerçekten kullanılıyordur;
         * doğrudan "aktif" saymak, kullanıcı sayısı raporlarını şişirirdi.
         */
        state: 'INVITED',
        lastLoginAt: null,
        failedLoginCount: 0,
        archivedAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
        version: 1,
        password: initialPassword(settings.passwordMinLength),
      };

      context.db.collection('users').insert(user);

      writeAudit(context, caller, 'user.created', target(user), null, [
        { field: 'email', label: 'E-posta', oldValue: null, newValue: user.email },
        { field: 'roles', label: 'Roller', oldValue: null, newValue: roleNames(user.roles) },
      ]);

      return created(toPublicUser(user));
    },
  },

  {
    method: 'PUT',
    path: '/api/users/:id',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const existing = findUser(context);
      const draft = readDraft(context);

      assertVersion(context, existing);
      assertUniqueIdentity(context, draft, existing.id);

      const updated = context.db.collection('users').update(existing.id, {
        ...draft,
        updatedAt: new Date(context.now).toISOString(),
        version: existing.version + 1,
      })!;

      const changes = diffUser(existing, updated);

      writeAudit(context, caller, 'user.updated', target(updated), null, changes);

      // Rol değişikliği ayrı bir kayıt üretir: yetki değişimi denetimde aranan olaydır.
      if (changes.some((change) => change.field === 'roles')) {
        writeAudit(
          context,
          caller,
          'user.roles_changed',
          target(updated),
          null,
          changes.filter((change) => change.field === 'roles'),
        );
      }

      return ok(toPublicUser(updated));
    },
  },

  ...(Object.keys(LIFECYCLE) as LifecycleAction[]).map<MockHandler>((action) => ({
    method: 'POST',
    path: `/api/users/:id/${action}`,
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const user = findUser(context);
      const rule = LIFECYCLE[action];

      assertNotSelf(caller.userId, user, 'Kendi hesabınızın durumunu değiştiremezsiniz.');

      if (user.state === rule.state) {
        throw businessRule(`Kullanıcı zaten "${rule.label.toLocaleLowerCase('tr-TR')}" durumunda.`);
      }

      /*
       * Son platform yöneticisi askıya alınamaz.
       *
       * Alınabilseydi sistemde yönetim ekranına girebilen kimse kalmaz ve
       * kilit ancak veritabanı sıfırlanarak açılırdı.
       */
      if (rule.state !== 'ACTIVE') assertNotLastAdmin(context, user);

      const updated = context.db.collection('users').update(user.id, {
        state: rule.state,
        archivedAt: rule.state === 'ARCHIVED' ? new Date(context.now).toISOString() : null,
        updatedAt: new Date(context.now).toISOString(),
        version: user.version + 1,
      })!;

      writeAudit(context, caller, rule.action, target(updated), reasonOf(context), [
        { field: 'state', label: 'Durum', oldValue: user.state, newValue: rule.state },
      ]);

      return ok(toPublicUser(updated));
    },
  })),

  {
    /**
     * Parola sıfırlama (örnek).
     *
     * Gerçek bir e-posta gönderilmez. Yeni parola YANITTA döner ve ekran bunu
     * "yöneticinin kullanıcıya elden iletmesi gereken geçici parola" olarak
     * sunar — sessizce üretilip kaybolsaydı kullanıcı hesabına giremezdi.
     */
    method: 'POST',
    path: '/api/users/:id/reset-password',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const user = findUser(context);
      const settings = readSettings(context.db);

      const password = initialPassword(settings.passwordMinLength);

      context.db.collection('users').update(user.id, {
        password,
        failedLoginCount: 0,
        updatedAt: new Date(context.now).toISOString(),
        version: user.version + 1,
      });

      writeAudit(context, caller, 'user.password_reset', target(user), reasonOf(context));

      return ok({
        temporaryPassword: password,
        note: 'Bu projede e-posta gönderimi yoktur; geçici parolayı kullanıcıya siz iletmelisiniz.',
      });
    },
  },

  {
    method: 'POST',
    path: '/api/users/:id/unlock',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const user = findUser(context);
      const settings = readSettings(context.db);

      if (user.failedLoginCount < settings.loginAttempts) {
        throw businessRule('Bu hesap kilitli değil.');
      }

      const updated = context.db.collection('users').update(user.id, {
        failedLoginCount: 0,
        updatedAt: new Date(context.now).toISOString(),
        version: user.version + 1,
      })!;

      writeAudit(context, caller, 'user.unlocked', target(updated), reasonOf(context), [
        {
          field: 'failedLoginCount',
          label: 'Başarısız giriş',
          oldValue: String(user.failedLoginCount),
          newValue: '0',
        },
      ]);

      return ok(toPublicUser(updated));
    },
  },
];

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

export function toPublicUser(user: MockUser): User {
  const { password: _password, ...publicUser } = user;
  return publicUser;
}

function findUser(context: MockContext): MockUser {
  const user = context.db.collection('users').findById(context.params['id'] ?? '');
  if (!user) throw notFound('Kullanıcı');

  return user;
}

function target(user: MockUser | User) {
  return { type: 'User', id: user.id, label: user.fullName };
}

function reasonOf(context: MockContext): string | null {
  const reason = (context.body as { reason?: string } | null)?.reason?.trim();
  return reason && reason.length > 0 ? reason : null;
}

function assertVersion(context: MockContext, user: MockUser): void {
  const expected = (context.body as { expectedVersion?: number } | null)?.expectedVersion;

  if (typeof expected === 'number' && expected !== user.version) {
    throw conflict('Bu kullanıcı siz düzenlerken başkası tarafından değiştirildi.');
  }
}

function assertNotSelf(callerId: string, user: MockUser, message: string): void {
  if (callerId === user.id) throw businessRule(message);
}

function assertNotLastAdmin(context: MockContext, user: MockUser): void {
  if (!user.roles.includes('PLATFORM_ADMIN')) return;

  const remaining = context.db
    .collection('users')
    .filter(
      (item) =>
        item.id !== user.id && item.roles.includes('PLATFORM_ADMIN') && item.state === 'ACTIVE',
    );

  if (remaining.length === 0) {
    throw businessRule(
      'Sistemdeki son platform yöneticisi devre dışı bırakılamaz. Önce başka bir yönetici atayın.',
    );
  }
}

function assertUniqueIdentity(
  context: MockContext,
  draft: UserDraft,
  currentId: string | null,
): void {
  const users = context.db.collection('users');

  const emailTaken = users.findOne(
    (item) => item.id !== currentId && item.email.toLowerCase() === draft.email.toLowerCase(),
  );
  if (emailTaken) {
    throw validation('Bu e-posta adresi kullanımda.', [
      { field: 'email', message: 'Bu e-posta adresi başka bir hesaba ait.' },
    ]);
  }

  const usernameTaken = users.findOne(
    (item) => item.id !== currentId && item.username.toLowerCase() === draft.username.toLowerCase(),
  );
  if (usernameTaken) {
    throw validation('Bu kullanıcı adı kullanımda.', [
      { field: 'username', message: 'Bu kullanıcı adı başka bir hesaba ait.' },
    ]);
  }
}

function readDraft(context: MockContext): UserDraft {
  const body = (context.body ?? {}) as Partial<UserDraft>;
  const errors: { field: string; message: string }[] = [];

  const fullName = (body.fullName ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const username = (body.username ?? '').trim().toLowerCase();
  const department = (body.department ?? '').trim();
  const title = (body.title ?? '').trim();
  const roles = (body.roles ?? []).filter((role): role is Role => ROLES.includes(role as Role));

  if (fullName.length < USER_LIMITS.fullName.min || fullName.length > USER_LIMITS.fullName.max) {
    errors.push({
      field: 'fullName',
      message: `Ad soyad ${USER_LIMITS.fullName.min}-${USER_LIMITS.fullName.max} karakter olmalıdır.`,
    });
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    errors.push({ field: 'email', message: 'Geçerli bir e-posta adresi girin.' });
  }

  if (username.length < USER_LIMITS.username.min || username.length > USER_LIMITS.username.max) {
    errors.push({
      field: 'username',
      message: `Kullanıcı adı ${USER_LIMITS.username.min}-${USER_LIMITS.username.max} karakter olmalıdır.`,
    });
  }

  if (department.length > USER_LIMITS.department.max) {
    errors.push({ field: 'department', message: 'Birim adı çok uzun.' });
  }

  if (roles.length === 0) {
    errors.push({ field: 'roles', message: 'En az bir rol seçilmelidir.' });
  }

  const primaryRole = body.primaryRole && roles.includes(body.primaryRole) ? body.primaryRole : roles[0];

  if (!primaryRole) {
    errors.push({ field: 'primaryRole', message: 'Birincil rol, seçili roller arasından olmalıdır.' });
  }

  if (errors.length > 0) throw validation('Kullanıcı bilgileri geçersiz.', errors);

  return {
    fullName,
    email,
    username,
    department,
    title,
    roles,
    primaryRole: primaryRole!,
    programId: body.programId ?? null,
    courseIds: body.courseIds ?? [],
    cohortIds: body.cohortIds ?? [],
  };
}

function diffUser(before: MockUser, after: MockUser): readonly AuditChange[] {
  const fields: readonly { field: keyof UserDraft; label: string }[] = [
    { field: 'fullName', label: 'Ad soyad' },
    { field: 'email', label: 'E-posta' },
    { field: 'username', label: 'Kullanıcı adı' },
    { field: 'department', label: 'Birim' },
    { field: 'title', label: 'Ünvan' },
    { field: 'primaryRole', label: 'Birincil rol' },
    { field: 'programId', label: 'Program' },
  ];

  const changes: AuditChange[] = fields
    .filter((entry) => before[entry.field] !== after[entry.field])
    .map((entry) => ({
      field: entry.field,
      label: entry.label,
      oldValue: stringify(before[entry.field]),
      newValue: stringify(after[entry.field]),
    }));

  if (before.roles.join(',') !== after.roles.join(',')) {
    changes.push({
      field: 'roles',
      label: 'Roller',
      oldValue: roleNames(before.roles),
      newValue: roleNames(after.roles),
    });
  }

  return changes;
}

function stringify(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function roleNames(roles: readonly Role[]): string {
  return roles.join(', ');
}

/**
 * Geçici parola.
 *
 * Politikaya UYDUĞU doğrulanarak üretilir: rastgele bir dize üretip politikayı
 * ihlal etmesi, kullanıcının ilk girişinde parolasının reddedilmesi demek olurdu.
 */
function initialPassword(minLength: number): string {
  const base = `Ae${Math.random().toString(36).slice(2, 10)}9`;
  const password = base.padEnd(Math.max(minLength, base.length), 'x');

  const problems = checkPassword(password, {
    minLength,
    requireNumber: true,
    requireUppercase: true,
    requireSymbol: false,
  });

  return problems.length === 0 ? password : `Ae1${'x'.repeat(Math.max(minLength - 3, 5))}`;
}

/* ── Kullanıcı detayı (§3) ───────────────────────────────────────────────── */

function buildDetail(context: MockContext, user: MockUser): UserDetail {
  const db = context.db;
  const settings = readSettings(db);

  const program = user.programId ? db.collection('programs').findById(user.programId) : null;

  const courses = db
    .collection('courses')
    .filter((course) => user.courseIds.includes(course.id))
    .map((course) => ({ id: course.id, label: `${course.code} · ${course.name}` }));

  const cohorts = db
    .collection('cohorts')
    .filter((cohort) => user.cohortIds.includes(cohort.id) || cohort.studentIds.includes(user.id))
    .map((cohort) => ({ id: cohort.id, label: cohort.name }));

  const attempts = db.collection('attempts').filter((attempt) => attempt.studentId === user.id);
  const progress = db.collection('contentProgress').filter((item) => item.studentId === user.id);
  const completed = progress.filter((item) => item.state === 'completed');

  const lastActivity = [
    ...attempts.map((attempt) => attempt.submittedAt),
    ...progress.map((item) => item.lastAccessedAt),
  ]
    .filter((value): value is string => typeof value === 'string')
    .sort()
    .at(-1);

  return {
    user: toPublicUser(user),
    assignments: {
      programName: program?.name ?? null,
      courses,
      cohorts,
    },
    activity: {
      examAttempts: attempts.length,
      completedContents: completed.length,
      studyMinutes: progress.reduce((total, item) => total + item.spentMinutes, 0),
      // Denemesi yoksa ortalama SIFIR değil YOKTUR; ekran bunu "—" gösterir.
      averageScorePercent:
        attempts.length === 0
          ? null
          : Math.round(
              attempts.reduce((total, attempt) => total + attempt.scorePercent, 0) / attempts.length,
            ),
      lastActivityAt: lastActivity ?? null,
    },
    logins: db
      .collection('loginEvents')
      .filter((event) => event.userId === user.id)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20),
    notifications: db
      .collection('notifications')
      .filter((item) => item.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20)
      .map((item) => ({
        id: item.id,
        title: item.title,
        createdAt: item.createdAt,
        read: item.read,
      })),
    audit: db
      .collection('auditEvents')
      .filter((event) => event.actorId === user.id || event.targetId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20),
    locked: user.failedLoginCount >= settings.loginAttempts,
  };
}
