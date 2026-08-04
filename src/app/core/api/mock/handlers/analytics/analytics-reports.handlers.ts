import {
  CompareKind,
  OutcomeAnalytics,
  REPORT_LIMITS,
  SavedReport,
} from '../../../../../features/adaptive-learning/models/analytics.model';
import { validateRange } from '../../../../../features/adaptive-learning/domain/analytics-range';
import { requirePermission } from '../../mock-auth';
import { businessRule, notFound, validation } from '../../mock-errors';
import { MockContext, MockHandler, created, noContent, ok } from '../../mock-router';
import { buildComparison } from './compare.report';
import { buildCohortAnalytics, buildMasteryMatrix, buildOutcomeAnalytics } from './cohort.report';
import {
  buildDifficultyAnalytics,
  buildTrends,
  buildVelocityAnalytics,
} from './difficulty.report';
import { buildOverview } from './overview.report';
import { buildRecommendationAnalytics } from './recommendation.report';
import { ReportFilters, buildReportScope, performerRows, readFilters } from './report-context';
import { buildStudentAnalytics } from './student.report';

/**
 * Analitik rapor uç noktaları (Sprint 8).
 *
 * Hepsi AYNI şablonu izler: yetki → filtre okuma → doğrulama → kapsam kurma →
 * rapor üretme. Bu şablon `withScope()` içinde tek yerde durur; her uç kendi
 * yetki kontrolünü ve kapsam kurulumunu tekrar yazsaydı, birinde unutulan bir
 * kontrol veri sızıntısına dönüşürdü.
 */

type ReportBuilder<T> = (context: MockContext, filters: ReportFilters) => T;

/**
 * Ortak sarmalayıcı.
 *
 * Tarih aralığı GEÇERSİZSE rapor üretilmez (§23): kullanıcıya 400 döner ve
 * ekran hatayı alan bazında gösterir. Sessizce varsayılana düşmek, kullanıcının
 * yanlış aralıkla doğru sandığı bir rapora bakmasına yol açardı.
 */
function withScope<T>(
  permission: Parameters<typeof requirePermission>[1],
  build: (scope: ReturnType<typeof buildReportScope>, context: MockContext, filters: ReportFilters) => T,
): ReportBuilder<T> {
  return (context, filters) => {
    const caller = requirePermission(context, permission);
    const issues = validateRange(filters.selection, context.now);

    if (issues.length > 0) {
      throw validation(
        'Seçilen tarih aralığı geçersiz.',
        issues.map((issue) => ({ field: issue.field, message: issue.message })),
      );
    }

    const scope = buildReportScope(context, caller, filters);
    return build(scope, context, filters);
  };
}

