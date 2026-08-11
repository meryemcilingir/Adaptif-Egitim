import { describe, expect, it } from 'vitest';

import { Question, QuestionType, QuestionVersion } from '../models/question.model';
import {
  canCreateNewVersion,
  compareVersions,
  isQuestionEditable,
  validateAnswerShape,
} from './question.rules';

const NOW = '2026-03-10T09:00:00.000Z';

function answer(overrides: Partial<Parameters<typeof validateAnswerShape>[0]> = {}) {
  return {
    type: 'single_choice' as QuestionType,
    options: [] as { text: string; correct: boolean }[],
    matchPairs: [] as { left: string; right: string }[],
    sequenceItems: [] as { text: string; order: number }[],
    expectedAnswer: null as string | null,
    ...overrides,
  };
}

const option = (text: string, correct = false) => ({ text, correct });

describe('validateAnswerShape · seçenekli türler', () => {
  it('yeterli seçenek yoksa uyarır', () => {
    const issues = validateAnswerShape(answer({ options: [option('A', true)] }));

    expect(issues).toHaveLength(1);
    expect(issues[0]!.field).toBe('options');
  });

  it('doğru seçenek işaretlenmemişse uyarır', () => {
    const issues = validateAnswerShape(
      answer({ options: [option('A'), option('B'), option('C')] }),
    );

    expect(issues[0]!.message).toContain('doğru işaretlenmelidir');
  });

  it('tek seçimli soruda birden fazla doğru kabul etmez', () => {
    const issues = validateAnswerShape(
      answer({ options: [option('A', true), option('B', true), option('C')] }),
    );

    expect(issues[0]!.message).toContain('yalnızca bir seçenek');
  });

  it('aynı metni taşıyan iki seçeneği reddeder', () => {
    const issues = validateAnswerShape(
      answer({ options: [option('Ankara', true), option('İzmir'), option('  ankara  ')] }),
    );

    expect(issues[0]!.field).toBe('options');
    expect(issues[0]!.message).toContain('farklı olmalıdır');
  });

  it('çok seçimli soruda birden fazla doğru geçerlidir', () => {
    const issues = validateAnswerShape(
      answer({
        type: 'multiple_choice',
        options: [option('A', true), option('B', true), option('C')],
      }),
    );

    expect(issues).toHaveLength(0);
  });

  it('çok seçimlide tüm seçenekler doğru olamaz', () => {
    const issues = validateAnswerShape(
      answer({
        type: 'multiple_choice',
        options: [option('A', true), option('B', true), option('C', true)],
      }),
    );

    expect(issues[0]!.message).toContain('çeldirici');
  });

  it('boş metinli seçenekleri saymaz', () => {
    const issues = validateAnswerShape(
      answer({ options: [option('A', true), option('B'), option('   ')] }),
    );

    expect(issues).toHaveLength(0);
  });
});

describe('validateAnswerShape · diğer türler', () => {
  it('sayısal soruda sayısal olmayan cevabı reddeder', () => {
    expect(
      validateAnswerShape(answer({ type: 'numeric', expectedAnswer: 'kırk iki' })),
    ).toHaveLength(1);
    expect(validateAnswerShape(answer({ type: 'numeric', expectedAnswer: '42' }))).toHaveLength(0);
  });

  it('kısa cevapta örnek cevap zorunludur', () => {
    expect(
      validateAnswerShape(answer({ type: 'short_answer', expectedAnswer: '   ' })),
    ).toHaveLength(1);
  });

  it('açık uçlu soruda cevap anahtarı aranmaz', () => {
    expect(validateAnswerShape(answer({ type: 'open_ended' }))).toHaveLength(0);
  });

  it('eşleştirmede en az iki tam eşleşme ister', () => {
    const issues = validateAnswerShape(
      answer({ type: 'matching', matchPairs: [{ left: 'A', right: '' }] }),
    );

    expect(issues[0]!.field).toBe('matchPairs');
  });

  it('sıralamada numaralar 1..n olmalıdır', () => {
    const invalid = validateAnswerShape(
      answer({
        type: 'ordering',
        sequenceItems: [
          { text: 'A', order: 1 },
          { text: 'B', order: 3 },
        ],
      }),
    );
    expect(invalid[0]!.message).toContain('1’den başlayarak');

    const valid = validateAnswerShape(
      answer({
        type: 'ordering',
        sequenceItems: [
          { text: 'A', order: 1 },
          { text: 'B', order: 2 },
        ],
      }),
    );
    expect(valid).toHaveLength(0);
  });
});

