import { describe, expect, it } from 'vitest';

import { AnswerDraft } from '../models/exam-session.model';
import { Exam } from '../models/exam.model';
import {
  acceptsAnswerAt,
  answeredIdsOf,
  buildSubmitSummary,
  canEnter,
  canTransition,
  isClosed,
  navigatorStateOf,
  sameAnswer,
  sessionExpiry,
  waitingPhase,
} from './session.rules';

const NOW = '2026-03-10T09:00:00.000Z';
const at = (iso: string) => Date.parse(iso);

function exam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: 'exm1',
    title: 'Ara Sınav',
    description: '',
    instructions: '',
    courseId: 'crs1',
    blueprintId: 'blp1',
    cohortIds: ['coh1'],
    durationMinutes: 60,
    opensAt: '2026-03-10T10:00:00.000Z',
    closesAt: '2026-03-10T14:00:00.000Z',
    questions: [],
    rules: {
      shuffleQuestions: false,
      shuffleOptions: false,
      allowBackNavigation: true,
      showResultImmediately: false,
      passingScore: 50,
      maxAttempts: 1,
      autoSubmit: true,
    },
    totalPoints: 100,
    state: 'PUBLISHED',
    publishedAt: NOW,
    archivedAt: null,
    attemptCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    version: 1,
    createdBy: 'usr1',
    updatedBy: 'usr1',
    ...overrides,
  };
}

function draft(questionId: string, value: AnswerDraft['value']): AnswerDraft {
  return {
    id: `dft_${questionId}`,
    sessionToken: 'tok1',
    questionId,
    value,
    version: 1,
    syncState: 'SYNCED',
    updatedAt: NOW,
    savedAt: NOW,
  };
}

describe('waitingPhase', () => {
  it('başlama saatinden önce girişe izin vermez', () => {
    const phase = waitingPhase(exam(), at('2026-03-10T09:30:00.000Z'), 0, false);

    expect(phase).toBe('too_early');
    expect(canEnter(phase)).toBe(false);
  });

  it('başlama saatinde hazır duruma geçer', () => {
    expect(waitingPhase(exam(), at('2026-03-10T10:00:00.000Z'), 0, false)).toBe('ready');
  });

  it('kapanış saatinden sonra kapalıdır', () => {
    expect(waitingPhase(exam(), at('2026-03-10T14:00:01.000Z'), 0, false)).toBe('closed');
  });

  it('deneme hakkı dolduysa girişe izin vermez', () => {
    expect(waitingPhase(exam(), at('2026-03-10T11:00:00.000Z'), 1, false)).toBe('used');
  });

  /* Yarım kalan oturuma dönmek yeni bir hak kullanmak değildir. */
  it('yarım kalan oturum varsa hak dolmuş olsa da devam ettirir', () => {
    const phase = waitingPhase(exam(), at('2026-03-10T11:00:00.000Z'), 1, true);

    expect(phase).toBe('in_progress');
    expect(canEnter(phase)).toBe(true);
  });

  it('yarım oturum olsa da pencere kapandıysa kapalıdır', () => {
    expect(waitingPhase(exam(), at('2026-03-10T15:00:00.000Z'), 1, true)).toBe('closed');
  });
});

describe('sessionExpiry', () => {
  it('normalde süreye göre biter', () => {
    const expiry = sessionExpiry(exam(), at('2026-03-10T10:00:00.000Z'));
    expect(expiry).toBe(at('2026-03-10T11:00:00.000Z'));
  });

  /* Kapanışa 10 dk kala başlayan öğrenci 60 dk kazanmamalı. */
  it('sınav penceresi daha erken kapanıyorsa onu uygular', () => {
    const expiry = sessionExpiry(exam(), at('2026-03-10T13:50:00.000Z'));
    expect(expiry).toBe(at('2026-03-10T14:00:00.000Z'));
  });
});

