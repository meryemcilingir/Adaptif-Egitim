import { describe, expect, it } from 'vitest';

import { Question, QuestionType } from '../models/question.model';
import { scoreAnswer, suggestScore } from './scoring';

const NOW = '2026-03-10T09:00:00.000Z';

function question(type: QuestionType, overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    code: 'Q1',
    title: 'Soru',
    stem: '<p>Gövde</p>',
    type,
    courseId: 'crs1',
    outcomeIds: ['out1'],
    difficulty: 'medium',
    level: 'understand',
    points: 10,
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

const option = (id: string, text: string, correct: boolean) => ({
  id,
  text,
  correct,
  rationale: '',
});

describe('scoreAnswer — çoktan seçmeli', () => {
  const single = question('single_choice', {
    options: [option('a', 'A', true), option('b', 'B', false)],
  });

  it('doğru seçenekte tam puan verir', () => {
    const result = scoreAnswer(single, { kind: 'choice', optionIds: ['a'] });
    expect(result).toEqual({ awardedPoints: 10, correct: true, graded: true, partial: false });
  });

  it('yanlış seçenekte sıfır verir', () => {
    const result = scoreAnswer(single, { kind: 'choice', optionIds: ['b'] });
    expect(result.awardedPoints).toBe(0);
    expect(result.correct).toBe(false);
  });

  it('boş cevabı yanlış sayar ama puanlanmış kabul eder', () => {
    const result = scoreAnswer(single, null);
    expect(result).toEqual({ awardedPoints: 0, correct: false, graded: true, partial: false });
  });
});

describe('scoreAnswer — çoklu seçim ve kısmi puan', () => {
  const options = [
    option('a', 'A', true),
    option('b', 'B', true),
    option('c', 'C', false),
    option('d', 'D', false),
  ];

  it('kısmi puan kapalıyken eksik cevaba puan vermez', () => {
    const q = question('multiple_choice', { options, allowPartialCredit: false });
    expect(scoreAnswer(q, { kind: 'choice', optionIds: ['a'] }).awardedPoints).toBe(0);
  });

  it('kısmi puan açıkken doğru oranında puan verir', () => {
    const q = question('multiple_choice', { options, allowPartialCredit: true });
    const result = scoreAnswer(q, { kind: 'choice', optionIds: ['a'] });

    expect(result.awardedPoints).toBe(5);
    expect(result.partial).toBe(true);
    expect(result.correct).toBe(false);
  });

  /* Yanlış işaretleme düşülmezse "hepsini işaretle" stratejisi tam puan getirirdi. */
  it('yanlış işaretlemeyi doğrulardan düşer', () => {
    const q = question('multiple_choice', { options, allowPartialCredit: true });
    const result = scoreAnswer(q, { kind: 'choice', optionIds: ['a', 'b', 'c'] });

    expect(result.awardedPoints).toBe(5);
  });

  it('tüm seçenekleri işaretlemek tam puan getirmez', () => {
    const q = question('multiple_choice', { options, allowPartialCredit: true });
    const result = scoreAnswer(q, { kind: 'choice', optionIds: ['a', 'b', 'c', 'd'] });

    expect(result.awardedPoints).toBe(0);
  });

  it('kısmi puan negatife düşmez', () => {
    const q = question('multiple_choice', { options, allowPartialCredit: true });
    const result = scoreAnswer(q, { kind: 'choice', optionIds: ['c', 'd'] });

    expect(result.awardedPoints).toBe(0);
  });

  it('tam doğru cevapta tam puan verir', () => {
    const q = question('multiple_choice', { options, allowPartialCredit: true });
    const result = scoreAnswer(q, { kind: 'choice', optionIds: ['b', 'a'] });

    expect(result.awardedPoints).toBe(10);
    expect(result.correct).toBe(true);
  });
});

describe('scoreAnswer — doğru/yanlış', () => {
  const q = question('true_false', {
    options: [option('t', 'Doğru', true), option('f', 'Yanlış', false)],
  });

  it('doğru cevabı tanır', () => {
    expect(scoreAnswer(q, { kind: 'boolean', value: true }).awardedPoints).toBe(10);
  });

  it('yanlış cevaba puan vermez', () => {
    expect(scoreAnswer(q, { kind: 'boolean', value: false }).awardedPoints).toBe(0);
  });
});

describe('scoreAnswer — sayısal', () => {
  it('tolerans içindeki cevabı doğru sayar', () => {
    const q = question('numeric', { expectedAnswer: '3.14', numericTolerance: 0.01 });
    expect(scoreAnswer(q, { kind: 'numeric', value: 3.15 }).correct).toBe(true);
  });

  it('tolerans dışındaki cevabı yanlış sayar', () => {
    const q = question('numeric', { expectedAnswer: '3.14', numericTolerance: 0.01 });
    expect(scoreAnswer(q, { kind: 'numeric', value: 3.2 }).correct).toBe(false);
  });

  it('tolerans tanımsızsa tam eşitlik arar', () => {
    const q = question('numeric', { expectedAnswer: '42', numericTolerance: null });
    expect(scoreAnswer(q, { kind: 'numeric', value: 42 }).correct).toBe(true);
    expect(scoreAnswer(q, { kind: 'numeric', value: 42.1 }).correct).toBe(false);
  });
});

describe('suggestScore — kısa cevap önerisi', () => {
  /* Kısa cevap kayıt tablosunda elle puanlanır; otomatik puan VERİLMEZ. */
  it('kısa cevabı otomatik puanlamaz', () => {
    const q = question('short_answer', { expectedAnswer: 'İstanbul' });
    expect(scoreAnswer(q, { kind: 'text', value: 'İstanbul' }).graded).toBe(false);
  });

  it('büyük/küçük harf ve fazla boşluğu yok sayarak öneri üretir', () => {
    const q = question('short_answer', { expectedAnswer: 'İstanbul' });
    expect(suggestScore(q, { kind: 'text', value: '  İSTANBUL ' })?.correct).toBe(true);
  });

  it('dikey çizgiyle ayrılmış alternatifleri kabul eder', () => {
    const q = question('short_answer', { expectedAnswer: 'doğru akım|DC' });
    expect(suggestScore(q, { kind: 'text', value: 'dc' })?.correct).toBe(true);
  });

  it('beklenen cevap tanımsızsa öneri üretmez', () => {
    const q = question('short_answer', { expectedAnswer: null });
    expect(suggestScore(q, { kind: 'text', value: 'x' })).toBeNull();
  });

  it('rubrikli açık uçlu soruda öneri üretmez', () => {
    const q = question('open_ended');
    expect(suggestScore(q, { kind: 'text', value: 'Uzun cevap' })).toBeNull();
  });
});

describe('scoreAnswer — eşleştirme ve sıralama', () => {
  const pairs = question('matching', {
    allowPartialCredit: true,
    matchPairs: [
      { id: 'p1', left: 'A', right: '1' },
      { id: 'p2', left: 'B', right: '2' },
    ],
  });

  it('doğru bağ oranında puan verir', () => {
    const result = scoreAnswer(pairs, {
      kind: 'pairs',
      pairs: [
        { leftId: 'p1', rightId: 'p1' },
        { leftId: 'p2', rightId: 'p1' },
      ],
    });

    expect(result.awardedPoints).toBe(5);
    expect(result.partial).toBe(true);
  });

  const sequence = question('ordering', {
    allowPartialCredit: true,
    sequenceItems: [
      { id: 's1', text: 'Bir', order: 1 },
      { id: 's2', text: 'İki', order: 2 },
      { id: 's3', text: 'Üç', order: 3 },
    ],
  });

  it('doğru sırada tam puan verir', () => {
    const result = scoreAnswer(sequence, { kind: 'sequence', itemIds: ['s1', 's2', 's3'] });
    expect(result.awardedPoints).toBe(10);
    expect(result.correct).toBe(true);
  });

  it('konumu tutan öğe sayısına göre kısmi puan verir', () => {
    const result = scoreAnswer(sequence, { kind: 'sequence', itemIds: ['s1', 's3', 's2'] });
    expect(result.awardedPoints).toBe(3.33);
  });
});

describe('scoreAnswer — elle puanlanan türler', () => {
  it('açık uçlu soruyu otomatik puanlamaz', () => {
    const q = question('open_ended');
    const result = scoreAnswer(q, { kind: 'text', value: 'Uzun bir cevap.' });

    expect(result.graded).toBe(false);
    expect(result.awardedPoints).toBe(0);
    expect(result.correct).toBeNull();
  });
});

describe('scoreAnswer — bozuk veri', () => {
  it('cevap türü soruyla uyuşmuyorsa puanlamaz', () => {
    const q = question('single_choice', { options: [option('a', 'A', true)] });
    const result = scoreAnswer(q, { kind: 'numeric', value: 1 });

    expect(result.graded).toBe(false);
  });

  it('doğru seçeneği olmayan soruyu puanlamaz', () => {
    const q = question('single_choice', { options: [option('a', 'A', false)] });
    expect(scoreAnswer(q, { kind: 'choice', optionIds: ['a'] }).graded).toBe(false);
  });
});
