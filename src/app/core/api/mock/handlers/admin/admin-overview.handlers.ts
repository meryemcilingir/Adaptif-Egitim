import {
  AdminMetric,
  AdminOverview,
  HealthComponent,
  HealthState,
  SystemHealth,
} from '../../../../../features/administration/models/admin.model';
import { TimeSeriesPoint } from '../../../../../features/adaptive-learning/models/analytics.model';
import { examRuntimeStatus } from '../../../../../features/adaptive-learning/domain/exam-runtime';
import { FakeDb } from '../../db/fake-db';
import { requirePermission } from '../../mock-auth';
import { MockContext, MockHandler, ok } from '../../mock-router';

/**
 * Yönetim panosu ve sistem sağlığı (Sprint 9 §1, §14).
 *
 * Tüm sayımlar İSTEK ANINDA gerçek koleksiyonlardan yapılır; hiçbir sayaç
 * saklanmaz. Saklansaydı bir kayıt silindiğinde sayaç güncellenmeyi unutur ve
 * pano gerçekle çelişirdi.
 */

/** Panodaki grafiklerin kapsadığı gün sayısı. */
const TREND_DAYS = 30;

export const ADMIN_OVERVIEW_HANDLERS: readonly MockHandler[] = [
  {
    method: 'GET',
    path: '/api/admin/overview',
    handle: (context) => {
      requirePermission(context, 'admin:manage');
      return ok(buildOverview(context));
    },
  },

  {
    method: 'GET',
    path: '/api/admin/health',
    handle: (context) => {
      requirePermission(context, 'admin:manage');
      return ok(buildHealth(context));
    },
  },
];

function buildOverview(context: MockContext): AdminOverview {
  const db = context.db;
  const now = context.now;

  const users = db.collection('users').all();
  const exams = db.collection('exams').all();
  // "Devam eden" tarihlerden TÜRETİLİR, kayıtta saklanmaz (ADR-041).
  const activeExams = exams.filter((exam) => examRuntimeStatus(exam, now) === 'active');

  const notifications = db.collection('notifications').all();
  const health = buildHealth(context);

  const metrics: readonly AdminMetric[] = [
    metric('totalUsers', 'Toplam kullanıcı', users.length, 'Tüm roller dâhil', 'users', '/admin/users'),
    metric(
      'activeUsers',
      'Aktif kullanıcı',
      users.filter((user) => user.state === 'ACTIVE').length,
      'Hesabı etkin olanlar',
      'user-round',
      '/admin/users',
    ),
    metric(
      'totalPrograms',
      'Program',
      db.collection('programs').all().length,
      'Tanımlı akademik program',
      'library',
      '/programs',
    ),
    metric(
      'totalCourses',
      'Ders',
      db.collection('courses').all().length,
      'Tüm durumlar dâhil',
      'book-open',
      '/courses',
    ),
    metric(
      'totalCohorts',
      'Grup',
      db.collection('cohorts').all().length,
      'Öğrenci grubu',
      'users',
      null,
    ),
    metric('totalExams', 'Sınav', exams.length, 'Tüm durumlar dâhil', 'file-check', '/exams'),
    {
      ...metric(
        'activeExams',
        'Devam eden sınav',
        activeExams.length,
        'Şu anda açık olan oturumlar',
        'timer',
        '/exams',
      ),
      tone: activeExams.length > 0 ? 'success' : 'neutral',
    },
    metric(
      'totalQuestions',
      'Soru',
      db.collection('questions').filter((question) => question.deletedAt === null).length,
      'Silinmemiş sorular',
      'circle-help',
      '/question-bank',
    ),
    {
      ...metric(
        'activeNotifications',
        'Okunmamış bildirim',
        notifications.filter((item) => !item.read).length,
        'Tüm kullanıcılar genelinde',
        'bell',
        '/admin/notifications',
      ),
      tone: 'neutral',
    },
    {
      key: 'systemHealth',
      label: 'Sistem durumu',
      value: health.components.filter((component) => component.state === 'healthy').length,
      display: healthLabel(health.overall),
      caption: 'Örnek veriyle üretilir',
      icon: 'activity',
      link: null,
      tone: health.overall === 'healthy' ? 'success' : health.overall === 'degraded' ? 'warning' : 'danger',
    },
  ];

  return {
    metrics,
    health,
    userGrowth: cumulativeSeries(db, now, (item) => item.createdAt, 'users'),
    loginActivity: dailyCount(
      db.collection('loginEvents').filter((event) => event.success).map((event) => event.at),
      now,
    ),
    examActivity: dailyCount(
      db
        .collection('attempts')
        .all()
        .map((attempt) => attempt.submittedAt),
      now,
    ),
    courseActivity: dailyCount(
      db
        .collection('contentProgress')
        .all()
        .map((item) => item.lastAccessedAt)
        .filter((value): value is string => typeof value === 'string'),
      now,
    ),
    questionGrowth: cumulativeSeries(db, now, (item) => item.createdAt, 'questions'),
    generatedAt: new Date(now).toISOString(),
  };
}

