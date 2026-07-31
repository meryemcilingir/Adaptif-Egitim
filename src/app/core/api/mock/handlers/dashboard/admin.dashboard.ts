import {
  CategoryValue,
  RankedEntry,
  TimeSeriesPoint,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import { ROLE_LABELS, Role, ROLES } from '../../../../auth/permission.model';
import { AUDIT_ACTION_LABELS, AuditAction } from '../../../../observability/audit.model';
import {
  AdminDashboard,
  QuickAction,
  StatisticEntry,
  SystemHealthEntry,
} from '../../../../../features/adaptive-learning/models/dashboard.model';
import { COLLECTION_NAMES } from '../../db/db-schema';
import {
  DashboardScope,
  buildNotifications,
  buildRecentActivity,
  kpi,
  percent,
} from './dashboard-context';

/** Koleksiyon adlarının okunabilir karşılıkları — depolama dağılımı listesinde kullanılır. */
const COLLECTION_LABELS: Partial<Record<string, string>> = {
  users: 'Kullanıcılar',
  courses: 'Dersler',
  outcomes: 'Kazanımlar',
  contents: 'İçerikler',
  contentProgress: 'İçerik ilerlemesi',
  questions: 'Sorular',
  questionVersions: 'Soru versiyonları',
  exams: 'Sınavlar',
  attempts: 'Sınav denemeleri',
  masteryScores: 'Ustalık skorları',
  recommendations: 'Öneriler',
  itemAnalyses: 'Madde analizleri',
  auditEvents: 'Denetim kayıtları',
  notifications: 'Bildirimler',
};

/**
 * Platform yöneticisi paneli: kullanıcı dağılımı, denetim akışı ve sistem durumu.
 * Tek rol olarak tüm veriye erişir; bu yüzden kapsam daraltması uygulanmaz.
 */
export function buildAdminDashboard(scope: DashboardScope): AdminDashboard {
  const { db, caller } = scope;

  const users = db.collection('users').all();
  const auditEvents = db.collection('auditEvents').all();
  const sessions = db.collection('sessions').all();
  const activeSessions = sessions.filter((session) => session.state === 'IN_PROGRESS');

  const auditTrend = buildAuditTrend(auditEvents);

  return {
    role: 'PLATFORM_ADMIN',
    generatedAt: scope.nowIso,
    headline: 'Platform durumu',
    subline: `${users.length} kullanıcı · ${auditEvents.length} denetim kaydı`,

    kpis: [
      kpi({
        key: 'users',
        label: 'Toplam kullanıcı',
        value: users.length,
        icon: 'users',
        caption: `${users.filter((user) => user.state === 'ACTIVE').length} aktif hesap`,
        series: buildUsersByRole(users).map((entry) => entry.value),
      }),
      kpi({
        key: 'audit',
        label: 'Denetim kaydı',
        value: auditEvents.length,
        icon: 'scroll-text',
        caption: 'Tüm kritik işlemler kayıt altında',
        series: auditTrend.map((point) => point.value),
      }),
      kpi({
        key: 'active-sessions',
        label: 'Aktif sınav oturumu',
        value: activeSessions.length,
        icon: 'timer',
        caption: `${sessions.length} toplam oturum kaydı`,
        series: [activeSessions.length],
      }),
      kpi({
        key: 'courses',
        label: 'Ders sayısı',
        value: scope.courses.length,
        icon: 'library',
        caption: `${db.collection('programs').count()} program`,
        series: scope.courses.map((course) => course.enrolledCount),
      }),
    ],

    quickActions: buildQuickActions(auditEvents.length),
    notifications: buildNotifications(db, caller.userId),
    recentActivity: buildRecentActivity(db, () => true, 6),
    statistics: buildStatistics(scope, users.length, auditEvents.length),

    usersByRole: buildUsersByRole(users),
    auditByAction: buildAuditByAction(auditEvents),
    auditTrend,
    systemHealth: buildSystemHealth(scope, activeSessions.length),
    recentAudit: buildRecentActivity(db, () => true, 10),
    storageBreakdown: buildStorageBreakdown(scope),
  };
}

function buildQuickActions(auditCount: number): QuickAction[] {
  return [
    {
      id: 'audit-log',
      label: 'Denetim kaydı',
      description: 'Tüm kritik işlemler',
      icon: 'scroll-text',
      link: '/audit-log',
      badge: auditCount > 0 ? auditCount : null,
      tone: 'primary',
    },
    {
      id: 'dev-tools',
      label: 'Geliştirici paneli',
      description: 'Gecikme, hata ve çevrimdışı senaryoları',
      icon: 'database',
      link: '/dev-tools',
      badge: null,
      tone: 'info',
    },
    {
      id: 'cohort-analytics',
      label: 'Cohort analitiği',
      description: 'Program genelinde karşılaştırma',
      icon: 'users',
      link: '/cohort-analytics',
      badge: null,
      tone: 'neutral',
    },
    {
      id: 'item-analysis',
      label: 'Madde analizi',
      description: 'Soru kalitesi göstergeleri',
      icon: 'microscope',
      link: '/item-analysis',
      badge: null,
      tone: 'neutral',
    },
  ];
}

function buildUsersByRole(users: readonly { roles: readonly Role[] }[]): CategoryValue[] {
  return ROLES.map((role) => ({
    label: ROLE_LABELS[role],
    value: users.filter((user) => user.roles.includes(role)).length,
  })).filter((entry) => entry.value > 0);
}

function buildAuditByAction(events: readonly { action: AuditAction }[]): CategoryValue[] {
  const counts = new Map<AuditAction, number>();
  for (const event of events) {
    counts.set(event.action, (counts.get(event.action) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([action, value]) => ({ label: AUDIT_ACTION_LABELS[action] ?? action, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
}

function buildAuditTrend(events: readonly { createdAt: string }[]): TimeSeriesPoint[] {
  const buckets = new Map<string, number>();
  for (const event of events) {
    const key = event.createdAt.slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-14)
    .map(([date, value]) => ({ date, value, sampleSize: value }));
}

function buildSystemHealth(scope: DashboardScope, activeSessions: number): SystemHealthEntry[] {
  const draftCourses = scope.courses.filter((course) => course.state !== 'PUBLISHED').length;
  const orphanQuestions = scope.db
    .collection('questions')
    .count((question) => question.outcomeIds.length === 0);
  const flagged = scope.db.collection('itemAnalyses').count((item) => item.flags.length > 0);

  return [
    {
      label: 'Veri bütünlüğü',
      value: orphanQuestions === 0 ? 'Sorunsuz' : `${orphanQuestions} kopuk kayıt`,
      tone: orphanQuestions === 0 ? 'success' : 'danger',
      hint: 'Kazanıma bağlanmamış sorular',
    },
    {
      label: 'Aktif oturum',
      value: String(activeSessions),
      tone: activeSessions > 0 ? 'info' : 'neutral',
      hint: 'Devam eden sınav oturumları',
    },
    {
      label: 'Yayın bekleyen ders',
      value: String(draftCourses),
      tone: draftCourses > 0 ? 'warning' : 'success',
      hint: 'Taslak veya incelemede',
    },
    {
      label: 'İnceleme bekleyen madde',
      value: String(flagged),
      tone: flagged > 0 ? 'warning' : 'success',
      hint: 'Kalite eşiği dışında kalan sorular',
    },
  ];
}

/** Koleksiyon büyüklüklerinin göreli dağılımı — veri hacmini görünür kılar. */
function buildStorageBreakdown(scope: DashboardScope): RankedEntry[] {
  const counts = COLLECTION_NAMES.map((name) => ({
    name,
    count: scope.db.collection(name).count(),
  }));

  const max = Math.max(1, ...counts.map((entry) => entry.count));

  return counts
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map((entry) => ({
      id: entry.name,
      label: COLLECTION_LABELS[entry.name] ?? entry.name,
      sublabel: `${entry.count} kayıt`,
      value: entry.count,
      unit: '',
      ratio: percent(entry.count, max),
      tone: 'info',
    }));
}

function buildStatistics(
  scope: DashboardScope,
  userCount: number,
  auditCount: number,
): StatisticEntry[] {
  return [
    {
      label: 'Kullanıcı başına denetim kaydı',
      value: (auditCount / Math.max(1, userCount)).toFixed(1),
      hint: 'İşlem yoğunluğu göstergesi',
    },
    {
      label: 'Toplam kayıt',
      value: String(
        COLLECTION_NAMES.reduce((sum, name) => sum + scope.db.collection(name).count(), 0),
      ),
      hint: 'Tüm koleksiyonlar',
    },
    {
      label: 'Sınav denemesi',
      value: String(scope.db.collection('attempts').count()),
      hint: 'Tamamlanmış oturum sonuçları',
    },
    {
      label: 'Soru bankası',
      value: String(scope.db.collection('questions').count()),
      hint: 'Tüm durumlar dâhil',
    },
  ];
}
