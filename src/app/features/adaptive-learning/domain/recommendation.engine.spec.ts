import { describe, expect, it } from 'vitest';

import { ContentItem, ContentProgress, ContentType } from '../models/content-item.model';
import { RecommendationRule } from '../models/recommendation.model';
import { RecommendationContext, recommend } from './recommendation.engine';

/**
 * Öneri motoru testleri.
 *
 * Her kural için "tetiklendi mi" ve "gerekçe doğru mu" ayrı ayrı doğrulanır;
 * gerekçe metni kullanıcıya gösterildiği için sözleşmenin parçasıdır (BR-16).
 */

const NOW = '2026-03-10T09:00:00.000Z';

function content(overrides: Partial<ContentItem> & { id: string; type: ContentType }): ContentItem {
  return {
    title: `İçerik ${overrides.id}`,
    description: '',
    thumbnailUrl: null,
    courseId: 'crs1',
    outcomeId: 'out1',
    difficulty: 'medium',
    level: 'understand',
    estimatedDurationMinutes: 20,
    tags: [],
    state: 'PUBLISHED',
    authorId: 'usr1',
    authorName: 'Eğitmen',
    resourceUrl: null,
    publishedAt: NOW,
    archivedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    createdBy: 'usr1',
    updatedBy: 'usr1',
    ...overrides,
  };
}

function progress(overrides: Partial<ContentProgress> & { contentId: string }): ContentProgress {
  return {
    id: `prg_${overrides.contentId}`,
    studentId: 'std1',
    state: 'not_started',
    completionPercent: 0,
    spentMinutes: 0,
    startedAt: null,
    completedAt: null,
    lastAccessedAt: null,
    scorePercent: null,
    ...overrides,
  };
}

function context(overrides: Partial<RecommendationContext> = {}): RecommendationContext {
  return {
    studentId: 'std1',
    courseId: 'crs1',
    courseCode: 'BLM101',
    contents: [],
    progressByContent: new Map(),
    outcomes: [{ id: 'out1', code: 'BLM101.K1', title: 'Değişkenler', order: 0 }],
    mastery: new Map(),
    prerequisites: new Map(),
    upcomingExamOutcomeIds: [],
    daysUntilExam: null,
    nowIso: NOW,
    ...overrides,
  };
}

function rules(
  recommendations: readonly { reasons: readonly { rule: RecommendationRule }[] }[],
): RecommendationRule[] {
  return recommendations.flatMap((item) => item.reasons.map((reason) => reason.rule));
}