function metric(
  key: string,
  label: string,
  value: number,
  caption: string,
  icon: AdminMetric['icon'],
  link: string | null,
): AdminMetric {
  return { key, label, value, display: null, caption, icon, link, tone: 'neutral' };
}

function healthLabel(state: HealthState): string {
  return state === 'healthy' ? 'Sağlıklı' : state === 'degraded' ? 'Yavaş' : 'Kapalı';
}

/**
 * Sistem sağlığı — ÖRNEK veri.
 *
 * Bu proje tarayıcıda çalışan bir mock üzerine kuruludur: gerçek bir sunucu,
 * veritabanı sunucusu veya disk yoktur. Değerler yine de UYDURULMAZ; ölçülebilen
 * şeylerden türetilir (kayıt sayısı, açık oturum sayısı). Böylece pano veri
 * büyüdükçe anlamlı biçimde değişir ve tamamen sahte bir gösterge olmaz.
 */
function buildHealth(context: MockContext): SystemHealth {
  const db = context.db;
  const now = context.now;

  const openSessions = db
    .collection('sessions')
    .filter((session) => session.state === 'IN_PROGRESS').length;

  const recordCount = db.collection('attempts').all().length + db.collection('questions').all().length;

  // Depolama, kayıt sayısından türetilir: veri büyüdükçe gösterge de yükselir.
  const storagePercent = Math.min(95, Math.round((recordCount / 40) + 12));

  const components: readonly HealthComponent[] = [
    {
      key: 'server',
      label: 'Uygulama sunucusu',
      state: 'healthy',
      detail: 'Tarayıcı içi mock çalışıyor',
      icon: 'cloud',
      usagePercent: null,
    },
    {
      key: 'database',
      label: 'Veritabanı',
      state: 'healthy',
      detail: `${db.collection('users').all().length} kullanıcı kaydı okunabilir`,
      icon: 'database',
      usagePercent: null,
    },
    {
      key: 'api',
      label: 'API',
      state: 'healthy',
      detail: 'Tüm uçlar yanıt veriyor',
      icon: 'workflow',
      usagePercent: null,
    },
    {
      key: 'storage',
      label: 'Depolama',
      state: storagePercent > 85 ? 'degraded' : 'healthy',
      detail: `${recordCount} kayıt saklanıyor`,
      icon: 'archive',
      usagePercent: storagePercent,
    },
    {
      key: 'sessions',
      label: 'Açık sınav oturumu',
      state: 'healthy',
      detail: openSessions === 0 ? 'Devam eden oturum yok' : `${openSessions} oturum sürüyor`,
      icon: 'timer',
      usagePercent: null,
    },
  ];

  const overall: HealthState = components.some((component) => component.state === 'down')
    ? 'down'
    : components.some((component) => component.state === 'degraded')
      ? 'degraded'
      : 'healthy';

  return {
    overall,
    components,
    activeSessions: openSessions,
    checkedAt: new Date(now).toISOString(),
    sampleNote:
      'Sistem sağlığı örnek veridir: bu projede gerçek bir sunucu, veritabanı sunucusu veya disk izlenmez.',
  };
}

/* ── Seri yardımcıları ───────────────────────────────────────────────────── */

function dayKeys(nowMs: number): string[] {
  return Array.from({ length: TREND_DAYS }, (_, index) => {
    const day = new Date(nowMs - (TREND_DAYS - 1 - index) * 86_400_000);
    return day.toISOString().slice(0, 10);
  });
}

function dailyCount(timestamps: readonly string[], nowMs: number): TimeSeriesPoint[] {
  const counts = new Map<string, number>();

  for (const value of timestamps) {
    const key = value.slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return dayKeys(nowMs).map((date) => {
    const value = counts.get(date) ?? 0;
    return { date, value, sampleSize: value };
  });
}

/**
 * Birikimli seri (kullanıcı ve soru büyümesi).
 *
 * Günlük yeni kayıt değil, O GÜNE KADARKİ TOPLAM gösterilir: "büyüme" grafiği
 * günlük sayımla çizilseydi, kayıt eklenmeyen günlerde sıfıra düşer ve
 * platformun küçüldüğü izlenimi verirdi.
 */
function cumulativeSeries(
  db: FakeDb,
  nowMs: number,
  dateOf: (item: { createdAt: string }) => string,
  collection: 'users' | 'questions',
): TimeSeriesPoint[] {
  const created = db
    .collection(collection)
    .all()
    .map((item) => dateOf(item).slice(0, 10))
    .sort();

  return dayKeys(nowMs).map((date) => {
    const value = created.filter((item) => item <= date).length;
    return { date, value, sampleSize: value };
  });
}
