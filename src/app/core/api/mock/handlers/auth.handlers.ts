import { Role, widestScope } from '../../../auth/permission.model';
import { permissionsFromDefinitions } from '../../../auth/role-definition';
import { FakeDb } from '../db/fake-db';
import { AuthUser, LoginRequest, Session } from '../../../auth/session.model';
import { MockUser } from '../db/db-schema';
import { issueToken, requireCaller } from '../mock-auth';
import { unauthorized, validation } from '../mock-errors';
import { MockCaller, MockContext, MockHandler, ok } from '../mock-router';
import { mockIpAddress, writeAudit } from './audit-writer';

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

      const identifier = body.email.toLowerCase();

      const account = context.db
        .collection('users')
        .findOne(
          (item) =>
            item.email.toLowerCase() === identifier || item.username.toLowerCase() === identifier,
        );

      // Kullanıcı adı doğru mu yanlış mı bilgisi sızdırılmaz — tek mesaj döner.
      if (!account || account.password !== body.password) {
        if (account) recordLogin(context, account, false);
        throw unauthorized('E-posta veya parola hatalı.');
      }

      /*
       * Kilitli hesap doğru parolayla bile giremez.
       *
       * Kontrol parola doğrulamasından SONRA yapılır: önce yapılsaydı, yanlış
       * parola deneyen biri "bu hesap kilitli" cevabını alır ve hesabın var
       * olduğunu öğrenirdi.
       */
      const settings = readSettings(context.db);

      if (account.failedLoginCount >= settings.loginAttempts) {
        throw unauthorized(
          'Hesabınız arka arkaya başarısız giriş nedeniyle kilitlendi. Yöneticinizle iletişime geçin.',
        );
      }

      if (account.state === 'SUSPENDED' || account.state === 'ARCHIVED') {
        throw unauthorized('Hesabınız etkin değil. Yöneticinizle iletişime geçin.');
      }

      recordLogin(context, account, true);

      const refreshed = context.db.collection('users').findById(account.id) ?? account;

      return ok({
        session: buildSession(refreshed, refreshed.roles[0]!, context.now, context.db),
      });
    },
  },

  {
    method: 'GET',
    path: '/api/auth/session',
    handle: (context) => {
      const caller = requireCaller(context);
      const account = context.db.collection('users').findById(caller.userId);
      if (!account) throw unauthorized();

      return ok({ session: buildSession(account, caller.role, context.now, context.db) });
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

      return ok({ session: buildSession(account, requested, context.now, context.db) });
    },
  },

  {
    method: 'POST',
    path: '/api/auth/logout',
    handle: (context) => {
      const caller = context.caller;

      if (caller) {
        const account = context.db.collection('users').findById(caller.userId);
        writeAudit(
          context,
          caller,
          'auth.logout',
          { type: 'User', id: caller.userId, label: account?.fullName ?? caller.userId },
          null,
        );
      }

      return ok({ success: true });
    },
  },

  {
    /** Sınav sayacının istemci saatinden bağımsız çalışması için (BR-07). */
    method: 'GET',
    path: '/api/auth/server-time',
    handle: (context: MockContext) => ok({ serverTime: new Date(context.now).toISOString() }),
  },
];

function buildSession(account: MockUser, activeRole: Role, now: number, db: FakeDb): Session {
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
    // İzinler rol TANIMINDAN okunur; yöneticinin düzenlemesi burada yürürlüğe girer.
    permissions: permissionsFromDefinitions([activeRole], db.collection('roleDefinitions').all()),
    scope: widestScope([activeRole]),
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_HOURS * 3_600_000).toISOString(),
    // İstemci bu değeri kendi saatiyle karşılaştırarak sapmayı hesaplar.
    serverTimeOffsetMs: 0,
  };
}


/**
 * Giriş denemesini kaydeder.
 *
 * Başarısızlıkta sayaç ARTAR, başarıda SIFIRLANIR. Kilit ayrı bir bayrakla
 * tutulmaz; sayaç eşiği aştığında hesap kilitlidir. İki alan tutulsaydı biri
 * sıfırlanıp diğeri unutulabilir ve kullanıcı sebepsiz kilitli kalırdı.
 */
function recordLogin(context: MockContext, account: MockUser, success: boolean): void {
  const nowIso = new Date(context.now).toISOString();

  context.db.collection('loginEvents').insert({
    id: `lgn_${context.now}_${account.id}`,
    userId: account.id,
    at: nowIso,
    ipAddress: mockIpAddress(account.id),
    userAgent: context.request.headers.get('User-Agent') ?? 'Bilinmeyen istemci',
    success,
  });

  context.db.collection('users').update(account.id, {
    failedLoginCount: success ? 0 : account.failedLoginCount + 1,
    lastLoginAt: success ? nowIso : account.lastLoginAt,
  });

  const caller: MockCaller = {
    userId: account.id,
    role: account.roles[0]!,
    permissions: [],
    courseIds: account.courseIds,
    cohortIds: account.cohortIds,
    programId: account.programId,
    can: () => false,
  };

  writeAudit(
    context,
    caller,
    success ? 'auth.login' : 'auth.login_failed',
    { type: 'User', id: account.id, label: account.fullName },
    null,
    [],
    success,
  );
}

/** Ayarlar tek satırlık bir koleksiyondur; okuma tek yerde yapılır. */
export function readSettings(db: FakeDb) {
  const settings = db.collection('systemSettings').findById('settings');
  if (!settings) throw unauthorized('Sistem ayarları bulunamadı.');

  return settings;
}