describe('recommend', () => {
  it('düşük ustalıkta anlatım içeriği önerir', () => {
    const video = content({ id: 'c1', type: 'video' });

    const result = recommend(context({ contents: [video], mastery: new Map([['out1', 30]]) }));

    expect(result).toHaveLength(1);
    expect(rules(result)).toContain('low_mastery_watch');
    expect(result[0]!.reasons[0]!.explanation).toContain('%30');
  });

  it('orta ustalıkta ölçme içeriği önerir', () => {
    const quiz = content({ id: 'c1', type: 'quiz' });

    const result = recommend(context({ contents: [quiz], mastery: new Map([['out1', 55]]) }));

    expect(rules(result)).toContain('mid_mastery_practice');
  });

  it('başarısız değerlendirmeden sonra kolay içerik önerir', () => {
    const failedQuiz = content({ id: 'c1', type: 'quiz' });
    const easyVideo = content({ id: 'c2', type: 'video', difficulty: 'easy' });

    const result = recommend(
      context({
        contents: [failedQuiz, easyVideo],
        mastery: new Map([['out1', 35]]),
        progressByContent: new Map([
          [
            'c1',
            progress({
              contentId: 'c1',
              state: 'completed',
              completionPercent: 100,
              scorePercent: 42,
              completedAt: NOW,
            }),
          ],
        ]),
      }),
    );

    const easy = result.find((item) => item.targetId === 'c2');
    expect(easy).toBeDefined();

    const reason = easy!.reasons.find((item) => item.rule === 'failed_assessment');
    expect(reason).toBeDefined();
    expect(reason!.explanation).toContain('%42');
  });

  it('tamamlanmış içeriği tekrar önermez', () => {
    const video = content({ id: 'c1', type: 'video' });

    const result = recommend(
      context({
        contents: [video],
        mastery: new Map([['out1', 20]]),
        progressByContent: new Map([
          ['c1', progress({ contentId: 'c1', state: 'completed', completionPercent: 100 })],
        ]),
      }),
    );

    expect(result).toHaveLength(0);
  });

  it('yarım kalan içeriği devam gerekçesiyle öne çıkarır', () => {
    const video = content({ id: 'c1', type: 'video' });

    const result = recommend(
      context({
        contents: [video],
        mastery: new Map([['out1', 75]]),
        progressByContent: new Map([
          ['c1', progress({ contentId: 'c1', state: 'in_progress', completionPercent: 40 })],
        ]),
      }),
    );

    expect(rules(result)).toContain('incomplete_content');
  });

  it('önkoşulu eksik kazanımın içeriğini önermez', () => {
    const locked = content({ id: 'c1', type: 'video', outcomeId: 'out2' });

    const result = recommend(
      context({
        contents: [locked],
        outcomes: [
          { id: 'out1', code: 'BLM101.K1', title: 'Değişkenler', order: 0 },
          { id: 'out2', code: 'BLM101.K2', title: 'Döngüler', order: 1 },
        ],
        prerequisites: new Map([['out2', ['out1']]]),
        mastery: new Map([['out1', 30]]),
      }),
    );

    expect(result.every((item) => item.targetId !== 'c1')).toBe(true);
  });

  it('yüksek ustalıkta sonraki kazanıma geçişi önerir', () => {
    const result = recommend(
      context({
        outcomes: [
          { id: 'out1', code: 'BLM101.K1', title: 'Değişkenler', order: 0 },
          { id: 'out2', code: 'BLM101.K2', title: 'Döngüler', order: 1 },
        ],
        mastery: new Map([['out1', 90]]),
      }),
    );

    const advance = result.find((item) => item.kind === 'outcome');
    expect(advance).toBeDefined();
    expect(advance!.targetId).toBe('out2');
    expect(advance!.reasons[0]!.rule).toBe('high_mastery_advance');
  });

  it('uzun süredir çalışılmayan kazanım için tekrar gerekçesi ekler', () => {
    const video = content({ id: 'c1', type: 'video' });
    const stale = new Date(Date.parse(NOW) - 12 * 86_400_000).toISOString();

    const result = recommend(
      context({
        contents: [video],
        mastery: new Map([['out1', 30]]),
        progressByContent: new Map([
          ['c1', progress({ contentId: 'c1', state: 'in_progress', lastAccessedAt: stale })],
        ]),
      }),
    );

    expect(rules(result)).toContain('spaced_repetition');
  });

  it('yaklaşan sınav kapsamındaki kazanımın önceliğini artırır', () => {
    const video = content({ id: 'c1', type: 'video' });
    const base = { contents: [video], mastery: new Map([['out1', 30]]) };

    const withoutExam = recommend(context(base));
    const withExam = recommend(
      context({ ...base, upcomingExamOutcomeIds: ['out1'], daysUntilExam: 3 }),
    );

    expect(withExam[0]!.priority).toBeGreaterThan(withoutExam[0]!.priority);
    expect(rules(withExam)).toContain('exam_upcoming');
  });

  it('yayınlanmamış içeriği önermez', () => {
    const draft = content({ id: 'c1', type: 'video', state: 'DRAFT' });

    expect(
      recommend(context({ contents: [draft], mastery: new Map([['out1', 10]]) })),
    ).toHaveLength(0);
  });

  it('aynı kazanımdan en fazla iki içerik önerir', () => {
    const contents = ['c1', 'c2', 'c3', 'c4'].map((id) => content({ id, type: 'video' }));

    const result = recommend(context({ contents, mastery: new Map([['out1', 20]]) }));

    expect(result.filter((item) => item.outcomeId === 'out1')).toHaveLength(2);
  });
});
