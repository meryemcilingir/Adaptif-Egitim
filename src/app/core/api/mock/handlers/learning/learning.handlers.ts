import {
  BulkActionResult,
  CONTENT_BULK_ACTIONS,
  ContentBulkAction,
  ContentDetail,
  ContentProgress,
  OutcomeRefSummary,
  defaultProgress,
} from '../../../../../features/adaptive-learning/models/content-item.model';
import { LearningPathOverview } from '../../../../../features/adaptive-learning/models/learning-path.model';
import { evaluateUnlock } from '../../../../../features/adaptive-learning/domain/learning-rules';
import { byTypeOrder } from '../../../../../features/adaptive-learning/domain/recommendation.engine';
import {
  canTransition,
  label as stateLabel,
} from '../../../../../features/adaptive-learning/domain/publish-workflow';
import { PublishState } from '../../../../../features/adaptive-learning/models/common.model';
import { forbidden, notFound, validation } from '../../mock-errors';
import { isWithinScope, requireCaller, requirePermission } from '../../mock-auth';
import { MockContext, MockHandler, ok } from '../../mock-router';
import { isContentVisible } from '../catalog/content.handlers';
import {
  buildStudentLearningContext,
  buildStudentPaths,
  buildStudentRecommendations,
} from './learning-context';

/**
 * Öğrenme uç noktaları: öğrenme yolu, öneriler, içerik ilerlemesi ve
 * içerik listesinin toplu işlemleri.
 *
 * Öğrenme yolu ve öneriler TÜRETİLMİŞ veridir; saklanmaz, istek anında
 * `learning-context` üzerinden saf domain fonksiyonlarıyla üretilir (ADR-017).
 */