describe('durum makinesi', () => {
  it('geçerli geçişlere izin verir', () => {
    expect(canTransition('NOT_STARTED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'SUBMITTED')).toBe(true);
    expect(canTransition('PAUSED', 'IN_PROGRESS')).toBe(true);
  });

  it('teslim edilmiş oturumu yeniden açmaz', () => {
    expect(canTransition('SUBMITTED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('SUBMITTED', 'SUBMITTED')).toBe(false);
  });

  it('kapanmış durumları tanır', () => {
    expect(isClosed('SUBMITTED')).toBe(true);
    expect(isClosed('EXPIRED')).toBe(true);
    expect(isClosed('IN_PROGRESS')).toBe(false);
  });
});

describe('acceptsAnswerAt', () => {
  const expires = '2026-03-10T11:00:00.000Z';

  it('süre içindeki cevabı kabul eder', () => {
    expect(acceptsAnswerAt('IN_PROGRESS', expires, at('2026-03-10T10:59:00.000Z'))).toBe(true);
  });

  /* Son saniyedeki cevap ağ gecikmesi yüzünden kaybolmamalı. */
  it('kısa toleransla geç geleni kabul eder', () => {
    expect(acceptsAnswerAt('IN_PROGRESS', expires, at('2026-03-10T11:00:03.000Z'))).toBe(true);
  });

  it('toleransı aşan cevabı reddeder', () => {
    expect(acceptsAnswerAt('IN_PROGRESS', expires, at('2026-03-10T11:00:10.000Z'))).toBe(false);
  });

  it('teslim edilmiş oturumda cevap kabul etmez', () => {
    expect(acceptsAnswerAt('SUBMITTED', expires, at('2026-03-10T10:00:00.000Z'))).toBe(false);
  });

  it('bağlantı beklerken cevap kabul eder', () => {
    expect(acceptsAnswerAt('PAUSED', expires, at('2026-03-10T10:30:00.000Z'))).toBe(true);
  });
});

describe('navigatorStateOf', () => {
  const base = {
    currentQuestionId: 'q1',
    flagged: new Set(['q2']),
    visited: new Set(['q1', 'q2', 'q3']),
    answeredIds: new Set(['q2', 'q3']),
  };

  it('şu anki soru her şeyin üstündedir', () => {
    expect(navigatorStateOf({ ...base, questionId: 'q1' })).toBe('current');
  });

  /* Cevaplamış olmak "buraya döneceğim" niyetini geçersiz kılmaz. */
  it('işaret, cevaplanmış olmanın önüne geçer', () => {
    expect(navigatorStateOf({ ...base, questionId: 'q2' })).toBe('flagged');
  });

  it('cevaplanmış soruyu tanır', () => {
    expect(navigatorStateOf({ ...base, questionId: 'q3' })).toBe('answered');
  });

  it('görülmüş ama boş soruyu ayırt eder', () => {
    expect(
      navigatorStateOf({ ...base, questionId: 'q4', visited: new Set(['q4']) }),
    ).toBe('visited');
  });

  it('hiç açılmamış soruyu tanır', () => {
    expect(navigatorStateOf({ ...base, questionId: 'q9' })).toBe('not_visited');
  });
});

describe('answeredIdsOf ve buildSubmitSummary', () => {
  const drafts = [
    draft('q1', { kind: 'choice', optionIds: ['a'] }),
    draft('q2', { kind: 'choice', optionIds: [] }),
    draft('q3', { kind: 'text', value: '   ' }),
    draft('q4', { kind: 'numeric', value: 0 }),
  ];

  it('boş cevapları cevaplanmış saymaz', () => {
    expect([...answeredIdsOf(drafts)].sort()).toEqual(['q1', 'q4']);
  });

  it('teslim özetinde boş ve işaretli soru numaralarını verir', () => {
    const summary = buildSubmitSummary(
      ['q1', 'q2', 'q3', 'q4', 'q5'],
      drafts,
      new Set(['q2', 'q5']),
    );

    expect(summary.totalQuestions).toBe(5);
    expect(summary.answered).toBe(2);
    expect(summary.unanswered).toBe(3);
    expect(summary.unansweredNumbers).toEqual([2, 3, 5]);
    expect(summary.flaggedNumbers).toEqual([2, 5]);
  });
});

describe('sameAnswer', () => {
  it('seçim sırasını önemsemez', () => {
    expect(
      sameAnswer({ kind: 'choice', optionIds: ['a', 'b'] }, { kind: 'choice', optionIds: ['b', 'a'] }),
    ).toBe(true);
  });

  it('farklı seçimi ayırt eder', () => {
    expect(
      sameAnswer({ kind: 'choice', optionIds: ['a'] }, { kind: 'choice', optionIds: ['a', 'b'] }),
    ).toBe(false);
  });

  it('farklı türleri eşit saymaz', () => {
    expect(sameAnswer({ kind: 'text', value: '1' }, { kind: 'numeric', value: 1 })).toBe(false);
  });

  it('eşleştirmede sıra önemsizdir', () => {
    expect(
      sameAnswer(
        { kind: 'pairs', pairs: [{ leftId: 'a', rightId: '1' }, { leftId: 'b', rightId: '2' }] },
        { kind: 'pairs', pairs: [{ leftId: 'b', rightId: '2' }, { leftId: 'a', rightId: '1' }] },
      ),
    ).toBe(true);
  });

  /* Sıralama sorusunda sıra ANLAMIN kendisidir. */
  it('sıralamada sıra önemlidir', () => {
    expect(
      sameAnswer({ kind: 'sequence', itemIds: ['a', 'b'] }, { kind: 'sequence', itemIds: ['b', 'a'] }),
    ).toBe(false);
  });
});