describe('düzenlenebilirlik (BR-02)', () => {
  it('yalnızca taslak ve revizyon istenen soru düzenlenebilir', () => {
    expect(isQuestionEditable('DRAFT')).toBe(true);
    expect(isQuestionEditable('REVIEW', 'REVISION_REQUESTED')).toBe(true);
    expect(isQuestionEditable('PUBLISHED')).toBe(false);
    expect(isQuestionEditable('ARCHIVED')).toBe(false);
  });

  it('incelemedeki ve onaylanmış soru kilitlidir — ölçme uzmanı karar verene kadar düzenlenemez', () => {
    expect(isQuestionEditable('REVIEW', 'UNDER_REVIEW')).toBe(false);
    expect(isQuestionEditable('REVIEW', 'APPROVED')).toBe(false);
  });

  it('yeni versiyon yalnızca yayındaki sorudan açılır', () => {
    expect(canCreateNewVersion('PUBLISHED')).toBe(true);
    expect(canCreateNewVersion('DRAFT')).toBe(false);
  });
});

/* ── Versiyon karşılaştırma ──────────────────────────────────────────────── */

function question(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    code: 'MAT101.K1-S1',
    title: 'Limit tanımı',
    stem: '<p>Soru gövdesi</p>',
    type: 'single_choice',
    courseId: 'crs1',
    outcomeIds: ['out1'],
    difficulty: 'medium',
    level: 'understand',
    points: 4,
    estimatedSolveTimeSeconds: 90,
    options: [],
    matchPairs: [],
    sequenceItems: [],
    expectedAnswer: null,
    numericTolerance: null,
    explanation: 'Açıklama',
    attachments: [],
    tags: ['temel'],
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

function version(
  versionNumber: number,
  snapshot: Question,
  author = 'Ayşe Yıldız',
): QuestionVersion {
  const { usageCount: _usage, favoritedBy: _favorites, ...rest } = snapshot;

  return {
    id: `qvr${versionNumber}`,
    questionId: snapshot.id,
    versionNumber,
    snapshot: { ...rest, versionNumber },
    changeNote: 'Not',
    publishedBy: 'usr1',
    publishedByName: author,
    publishedAt: NOW,
  };
}

describe('compareVersions', () => {
  it('değişmeyen alanları listelemez', () => {
    const base = question();
    const result = compareVersions(version(1, base), version(2, base));

    // Yalnızca `versionNumber` değişti; o alan karşılaştırılmıyor.
    expect(result.changes).toHaveLength(0);
  });

  it('zorluk ve Bloom seviyesini okunabilir etiketle gösterir', () => {
    const before = question({ difficulty: 'medium', level: 'understand' });
    const after = question({ difficulty: 'hard', level: 'apply' });

    const result = compareVersions(version(1, before), version(2, after));
    const difficulty = result.changes.find((change) => change.field === 'difficulty');
    const level = result.changes.find((change) => change.field === 'level');

    expect(difficulty).toEqual(
      expect.objectContaining({ before: 'Orta', after: 'Zor', isRichText: false }),
    );
    expect(level).toEqual(expect.objectContaining({ before: 'Anlama', after: 'Uygulama' }));
  });

  it('soru gövdesini zengin metin olarak işaretler', () => {
    const result = compareVersions(
      version(1, question({ stem: '<p>Eski</p>' })),
      version(2, question({ stem: '<p>Yeni</p>' })),
    );

    const stem = result.changes.find((change) => change.field === 'stem');
    expect(stem?.isRichText).toBe(true);
    expect(stem?.after).toBe('<p>Yeni</p>');
  });

  it('seçenek listesini doğru işaretiyle özetler', () => {
    const before = question({ options: [{ id: 'o1', text: 'A', correct: true, rationale: '' }] });
    const after = question({
      options: [
        { id: 'o1', text: 'A', correct: false, rationale: '' },
        { id: 'o2', text: 'B', correct: true, rationale: '' },
      ],
    });

    const result = compareVersions(version(1, before), version(2, after));
    const options = result.changes.find((change) => change.field === 'options');

    expect(options?.before).toBe('✓ A');
    expect(options?.after).toBe('· A\n✓ B');
  });

  it('karşılaştırma üst bilgisini doldurur', () => {
    const result = compareVersions(
      version(1, question(), 'Ali Vural'),
      version(3, question({ points: 6 }), 'Ayşe Yıldız'),
    );

    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(3);
    expect(result.fromUpdatedBy).toBe('Ali Vural');
    expect(result.toUpdatedBy).toBe('Ayşe Yıldız');
    expect(result.changes.some((change) => change.field === 'points')).toBe(true);
  });
});
