import { describe, expect, it } from 'vitest';

import { BlueprintOutcomeRow } from '../models/blueprint.model';
import {
  ExamQuestionFacts,
  ExamValidationInput,
  buildConstraintSnapshot,
  validateExam,
} from './exam-validation';

const OPENS = '2026-04-01T09:00:00.000Z';
const CLOSES = '2026-04-01T13:00:00.000Z';

function fact(overrides: Partial<ExamQuestionFacts> = {}): ExamQuestionFacts {
  return {
    questionId: 'q1',
    points: 10,
    difficulty: 'medium',
    outcomeIds: ['out1'],
    estimatedSolveTimeSeconds: 60,
    isPublished: true,
    isLatestVersion: true,
    ...overrides,
  };
}

function row(overrides: Partial<BlueprintOutcomeRow> = {}): BlueprintOutcomeRow {
  return { outcomeId: 'out1', easy: 0, medium: 0, hard: 0, ...overrides };
}

/** Varsayılan olarak GEÇERLİ bir sınav; testler tek tek bozar. */
function input(overrides: Partial<ExamValidationInput> = {}): ExamValidationInput {
  return {
    title: 'MAT101 Ara Sınav',
    durationMinutes: 60,
    opensAt: OPENS,
    closesAt: CLOSES,
    cohortIds: ['coh1'],
    questions: [fact({ questionId: 'q1' }), fact({ questionId: 'q2' })],
    blueprintRows: [row({ medium: 2 })],
    hasBlueprint: true,
    isBlueprintPublished: true,
    targetTotalPoints: 20,
    siblingTitles: [],
    ...overrides,
  };
}

function rules(result: { issues: readonly { rule: string }[] }): string[] {
  return result.issues.map((issue) => issue.rule);
}

describe('validateExam · geçerli sınav', () => {
  it('kural ihlali olmayan sınav yayına hazırdır', () => {
    const result = validateExam(input());

    expect(result.issues).toHaveLength(0);
    expect(result.publishReady).toBe(true);
  });
});

describe('validateExam · blueprint zorunluluğu', () => {
  it('blueprint bağlı değilse yayına alınamaz', () => {
    const result = validateExam(input({ hasBlueprint: false }));

    expect(rules(result)).toContain('blueprint_required');
    expect(result.publishReady).toBe(false);
  });

  it('bağlı blueprint yayında değilse yayına alınamaz', () => {
    const result = validateExam(input({ isBlueprintPublished: false }));

    expect(rules(result)).toContain('blueprint_required');
    expect(result.publishReady).toBe(false);
  });
});

describe('validateExam · puan ve soru sayısı', () => {
  it('toplam puan blueprint hedefinden farklıysa hata verir', () => {
    const result = validateExam(input({ targetTotalPoints: 100 }));

    expect(rules(result)).toContain('total_points');
    expect(result.publishReady).toBe(false);
  });

  it('soru sayısı blueprint ile uyuşmuyorsa hata verir', () => {
    const result = validateExam(
      input({ blueprintRows: [row({ medium: 5 })], targetTotalPoints: 20 }),
    );

    expect(rules(result)).toContain('blueprint_match');
  });

  it('zorluk dağılımı sapması yalnızca uyarıdır', () => {
    const result = validateExam(
      input({
        // 2 soru isteniyor ama biri kolay biri orta olmalıydı.
        blueprintRows: [row({ easy: 1, medium: 1 })],
      }),
    );

    const difficultyIssues = result.issues.filter(
      (issue) => issue.rule === 'blueprint_match' && issue.severity === 'warning',
    );
    expect(difficultyIssues.length).toBeGreaterThan(0);
    expect(result.publishReady).toBe(true);
  });

  it('boş sınav yayına alınamaz', () => {
    const result = validateExam(input({ questions: [], blueprintRows: [], targetTotalPoints: 0 }));

    expect(rules(result)).toContain('empty_exam');
    expect(result.publishReady).toBe(false);
  });
});

