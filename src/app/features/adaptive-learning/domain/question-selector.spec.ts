import { describe, expect, it } from 'vitest';

import { Difficulty } from '../models/common.model';
import { Question } from '../models/question.model';
import { renumber, selectQuestions, totalPointsOf } from './question-selector';

const NOW = '2026-03-10T09:00:00.000Z';

function question(
  id: string,
  difficulty: Difficulty,
  outcomeIds: readonly string[],
  overrides: Partial<Question> = {},
): Question {
  return {
    id,
    code: id.toUpperCase(),
    title: `Soru ${id}`,
    stem: '<p>Gövde</p>',
    type: 'single_choice',
    courseId: 'crs1',
    outcomeIds,
    difficulty,
    level: 'understand',
    points: 5,
    estimatedSolveTimeSeconds: 60,
    options: [],
    matchPairs: [],
    sequenceItems: [],
    expectedAnswer: null,
    numericTolerance: null,
    explanation: '',
    attachments: [],
    tags: [],
    state: 'PUBLISHED',
    reviewStatus: 'NONE',
    rubricId: null,
    versionNumber: 1,
    pendingChangeNote: null,
    publishedVersion: 1,
    usageCount: 0,
    allowPartialCredit: false,
    favoritedBy: [],
    publishedAt: NOW,
    archivedAt: null,
    deletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    createdBy: 'usr1',
    updatedBy: 'usr1',
    ...overrides,
  };
}

/** Her soru için bir versiyon anlık görüntüsü varmış gibi davranır. */
function versionsFor(questions: readonly Question[]) {
  return new Map(
    questions.map((item) => [item.id, { id: `v_${item.id}`, versionNumber: 1 }] as const),
  );
}

