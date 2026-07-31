import { AuditAction } from '../../../../observability/audit.model';
import {
  COGNITIVE_LEVELS,
  DIFFICULTIES,
  PublishState,
} from '../../../../../features/adaptive-learning/models/common.model';
import {
  CONTENT_LIMITS,
  CONTENT_TYPES,
  ContentItem,
} from '../../../../../features/adaptive-learning/models/content-item.model';
import { equals, inList, includesId } from '../../db/query-engine';
import { businessRule } from '../../mock-errors';
import { isWithinScope, scopeOf } from '../../mock-auth';
import { MockCaller, MockContext, MockHandler } from '../../mock-router';
import { createCrudHandlers, diffFields } from '../crud/crud-handlers';
import { FieldValidator, readNumber, readStringArray, readText } from '../crud/field-validator';
import { recalculateCourseCounters } from './course.handlers';

const TRANSITION_ACTIONS: Readonly<Record<PublishState, AuditAction>> = {
  DRAFT: 'content.restored',
  REVIEW: 'content.updated',
  PUBLISHED: 'content.published',
  ARCHIVED: 'content.archived',
};

/**
 * İçerik uç noktaları: CRUD + yayın iş akışı.
 *
 * Ortak davranış `createCrudHandlers`'tan gelir; burada yalnızca içeriğe özgü
 * doğrulama, kapsam ve bütünlük kuralları tanımlıdır (Open/Closed).
 */
export const CONTENT_HANDLERS: readonly MockHandler[] = createCrudHandlers<ContentItem>({
  collection: 'contents',
  basePath: '/api/contents',
  entityLabel: 'İçerik',
  auditType: 'ContentItem',
  permissions: {
    read: 'content:read',
    write: 'content:write',
    publish: 'content:write',
  },

  query: () => ({
    searchable: (content: ContentItem) => [
      content.title,
      content.description,
      content.authorName,
      ...content.tags,
    ],
    filters: {
      courseId: equals<ContentItem>((content) => content.courseId),
      outcomeId: equals<ContentItem>((content) => content.outcomeId),
      type: inList<ContentItem>((content) => content.type),
      difficulty: inList<ContentItem>((content) => content.difficulty),
      level: inList<ContentItem>((content) => content.level),
      state: inList<ContentItem>((content) => content.state),
      authorId: equals<ContentItem>((content) => content.authorId),
      tags: includesId<ContentItem>((content) => content.tags),
    },
    sorters: {
      estimatedDurationMinutes: (content) => content.estimatedDurationMinutes,
      type: (content) => content.type,
      difficulty: (content) => content.difficulty,
    },
    defaultSort: { field: 'updatedAt', direction: 'desc' },
  }),

  scope: isContentVisible,

  labelOf: (content) => content.title,

  create: (context, caller) => {
    validate(context);

    const author = context.db.collection('users').findById(caller.userId);
    const now = new Date(context.now).toISOString();

    return {
      id: `cnt_${context.now.toString(36)}`,
      ...writableFields(context),
      state: 'DRAFT',
      authorId: caller.userId,
      authorName: author?.fullName ?? 'Bilinmiyor',
      publishedAt: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      version: 1,
      createdBy: caller.userId,
      updatedBy: caller.userId,
    };
  },

  update: (existing, context, caller) => {
    validate(context);

    return {
      ...existing,
      ...writableFields(context),
      version: existing.version + 1,
      updatedAt: new Date(context.now).toISOString(),
      updatedBy: caller.userId,
    };
  },

  changesOf: (before, after) =>
    diffFields(before, after, [
      { key: 'title', label: 'Başlık' },
      { key: 'description', label: 'Açıklama' },
      { key: 'type', label: 'İçerik türü' },
      { key: 'courseId', label: 'Ders' },
      { key: 'outcomeId', label: 'Kazanım' },
      { key: 'difficulty', label: 'Zorluk' },
      { key: 'level', label: 'Bilişsel seviye' },
      { key: 'estimatedDurationMinutes', label: 'Tahmini süre (dk)' },
      { key: 'tags', label: 'Etiketler' },
      { key: 'resourceUrl', label: 'Kaynak adresi' },
      { key: 'thumbnailUrl', label: 'Kapak görseli' },
    ]),

  assertDeletable: (content, context) => {
    // Öğrenci ilerlemesi olan içerik silinmez; geçmiş veri kopmasın diye arşivlenir.
    const progressCount = context.db
      .collection('contentProgress')
      .count((item) => item.contentId === content.id);

    if (progressCount > 0) {
      throw businessRule(
        `Bu içerikte ${progressCount} öğrenci ilerlemesi var. Silmek yerine arşivleyin.`,
        { progressCount },
      );
    }
  },

  assertPublishable: (content, context) => {
    const outcome = context.db.collection('outcomes').findById(content.outcomeId);

    if (!outcome) {
      throw businessRule('İçeriğin bağlı olduğu kazanım bulunamadı. Önce kazanımı seçin.');
    }
    if (outcome.state !== 'PUBLISHED') {
      throw businessRule(
        `"${outcome.code}" kazanımı henüz yayınlanmadı. Önce kazanımı yayına alın.`,
        { outcomeId: outcome.id, outcomeState: outcome.state },
      );
    }
  },

  auditActions: {
    created: 'content.created',
    updated: 'content.updated',
    deleted: 'content.deleted',
    transition: (target) => TRANSITION_ACTIONS[target],
  },

  afterChange: (context) => recalculateContentCounters(context),
});

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

