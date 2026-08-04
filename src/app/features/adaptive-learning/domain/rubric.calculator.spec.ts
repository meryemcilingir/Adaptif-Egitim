import { describe, expect, it } from 'vitest';

import { RubricCriterionScore } from '../models/attempt.model';
import { Rubric } from '../models/rubric.model';
import { criterionMaxPoints, evaluateRubric, normalizeScores, rubricRawMax } from './rubric.calculator';

const NOW = '2026-03-10T09:00:00.000Z';

const rubric: Rubric = {
  id: 'rub1',
  name: 'Açık uçlu değerlendirme',
  description: '',
  courseId: 'crs1',
  maxPoints: 0,
  criteria: [
    {
      id: 'c1',
      title: 'Doğruluk',
      description: '',
      weight: 2,
      levels: [
        { id: 'c1l0', label: 'Yetersiz', description: '', points: 0 },
        { id: 'c1l1', label: 'Kısmen', description: '', points: 1 },
        { id: 'c1l2', label: 'Tam', description: '', points: 2 },
      ],
    },
    {
      id: 'c2',
      title: 'Açıklama',
      description: '',
      weight: 1,
      levels: [
        { id: 'c2l0', label: 'Yetersiz', description: '', points: 0 },
        { id: 'c2l1', label: 'Yeterli', description: '', points: 2 },
      ],
    },
  ],
  createdAt: NOW,
  updatedAt: NOW,
  version: 1,
  createdBy: 'usr1',
  updatedBy: 'usr1',
};

const score = (criterionId: string, levelId: string): RubricCriterionScore => ({
  criterionId,
  levelId,
  points: 0,
  comment: '',
});

describe('criterionMaxPoints', () => {
  it('en yüksek seviyeyi ağırlıkla çarpar', () => {
    expect(criterionMaxPoints(rubric.criteria[0])).toBe(4);
    expect(criterionMaxPoints(rubric.criteria[1])).toBe(2);
  });
});

describe('rubricRawMax', () => {
  it('kriter tavanlarını toplar', () => {
    expect(rubricRawMax(rubric)).toBe(6);
  });
});

describe('evaluateRubric', () => {
  it('seçilen seviyelerden toplamı hesaplar ve soru puanına ölçekler', () => {
    const result = evaluateRubric(rubric, [score('c1', 'c1l2'), score('c2', 'c2l1')], 20);

    expect(result.rawPoints).toBe(6);
    expect(result.maxRawPoints).toBe(6);
    expect(result.percent).toBe(100);
    expect(result.scaledPoints).toBe(20);
    expect(result.complete).toBe(true);
  });

  it('kısmi seçimde oranlı puan verir', () => {
    const result = evaluateRubric(rubric, [score('c1', 'c1l1'), score('c2', 'c2l0')], 20);

    expect(result.rawPoints).toBe(2);
    expect(result.percent).toBe(33);
    expect(result.scaledPoints).toBe(6.67);
  });

  /* Eksik kriter sessizce sıfır sayılmamalı; değerlendirici uyarılmalı. */
  it('seviyesi seçilmemiş kriterleri raporlar', () => {
    const result = evaluateRubric(rubric, [score('c1', 'c1l2')], 20);

    expect(result.missingCriterionIds).toEqual(['c2']);
    expect(result.complete).toBe(false);
  });

  it('bilinmeyen kriter ve seviye kimliklerini yok sayar', () => {
    const result = evaluateRubric(
      rubric,
      [score('c1', 'c1l2'), score('silinmis', 'x'), score('c2', 'gecersiz')],
      20,
    );

    expect(result.rawPoints).toBe(4);
    expect(result.missingCriterionIds).toEqual(['c2']);
  });

  it('hiç seçim yoksa sıfır döner', () => {
    const result = evaluateRubric(rubric, [], 20);

    expect(result.scaledPoints).toBe(0);
    expect(result.missingCriterionIds).toEqual(['c1', 'c2']);
  });
});

describe('normalizeScores', () => {
  /* İstemciden gelen puan, seçilen seviyeyle çelişebilir; kaynak seviyedir. */
  it('puanı seviye kimliğinden yeniden türetir', () => {
    const tampered: RubricCriterionScore = {
      criterionId: 'c1',
      levelId: 'c1l1',
      points: 999,
      comment: 'not',
    };

    expect(normalizeScores(rubric, [tampered])).toEqual([
      { criterionId: 'c1', levelId: 'c1l1', points: 2, comment: 'not' },
    ]);
  });

  it('geçersiz kayıtları eler', () => {
    expect(normalizeScores(rubric, [score('yok', 'yok')])).toEqual([]);
  });
});