describe('selectQuestions', () => {
  it('blueprint hücrelerine göre soru seçer', () => {
    const pool = [
      question('q1', 'easy', ['out1']),
      question('q2', 'medium', ['out1']),
      question('q3', 'hard', ['out1']),
    ];

    const result = selectQuestions({
      rows: [{ outcomeId: 'out1', easy: 1, medium: 1, hard: 0 }],
      questions: pool,
      existing: [],
      versionIdByQuestion: versionsFor(pool),
    });

    expect(result.questions.map((ref) => ref.questionId)).toEqual(['q1', 'q2']);
    expect(result.shortfalls).toHaveLength(0);
    expect(result.addedCount).toBe(2);
  });

  it('yayında olmayan soruyu seçmez', () => {
    const pool = [
      question('q1', 'easy', ['out1'], { state: 'DRAFT' }),
      question('q2', 'easy', ['out1']),
    ];

    const result = selectQuestions({
      rows: [{ outcomeId: 'out1', easy: 1, medium: 0, hard: 0 }],
      questions: pool,
      existing: [],
      versionIdByQuestion: versionsFor(pool),
    });

    expect(result.questions.map((ref) => ref.questionId)).toEqual(['q2']);
  });

  it('silinmiş soruyu seçmez', () => {
    const pool = [
      question('q1', 'easy', ['out1'], { deletedAt: NOW }),
      question('q2', 'easy', ['out1']),
    ];

    const result = selectQuestions({
      rows: [{ outcomeId: 'out1', easy: 1, medium: 0, hard: 0 }],
      questions: pool,
      existing: [],
      versionIdByQuestion: versionsFor(pool),
    });

    expect(result.questions.map((ref) => ref.questionId)).toEqual(['q2']);
  });

  it('versiyon anlık görüntüsü olmayan soruyu seçmez', () => {
    const pool = [question('q1', 'easy', ['out1'])];

    const result = selectQuestions({
      rows: [{ outcomeId: 'out1', easy: 1, medium: 0, hard: 0 }],
      questions: pool,
      existing: [],
      versionIdByQuestion: new Map(),
    });

    expect(result.questions).toHaveLength(0);
    expect(result.shortfalls[0]).toEqual(
      expect.objectContaining({ outcomeId: 'out1', difficulty: 'easy', requested: 1, found: 0 }),
    );
  });

  it('aynı soruyu iki kez seçmez', () => {
    const pool = [question('q1', 'easy', ['out1', 'out2'])];

    const result = selectQuestions({
      rows: [
        { outcomeId: 'out1', easy: 1, medium: 0, hard: 0 },
        { outcomeId: 'out2', easy: 1, medium: 0, hard: 0 },
      ],
      questions: pool,
      existing: [],
      versionIdByQuestion: versionsFor(pool),
    });

    expect(result.questions).toHaveLength(1);
    // İkinci satır karşılanamadı → eksik olarak raporlanır.
    expect(result.shortfalls).toHaveLength(1);
  });

  it('mevcut seçimi korur ve yalnızca eksiği tamamlar', () => {
    const pool = [
      question('q1', 'easy', ['out1']),
      question('q2', 'easy', ['out1']),
      question('q3', 'easy', ['out1']),
    ];

    const result = selectQuestions({
      rows: [{ outcomeId: 'out1', easy: 3, medium: 0, hard: 0 }],
      questions: pool,
      existing: [
        { questionId: 'q3', questionVersionId: 'v_q3', versionNumber: 1, order: 1, points: 5 },
      ],
      versionIdByQuestion: versionsFor(pool),
    });

    expect(result.questions.map((ref) => ref.questionId)).toEqual(['q3', 'q1', 'q2']);
    expect(result.addedCount).toBe(2);
  });

  it('yeterli soru yoksa eksiği raporlar', () => {
    const pool = [question('q1', 'hard', ['out1'])];

    const result = selectQuestions({
      rows: [{ outcomeId: 'out1', easy: 0, medium: 0, hard: 3 }],
      questions: pool,
      existing: [],
      versionIdByQuestion: versionsFor(pool),
    });

    expect(result.questions).toHaveLength(1);
    expect(result.shortfalls[0]).toEqual(
      expect.objectContaining({ requested: 3, found: 1, difficulty: 'hard' }),
    );
  });

  it('az kullanılmış soruyu önceler ve deterministik davranır', () => {
    const pool = [
      question('q1', 'easy', ['out1'], { usageCount: 9 }),
      question('q2', 'easy', ['out1'], { usageCount: 1 }),
    ];

    const first = selectQuestions({
      rows: [{ outcomeId: 'out1', easy: 1, medium: 0, hard: 0 }],
      questions: pool,
      existing: [],
      versionIdByQuestion: versionsFor(pool),
    });
    const second = selectQuestions({
      rows: [{ outcomeId: 'out1', easy: 1, medium: 0, hard: 0 }],
      questions: [...pool].reverse(),
      existing: [],
      versionIdByQuestion: versionsFor(pool),
    });

    expect(first.questions[0]!.questionId).toBe('q2');
    // Havuzun sırası değişse bile sonuç aynı → deterministik.
    expect(second.questions[0]!.questionId).toBe('q2');
  });

  it('sıfır istenen hücreyi atlar', () => {
    const pool = [question('q1', 'easy', ['out1'])];

    const result = selectQuestions({
      rows: [{ outcomeId: 'out1', easy: 0, medium: 0, hard: 0 }],
      questions: pool,
      existing: [],
      versionIdByQuestion: versionsFor(pool),
    });

    expect(result.questions).toHaveLength(0);
    expect(result.shortfalls).toHaveLength(0);
  });
});

describe('renumber / totalPointsOf', () => {
  it('sıra numaralarını 1..n yapar', () => {
    const ordered = renumber([
      { questionId: 'a', questionVersionId: 'v', versionNumber: 1, order: 7, points: 3 },
      { questionId: 'b', questionVersionId: 'v', versionNumber: 1, order: 2, points: 4 },
    ]);

    expect(ordered.map((ref) => ref.order)).toEqual([1, 2]);
  });

  it('toplam puanı hesaplar', () => {
    expect(
      totalPointsOf([
        { questionId: 'a', questionVersionId: 'v', versionNumber: 1, order: 1, points: 3 },
        { questionId: 'b', questionVersionId: 'v', versionNumber: 1, order: 2, points: 4 },
      ]),
    ).toBe(7);
  });
});
