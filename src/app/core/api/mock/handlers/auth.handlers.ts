import { ROLE_PERMISSIONS, Role, widestScope } from '../../../auth/permission.model';
import { AuthUser, LoginRequest, Session } from '../../../auth/session.model';
import { MockUser } from '../db/db-schema';
import { issueToken, requireCaller } from '../mock-auth';
import { unauthorized, validation } from '../mock-errors';
import { MockContext, MockHandler, ok } from '../mock-router';

/** Oturum süresi — demo için uzun tutulur. */
const SESSION_HOURS = 12;

export const AUTH_HANDLERS: readonly MockHandler[] = [
  {
    method: 'POST',
    path: '/api/auth/login',
    handle: (context) => {
      const body = context.body as Partial<LoginRequest> | null;

      if (!body?.email || !body.password) {
        throw validation('E-posta ve parola zorunludur.', [
          ...(body?.email ? [] : [{ field: 'email', message: 'E-posta zorunludur.' }]),
          ...(body?.password ? [] : [{ field: 'password', message: 'Parola zorunludur.' }]),
        ]);
      }

      const account = context.db
        .collection('users')
        .findOne((item) => item.email.toLowerCase() === body.email!.toLowerCase());

      // Kullanıcı adı doğru mu yanlış mı bilgisi sızdırılmaz — tek mesaj döner.
      if (!account || account.password !== body.password) {
        throw unauthorized('E-posta veya parola hatalı.');
      }

      return ok({ session: buildSession(account, account.roles[0]!, context.now) });
    },
  },

  {
    method: 'GET',
    path: '/api/auth/session',
    handle: (context) => {
      const caller = requireCaller(context);
      const account = context.db.collection('users').findById(caller.userId);
      if (!account) throw unauthorized();

      return ok({ session: buildSession(account, caller.role, context.now) });
    },
  },

  {
    method: 'POST',
    path: '/api/auth/switch-role',
    handle: (context) => {
      const caller = requireCaller(context);
      const account = context.db.collection('users').findById(caller.userId);
      if (!account) throw unauthorized();

      const requested = (context.body as { role?: Role } | null)?.role;
      if (!requested || !account.roles.includes(requested)) {
        throw validation('Bu role geçiş yetkiniz yok.');
      }

      return ok({ session: buildSession(account, requested, context.now) });
    },
  },

  {
    method: 'POST',
    path: '/api/auth/logout',
    handle: () => ok({ success: true }),
  },

  {
    /** Sınav sayacının istemci saatinden bağımsız çalışması için (BR-07). */
    method: 'GET',
    path: '/api/auth/server-time',
    handle: (context: MockContext) => ok({ serverTime: new Date(context.now).toISOString() }),
  },
];

function buildSession(account: MockUser, activeRole: Role, now: number): Session {
  // Parola ve yönetimsel alanlar oturum gövdesine ASLA konmaz; alanlar tek tek seçilir.
  const user: AuthUser = {
    id: account.id,
    fullName: account.fullName,
    email: account.email,
    avatarUrl: account.avatarUrl,
    roles: account.roles,
    courseIds: account.courseIds,
    cohortIds: account.cohortIds,
    programId: account.programId,
    title: account.title,
  };

  return {
    token: issueToken(account.id, activeRole),
    user,
    activeRole,
    permissions: ROLE_PERMISSIONS[activeRole],
    scope: widestScope([activeRole]),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_HOURS * 3_600_000).toISOString(),
    // İstemci bu değeri kendi saatiyle karşılaştırarak sapmayı hesaplar.
    serverTimeOffsetMs: 0,
  };
}
