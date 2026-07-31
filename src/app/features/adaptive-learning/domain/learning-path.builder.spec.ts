import { describe, expect, it } from 'vitest';

import { ContentItem, ContentProgress, ContentType } from '../models/content-item.model';
import { LearningPathInput, buildLearningPath } from './learning-path.builder';

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
    estimatedDurationMinutes: 10,
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

function input(overrides: Partial<LearningPathInput> = {}): LearningPathInput {
  return {
    studentId: 'std1',
    courseId: 'crs1',
    courseCode: 'BLM101',
    courseName: 'Programlamaya Giriş',
    outcomes: [{ id: 'out1', code: 'BLM101.K1', title: 'Değişkenler', order: 0 }],
    contents: [],
    progressByContent: new Map(),
    mastery: new Map(),
    prerequisites: new Map(),
    outcomeCodeById: new Map([
      ['out1', 'BLM101.K1'],
      ['out2', 'BLM101.K2'],
    ]),
    nowIso: NOW,
    ...overrides,
  };
}

describe('buildLearningPath', () => {
  it('içerikleri pedagojik türe göre sıralar', () => {
    const path = buildLearningPath(
      input({
        contents: [
          content({ id: 'c3', type: 'assignment' }),
          content({ id: 'c1', type: 'video' }),
          content({ id: 'c2', type: 'quiz' }),
        ],
      }),
    );

    expect(path.sections[0]!.steps.map((step) => step.contentId)).toEqual(['c1', 'c2', 'c3']);
  });

  it('ilk adımı önerilen, sonrakileri başlanmadı olarak işaretler', () => {
    const path = buildLearningPath(
      input({
        contents: [content({ id: 'c1', type: 'video' }), content({ id: 'c2', type: 'quiz' })],
      }),
    );

    expect(path.sections[0]!.steps.map((step) => step.state)).toEqual([
      'recommended',
      'not_started',
    ]);
    expect(path.currentStep?.contentId).toBe('c1');
  });

  it('önceki adım tamamlanınca sıradaki adımı önerir', () => {
    const path = buildLearningPath(
      input({
        contents: [content({ id: 'c1', type: 'video' }), content({ id: 'c2', type: 'quiz' })],
        progressByContent: new Map([
          ['c1', progress({ contentId: 'c1', state: 'completed', completionPercent: 100 })],
        ]),
      }),
    );

    expect(path.sections[0]!.steps.map((step) => step.state)).toEqual(['completed', 'recommended']);
    expect(path.currentStep?.contentId).toBe('c2');
  });

  it('önkoşulu tamamlanmamış kazanımın tüm adımlarını kilitler', () => {
    const path = buildLearningPath(
      input({
        outcomes: [
          { id: 'out1', code: 'BLM101.K1', title: 'Değişkenler', order: 0 },
          { id: 'out2', code: 'BLM101.K2', title: 'Döngüler', order: 1 },
        ],
        contents: [
          content({ id: 'c1', type: 'video' }),
          content({ id: 'c2', type: 'video', outcomeId: 'out2' }),
        ],
        prerequisites: new Map([['out2', ['out1']]]),
      }),
    );

    const locked = path.sections[1]!;
    expect(locked.state).toBe('locked');
    expect(locked.steps[0]!.state).toBe('locked');
    expect(locked.steps[0]!.blockedByLabel).toBe('BLM101.K1');
    expect(locked.steps[0]!.reasons[0]!.rule).toBe('prerequisite_gap');
  });

  it('yayınlanmamış içerikleri yola almaz', () => {
    const path = buildLearningPath(
      input({ contents: [content({ id: 'c1', type: 'video', state: 'DRAFT' })] }),
    );

    expect(path.sections[0]!.steps).toHaveLength(0);
    expect(path.currentStep).toBeNull();
  });

  it('tamamlanma yüzdesini süre ağırlıklı hesaplar', () => {
    const path = buildLearningPath(
      input({
        contents: [
          content({ id: 'c1', type: 'video', estimatedDurationMinutes: 30 }),
          content({ id: 'c2', type: 'quiz', estimatedDurationMinutes: 10 }),
        ],
        progressByContent: new Map([
          ['c1', progress({ contentId: 'c1', state: 'completed', completionPercent: 100 })],
        ]),
      }),
    );

    expect(path.totalMinutes).toBe(40);
    expect(path.completedMinutes).toBe(30);
    expect(path.completionPercent).toBe(75);
  });

  it('tüm adımlar bittiğinde bölüm tamamlanmış sayılır', () => {
    const path = buildLearningPath(
      input({
        contents: [content({ id: 'c1', type: 'video' })],
        progressByContent: new Map([
          ['c1', progress({ contentId: 'c1', state: 'completed', completionPercent: 100 })],
        ]),
      }),
    );

    expect(path.sections[0]!.state).toBe('completed');
    expect(path.currentStep).toBeNull();
    expect(path.completionPercent).toBe(100);
  });
});