export const LEARNING_HANDLERS: readonly MockHandler[] = [
  {
    /** Öğrencinin tüm derslerindeki öğrenme yolları. `?courseId=` ile daraltılır. */
    method: 'GET',
    path: '/api/learning/path',
    handle: (context) => {
      const studentId = resolveStudentId(context);
      const learning = buildStudentLearningContext(context.db, studentId, context.now);
      const courseId = context.query.get('courseId');

      const paths = buildStudentPaths(learning).filter(
        (path) => !courseId || path.courseId === courseId,
      );

      return ok({ paths, generatedAt: learning.nowIso } satisfies LearningPathOverview);
    },
  },

  {
    method: 'GET',
    path: '/api/learning/recommendations',
    handle: (context) => {
      const studentId = resolveStudentId(context);
      const learning = buildStudentLearningContext(context.db, studentId, context.now);
      const limit = Number(context.query.get('limit') ?? 8);

      return ok(buildStudentRecommendations(learning, Number.isFinite(limit) ? limit : 8));
    },
  },

  {
    /** İçerik detay ekranı — içerik + ders + kazanım + önkoşul + ilerleme tek çağrıda. */
    method: 'GET',
    path: '/api/contents/:id/detail',
    handle: (context) => {
      const caller = requirePermission(context, 'content:read');
      const contents = context.db.collection('contents');
      const content = contents.findById(context.params['id'] ?? '');
      if (!content) throw notFound('İçerik');

      if (!isContentVisible(caller, content)) {
        throw forbidden('Bu içerik kapsamınız dışında.');
      }

      const outcomes = context.db.collection('outcomes');
      const outcome = outcomes.findById(content.outcomeId);
      const course = context.db.collection('courses').findById(content.courseId);

      const isStudent = caller.role === 'STUDENT';
      const progress =
        (isStudent
          ? context.db
              .collection('contentProgress')
              .findOne((item) => item.contentId === content.id && item.studentId === caller.userId)
          : undefined) ?? defaultProgress(content.id, caller.userId);

      // Kilit yalnızca öğrenci için anlamlıdır; eğitmen tüm içeriği görür.
      const unlock = isStudent
        ? evaluateUnlock(
            content.outcomeId,
            new Map(outcomes.all().map((item) => [item.id, item.prerequisiteIds] as const)),
            new Map(
              context.db
                .collection('masteryScores')
                .filter((score) => score.studentId === caller.userId)
                .map((score) => [score.outcomeId, score.score] as const),
            ),
          )
        : { unlocked: true, missingOutcomeIds: [] as readonly string[] };

      const detail: ContentDetail = {
        content,
        courseCode: course?.code ?? '',
        courseName: course?.name ?? '',
        outcome: outcome ? toOutcomeRef(outcome) : null,
        prerequisiteOutcomes: (outcome?.prerequisiteIds ?? [])
          .map((id) => outcomes.findById(id))
          .filter((item) => item !== undefined)
          .map(toOutcomeRef),
        progress,
        locked: !unlock.unlocked,
        lockedByLabel: unlock.unlocked
          ? null
          : unlock.missingOutcomeIds.map((id) => outcomes.findById(id)?.code ?? id).join(', '),
        relatedContents: contents
          .filter(
            (item) =>
              item.outcomeId === content.outcomeId &&
              item.id !== content.id &&
              item.state === 'PUBLISHED',
          )
          .sort(byTypeOrder),
      };

      return ok(detail);
    },
  },

  {
    /**
     * İlerleme kaydı (başlat / güncelle / tamamla).
     *
     * Tek uç nokta yeterlidir: yüzde 100 gönderildiğinde kayıt `completed` olur.
     * Böylece istemcide "başlat" ve "tamamla" için ayrı çağrı akışı kurulmaz.
     */
    method: 'PUT',
    path: '/api/contents/:id/progress',
    handle: (context) => {
      const caller = requireCaller(context);
      if (caller.role !== 'STUDENT') {
        throw forbidden('İlerleme yalnızca öğrenci hesabıyla kaydedilebilir.');
      }

      const content = context.db.collection('contents').findById(context.params['id'] ?? '');
      if (!content) throw notFound('İçerik');
      if (content.state !== 'PUBLISHED') {
        throw validation('Yayınlanmamış bir içerik için ilerleme kaydedilemez.');
      }

      const body = context.body as Record<string, unknown> | null;
      const completionPercent = clamp(Number(body?.['completionPercent'] ?? 0), 0, 100);
      const spentMinutes = Math.max(0, Math.round(Number(body?.['spentMinutes'] ?? 0)));
      const rawScore = body?.['scorePercent'];
      const scorePercent =
        rawScore === null || rawScore === undefined ? null : clamp(Number(rawScore), 0, 100);

      if (!Number.isFinite(completionPercent) || !Number.isFinite(spentMinutes)) {
        throw validation('İlerleme değerleri sayısal olmalıdır.');
      }

      const collection = context.db.collection('contentProgress');
      const existing = collection.findOne(
        (item) => item.contentId === content.id && item.studentId === caller.userId,
      );

      const nowIso = new Date(context.now).toISOString();
      const completed = completionPercent >= 100;

      const record: ContentProgress = {
        id: existing?.id ?? `prg_${context.now.toString(36)}`,
        contentId: content.id,
        studentId: caller.userId,
        state: completed ? 'completed' : 'in_progress',
        completionPercent: completed ? 100 : completionPercent,
        // Süre birikimlidir; istemci her seferinde o oturumun süresini gönderir.
        spentMinutes: (existing?.spentMinutes ?? 0) + spentMinutes,
        startedAt: existing?.startedAt ?? nowIso,
        completedAt: completed ? (existing?.completedAt ?? nowIso) : null,
        lastAccessedAt: nowIso,
        scorePercent: scorePercent ?? existing?.scorePercent ?? null,
      };

      if (existing) collection.replace(record);
      else collection.insert(record);

      return ok(record);
    },
  },

  {
    /** İçerik listesi toplu işlemleri. Başarısızlar gerekçesiyle raporlanır. */
    method: 'POST',
    path: '/api/contents/bulk',
    handle: (context) => {
      const caller = requirePermission(context, 'content:write');

      const body = context.body as { ids?: unknown; action?: unknown } | null;
      const ids = Array.isArray(body?.ids)
        ? body.ids.filter((id): id is string => typeof id === 'string')
        : [];
      const action = body?.action as ContentBulkAction;

      if (ids.length === 0) throw validation('İşlem uygulanacak içerik seçilmedi.');
      if (!CONTENT_BULK_ACTIONS.includes(action)) {
        throw validation('Geçersiz toplu işlem türü.');
      }

      const contents = context.db.collection('contents');
      const succeeded: string[] = [];
      const failed: { id: string; title: string; reason: string }[] = [];
      const nowIso = new Date(context.now).toISOString();

      for (const id of ids) {
        const content = contents.findById(id);
        if (!content) {
          failed.push({ id, title: id, reason: 'İçerik bulunamadı.' });
          continue;
        }
        if (!isContentVisible(caller, content)) {
          failed.push({ id, title: content.title, reason: 'Bu içerik kapsamınız dışında.' });
          continue;
        }

        if (action === 'delete') {
          if (content.state !== 'DRAFT') {
            failed.push({
              id,
              title: content.title,
              reason: `"${stateLabel(content.state)}" durumundaki içerik silinemez; arşivleyin.`,
            });
            continue;
          }
          const progressCount = context.db
            .collection('contentProgress')
            .count((item) => item.contentId === id);
          if (progressCount > 0) {
            failed.push({
              id,
              title: content.title,
              reason: `${progressCount} öğrenci ilerlemesi olduğu için silinemez.`,
            });
            continue;
          }

          contents.remove(id);
          succeeded.push(id);
          continue;
        }

        const target: PublishState =
          action === 'publish' ? 'PUBLISHED' : action === 'archive' ? 'ARCHIVED' : 'DRAFT';

        if (!canTransition(content.state, target)) {
          failed.push({
            id,
            title: content.title,
            reason: `"${stateLabel(content.state)}" → "${stateLabel(target)}" geçişi yapılamaz.`,
          });
          continue;
        }

        contents.update(id, {
          state: target,
          version: content.version + 1,
          updatedAt: nowIso,
          updatedBy: caller.userId,
          publishedAt: target === 'PUBLISHED' ? nowIso : content.publishedAt,
          archivedAt:
            target === 'ARCHIVED' ? nowIso : target === 'DRAFT' ? null : content.archivedAt,
        });
        succeeded.push(id);
      }

      return ok({ succeeded, failed } satisfies BulkActionResult);
    },
  },
];

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

/**
 * Öğrenme verisi kimin için üretilecek?
 *
 * Öğrenci daima kendi verisini görür. Eğitmen/koordinatör `?studentId=` ile
 * kapsamındaki bir öğrencinin yolunu inceleyebilir.
 */
function resolveStudentId(context: MockContext): string {
  const caller = requirePermission(context, 'content:read');
  const requested = context.query.get('studentId');

  if (!requested || requested === caller.userId) return caller.userId;

  if (caller.role === 'STUDENT') {
    throw forbidden('Başka bir öğrencinin öğrenme yolunu görüntüleyemezsiniz.');
  }

  const student = context.db.collection('users').findById(requested);
  if (!student) throw notFound('Öğrenci');
  if (!isWithinScope(caller, { ownerId: student.id, cohortIds: student.cohortIds })) {
    throw forbidden('Bu öğrenci kapsamınız dışında.');
  }

  return student.id;
}

function toOutcomeRef(outcome: { id: string; code: string; title: string }): OutcomeRefSummary {
  return { id: outcome.id, code: outcome.code, title: outcome.title };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