export const ANALYTICS_REPORT_HANDLERS: readonly MockHandler[] = [
  {
    /** Genel bakış: 10 KPI, içgörüler, trendler, performans panoları. */
    method: 'GET',
    path: '/api/analytics/overview',
    handle: (context) =>
      ok(withScope('analytics:student', (scope) => buildOverview(scope))(context, readFilters(context))),
  },

  {
    method: 'GET',
    path: '/api/analytics/students/:id',
    handle: (context) => {
      const filters = readFilters(context);
      const studentId = context.params['id'] ?? '';

      const report = withScope('analytics:student', (scope) =>
        buildStudentAnalytics(scope, studentId),
      )(context, { ...filters, studentId });

      /*
       * Kapsam dışı öğrenci "bulunamadı" olarak döner, "yetkiniz yok" olarak
       * değil: ikincisi, o kimliğe sahip bir öğrencinin VAR OLDUĞUNU doğrular
       * ve kimlik numarası deneyerek bilgi toplanmasına imkân verirdi.
       */
      if (!report) throw notFound('Öğrenci analizi');
      return ok(report);
    },
  },

  {
    method: 'GET',
    path: '/api/analytics/cohorts/:id',
    handle: (context) => {
      const cohortId = context.params['id'] ?? '';

      const report = withScope('analytics:cohort', (scope) =>
        buildCohortAnalytics(scope, cohortId),
      )(context, readFilters(context));

      if (!report) throw notFound('Grup analizi');
      return ok(report);
    },
  },

  {
    /** Kazanım analitiği — sayfalama bellekte, çünkü satırlar türetilmiştir. */
    method: 'GET',
    path: '/api/analytics/outcomes',
    handle: (context) => {
      const rows = withScope('analytics:cohort', (scope) => buildOutcomeAnalytics(scope))(
        context,
        readFilters(context),
      );

      return ok(paginate(rows, context));
    },
  },

  {
    method: 'GET',
    path: '/api/analytics/mastery-matrix',
    handle: (context) =>
      ok(
        withScope('analytics:student', (scope) => buildMasteryMatrix(scope))(
          context,
          readFilters(context),
        ),
      ),
  },

  {
    method: 'GET',
    path: '/api/analytics/difficulty',
    handle: (context) =>
      ok(
        withScope('analytics:item', (scope) => buildDifficultyAnalytics(scope))(
          context,
          readFilters(context),
        ),
      ),
  },

  {
    method: 'GET',
    path: '/api/analytics/trends',
    handle: (context) =>
      ok(
        withScope('analytics:student', (scope) => buildTrends(scope))(
          context,
          readFilters(context),
        ),
      ),
  },

  {
    method: 'GET',
    path: '/api/analytics/recommendation-performance',
    handle: (context) =>
      ok(
        withScope('analytics:student', (scope) => buildRecommendationAnalytics(scope))(
          context,
          readFilters(context),
        ),
      ),
  },

  {
    method: 'GET',
    path: '/api/analytics/velocity',
    handle: (context) =>
      ok(
        withScope('analytics:cohort', (scope) => buildVelocityAnalytics(scope))(
          context,
          readFilters(context),
        ),
      ),
  },

  {
    method: 'GET',
    path: '/api/analytics/performers',
    handle: (context) =>
      ok(
        withScope('analytics:cohort', (scope) => performerRows(scope, 10))(
          context,
          readFilters(context),
        ),
      ),
  },

  {
    /**
     * Karşılaştırma.
     *
     * En az iki, en fazla dört taraf: tek tarafla karşılaştırma anlamsız,
     * dörtten fazlası grafiği okunamaz hâle getirir.
     */
    method: 'GET',
    path: '/api/analytics/compare',
    handle: (context) => {
      const kind = (context.query.get('kind') ?? 'student') as CompareKind;
      const ids = (context.query.get('ids') ?? '').split(',').filter(Boolean);

      if (ids.length < 2) {
        throw businessRule('Karşılaştırma için en az iki kayıt seçilmelidir.');
      }
      if (ids.length > 4) {
        throw businessRule('Aynı anda en fazla dört kayıt karşılaştırılabilir.');
      }

      return ok(
        withScope('analytics:cohort', (scope) => buildComparison(scope, kind, ids))(
          context,
          readFilters(context),
        ),
      );
    },
  },

  /* ── Kayıtlı raporlar (§17, §18, §19) ─────────────────────────────────── */

  {
    method: 'GET',
    path: '/api/analytics/saved-reports',
    handle: (context) => {
      const caller = requirePermission(context, 'analytics:student');

      return ok(
        context.db
          .collection('savedReports')
          .filter((report) => report.ownerId === caller.userId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      );
    },
  },

  {
    method: 'POST',
    path: '/api/analytics/saved-reports',
    handle: (context) => {
      const caller = requirePermission(context, 'analytics:student');
      const body = context.body as Partial<SavedReport>;

      const name = (body.name ?? '').trim();
      assertReportName(name);

      const nowIso = new Date(context.now).toISOString();

      return created(
        context.db.collection('savedReports').insert({
          id: `rpt_${context.now.toString(36)}`,
          name,
          description: (body.description ?? '').slice(0, REPORT_LIMITS.description.max),
          ownerId: caller.userId,
          filters: body.filters ?? {},
          widgets: (body.widgets ?? []).slice(0, REPORT_LIMITS.widgets.max),
          schedule: body.schedule ?? null,
          createdAt: nowIso,
          updatedAt: nowIso,
        }),
      );
    },
  },

  {
    method: 'PUT',
    path: '/api/analytics/saved-reports/:id',
    handle: (context) => {
      const caller = requirePermission(context, 'analytics:student');
      const report = findOwnedReport(context, caller.userId);
      const body = context.body as Partial<SavedReport>;

      const name = (body.name ?? report.name).trim();
      assertReportName(name);

      return ok(
        context.db.collection('savedReports').update(report.id, {
          name,
          description: (body.description ?? report.description).slice(
            0,
            REPORT_LIMITS.description.max,
          ),
          filters: body.filters ?? report.filters,
          widgets: (body.widgets ?? report.widgets).slice(0, REPORT_LIMITS.widgets.max),
          schedule: body.schedule === undefined ? report.schedule : body.schedule,
          updatedAt: new Date(context.now).toISOString(),
        })!,
      );
    },
  },

  {
    method: 'DELETE',
    path: '/api/analytics/saved-reports/:id',
    handle: (context) => {
      const caller = requirePermission(context, 'analytics:student');
      const report = findOwnedReport(context, caller.userId);

      context.db.collection('savedReports').remove(report.id);
      return noContent();
    },
  },
];

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function assertReportName(name: string): void {
  if (name.length < REPORT_LIMITS.name.min) {
    throw businessRule(`Rapor adı en az ${REPORT_LIMITS.name.min} karakter olmalıdır.`);
  }
  if (name.length > REPORT_LIMITS.name.max) {
    throw businessRule(`Rapor adı en fazla ${REPORT_LIMITS.name.max} karakter olabilir.`);
  }
}

/** Kayıtlı rapor kişiseldir; başkasının raporu "bulunamadı" olarak döner. */
function findOwnedReport(context: MockContext, ownerId: string): SavedReport {
  const report = context.db.collection('savedReports').findById(context.params['id'] ?? '');
  if (!report || report.ownerId !== ownerId) throw notFound('Rapor');

  return report;
}

/**
 * Türetilmiş satırlar için bellek içi sayfalama.
 *
 * `QueryEngine` koleksiyonlar üzerinde çalışır; kazanım analitiği gibi anlık
 * hesaplanan satırlar için arama/sıralama/sayfalama burada uygulanır (§22).
 */
function paginate(rows: readonly OutcomeAnalytics[], context: MockContext) {
  const { search, filters, sort, page, size } = context.page;
  let result = [...rows];

  if (search) {
    const needle = search.toLocaleLowerCase('tr-TR');
    result = result.filter((row) =>
      [row.outcomeCode, row.outcomeTitle, row.courseCode]
        .join(' ')
        .toLocaleLowerCase('tr-TR')
        .includes(needle),
    );
  }

  const status = filters['status'];
  if (Array.isArray(status) && status.length > 0) {
    result = result.filter((row) => status.includes(row.status));
  }

  const field = sort?.field ?? 'masteryPercent';
  const direction = sort?.direction === 'desc' ? -1 : 1;

  result.sort((a, b) => {
    switch (field) {
      case 'outcomeCode':
        return a.outcomeCode.localeCompare(b.outcomeCode, 'tr-TR') * direction;
      case 'coveragePercent':
        return (a.coveragePercent - b.coveragePercent) * direction;
      case 'questionCount':
        return (a.questionCount - b.questionCount) * direction;
      case 'examAveragePercent':
        return (a.examAveragePercent - b.examAveragePercent) * direction;
      default:
        return (a.masteryPercent - b.masteryPercent) * direction;
    }
  });

  const start = (page - 1) * size;

  return { items: result.slice(start, start + size), total: result.length, page, size };
}