/**
 * İçerik kapsam kuralı — liste, detay ve öğrenme uç noktalarının ORTAK yüklemi.
 *
 *  · Öğrenci: kayıtlı olduğu derslerin YALNIZCA yayındaki içerikleri
 *    (taslak içerik öğrenciye hiç ulaşmaz).
 *  · Eğitmen: sorumlu olduğu derslerin içerikleri + kendi yazdığı içerikler.
 *  · Program/global kapsam: tümü.
 */
export function isContentVisible(caller: MockCaller, content: ContentItem): boolean {
  if (scopeOf(caller) === 'own' && content.state !== 'PUBLISHED') return false;

  return (
    isWithinScope(caller, { courseId: content.courseId }) ||
    isWithinScope(caller, { ownerId: content.authorId })
  );
}

/** Gövdeden okunan, kullanıcı tarafından düzenlenebilir alanlar (create/update ortak). */
function writableFields(context: MockContext) {
  const body = context.body;

  return {
    title: readText(body, 'title'),
    description: readText(body, 'description'),
    thumbnailUrl: readText(body, 'thumbnailUrl') || null,
    type: readText(body, 'type') as ContentItem['type'],
    courseId: readText(body, 'courseId'),
    outcomeId: readText(body, 'outcomeId'),
    difficulty: readText(body, 'difficulty') as ContentItem['difficulty'],
    level: readText(body, 'level') as ContentItem['level'],
    estimatedDurationMinutes: readNumber(body, 'estimatedDurationMinutes'),
    tags: readStringArray(body, 'tags'),
    resourceUrl: readText(body, 'resourceUrl') || null,
  };
}

function validate(context: MockContext): void {
  const body = context.body as Record<string, unknown> | null;
  const outcomes = context.db.collection('outcomes');
  const courseId = readText(body, 'courseId');

  new FieldValidator(body)
    .text('title', 'İçerik başlığı', CONTENT_LIMITS.title)
    .text('description', 'Açıklama', CONTENT_LIMITS.description, { required: false })
    .oneOf('type', 'İçerik türü', CONTENT_TYPES)
    .reference(
      'courseId',
      'Ders',
      (id) => context.db.collection('courses').findById(id) !== undefined,
    )
    .reference('outcomeId', 'Kazanım', (id) => outcomes.findById(id) !== undefined)
    // Kazanım ile ders tutarlı olmalı; aksi hâlde öğrenme yolu kopar.
    .custom(
      'outcomeId',
      'Seçilen kazanım, seçilen derse ait değil.',
      outcomes.findById(readText(body, 'outcomeId'))?.courseId === courseId,
    )
    .oneOf('difficulty', 'Zorluk', DIFFICULTIES)
    .oneOf('level', 'Bilişsel seviye', COGNITIVE_LEVELS)
    .integer('estimatedDurationMinutes', 'Tahmini süre', CONTENT_LIMITS.estimatedDurationMinutes)
    .tags('tags', 'Etiket', {
      max: CONTENT_LIMITS.tagCount.max,
      itemMax: CONTENT_LIMITS.tag.max,
    })
    .url('thumbnailUrl', 'Kapak görseli adresi', CONTENT_LIMITS.url)
    .url('resourceUrl', 'Kaynak adresi', CONTENT_LIMITS.url, {
      required: readText(body, 'type') === 'external_link',
    })
    .assert();
}

/** Ders ve kazanım içerik sayaçlarını gerçek veriden yeniden hesaplar. */
export function recalculateContentCounters(context: MockContext): void {
  const contents = context.db.collection('contents').all();
  const outcomes = context.db.collection('outcomes');

  for (const outcome of outcomes.all()) {
    const count = contents.filter((content) => content.outcomeId === outcome.id).length;
    if (count !== outcome.contentCount) outcomes.update(outcome.id, { contentCount: count });
  }

  recalculateCourseCounters(context);
}