describe('validateExam · soru kuralları', () => {
  it('aynı soru iki kez eklenemez', () => {
    const result = validateExam(
      input({ questions: [fact({ questionId: 'q1' }), fact({ questionId: 'q1' })] }),
    );

    expect(rules(result)).toContain('duplicate_question');
  });

  it('yayınlanmamış soru hata verir', () => {
    const result = validateExam(
      input({
        questions: [fact({ questionId: 'q1' }), fact({ questionId: 'q2', isPublished: false })],
      }),
    );

    expect(rules(result)).toContain('unpublished_question');
    expect(result.publishReady).toBe(false);
  });

  it('eski versiyona bağlı soru yalnızca uyarıdır', () => {
    const result = validateExam(
      input({
        questions: [fact({ questionId: 'q1' }), fact({ questionId: 'q2', isLatestVersion: false })],
      }),
    );

    const issue = result.issues.find((item) => item.rule === 'stale_version');
    expect(issue?.severity).toBe('warning');
    expect(result.publishReady).toBe(true);
  });

  it('blueprint soru istediği kazanım sınavda yoksa hata verir', () => {
    const result = validateExam(
      input({
        questions: [
          fact({ questionId: 'q1', outcomeIds: ['out1'] }),
          fact({ questionId: 'q2', outcomeIds: ['out1'] }),
        ],
        blueprintRows: [row({ medium: 1 }), row({ outcomeId: 'out2', medium: 1 })],
      }),
    );

    expect(rules(result)).toContain('outcome_coverage');
  });
});

describe('validateExam · takvim ve kimlik', () => {
  it('süre sınırların dışındaysa hata verir', () => {
    expect(rules(validateExam(input({ durationMinutes: 0 })))).toContain('duration');
    expect(rules(validateExam(input({ durationMinutes: 5000 })))).toContain('duration');
  });

  it('tahmini çözüm süresi sınav süresini aşarsa uyarır', () => {
    const result = validateExam(
      input({
        durationMinutes: 5,
        questions: [
          fact({ questionId: 'q1', estimatedSolveTimeSeconds: 600 }),
          fact({ questionId: 'q2', estimatedSolveTimeSeconds: 600 }),
        ],
      }),
    );

    const issue = result.issues.find(
      (item) => item.rule === 'duration' && item.severity === 'warning',
    );
    expect(issue).toBeDefined();
  });

  it('aynı derste aynı adda sınav olamaz', () => {
    const result = validateExam(input({ siblingTitles: ['mat101 ara sınav'] }));

    expect(rules(result)).toContain('unique_title');
  });

  it('boş ad hata verir', () => {
    expect(rules(validateExam(input({ title: '   ' })))).toContain('unique_title');
  });

  it('grup atanmamışsa hata verir', () => {
    expect(rules(validateExam(input({ cohortIds: [] })))).toContain('cohort_required');
  });

  it('kapanış açılıştan önceyse hata verir', () => {
    const result = validateExam(input({ opensAt: CLOSES, closesAt: OPENS }));

    expect(rules(result)).toContain('schedule_window');
    expect(result.publishReady).toBe(false);
  });

  it('pencere sınav süresinden kısaysa uyarır', () => {
    const result = validateExam(
      input({
        durationMinutes: 120,
        opensAt: OPENS,
        closesAt: '2026-04-01T10:00:00.000Z',
      }),
    );

    const issue = result.issues.find(
      (item) => item.rule === 'schedule_window' && item.severity === 'warning',
    );
    expect(issue).toBeDefined();
  });
});

describe('buildConstraintSnapshot', () => {
  it('panel sayılarını doğru üretir', () => {
    const snapshot = buildConstraintSnapshot(
      input({
        questions: [
          fact({ questionId: 'q1', difficulty: 'easy', points: 5 }),
          fact({ questionId: 'q2', difficulty: 'hard', points: 15 }),
        ],
        blueprintRows: [row({ easy: 1, hard: 1 })],
      }),
    );

    expect(snapshot.totalQuestions).toBe(2);
    expect(snapshot.targetQuestions).toBe(2);
    expect(snapshot.totalPoints).toBe(20);
    expect(snapshot.duplicateCount).toBe(0);
    expect(snapshot.coveredOutcomes).toBe(1);

    const easy = snapshot.difficulty.find((entry) => entry.difficulty === 'easy');
    expect(easy).toEqual(expect.objectContaining({ count: 1, target: 1 }));
  });

  it('yinelenen soruyu sayar', () => {
    const snapshot = buildConstraintSnapshot(
      input({ questions: [fact({ questionId: 'q1' }), fact({ questionId: 'q1' })] }),
    );

    expect(snapshot.duplicateCount).toBe(1);
  });

  it('doğrulama sonucu panelle aynı girdiden üretilir', () => {
    const data = input({ targetTotalPoints: 999 });

    expect(buildConstraintSnapshot(data).validation).toEqual(validateExam(data));
  });
});
