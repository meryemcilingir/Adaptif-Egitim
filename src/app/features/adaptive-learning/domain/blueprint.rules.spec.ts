import { describe, expect, it } from 'vitest';

import { BlueprintOutcomeRow } from '../models/blueprint.model';
import {
  alignRows,
  blueprintDifficultyCounts,
  blueprintTotalQuestions,
  emptyRows,
  summarizeBlueprint,
} from './blueprint.rules';
import { examRuntimeStatus, isOpenForAttempt, isVisibleToStudent } from './exam-runtime';

const rows: BlueprintOutcomeRow[] = [
  { outcomeId: 'out1', easy: 2, medium: 1, hard: 1 },
  { outcomeId: 'out2', easy: 0, medium: 2, hard: 0 },
  { outcomeId: 'out3', easy: 0, medium: 0, hard: 0 },
];

describe('blueprint toplamları', () => {
  it('toplam soru sayısını hesaplar', () => {
    expect(blueprintTotalQuestions(rows)).toBe(6);
  });

  it('zorluk kırılımını hesaplar', () => {
    expect(blueprintDifficultyCounts(rows)).toEqual({ easy: 2, medium: 3, hard: 1 });
  });

  it('boş planda sıfır döner', () => {
    expect(blueprintTotalQuestions([])).toBe(0);
  });
});

describe('summarizeBlueprint', () => {
  const summary = summarizeBlueprint(
    { rows, targetTotalPoints: 60, targetDurationMinutes: 90 },
    ['out1', 'out2', 'out3', 'out4'],
  );

  it('hedefleri aynen taşır', () => {
    expect(summary.targetTotalPoints).toBe(60);
    expect(summary.targetDurationMinutes).toBe(90);
  });

  it('yalnızca soru istenen kazanımları kapsanmış sayar', () => {
    // out3 satırı var ama tüm hücreleri sıfır → kapsanmamış.
    expect(summary.coveredOutcomes).toBe(2);
    expect(summary.totalOutcomes).toBe(4);
    expect(summary.coveragePercent).toBe(50);
  });

  it('soru istenmeyen kazanımları listeler', () => {
    expect(summary.emptyOutcomeIds).toEqual(['out3', 'out4']);
  });

  it('zorluk yüzdelerini hesaplar', () => {
    const medium = summary.difficultyShares.find((share) => share.difficulty === 'medium');
    expect(medium).toEqual(expect.objectContaining({ count: 3, percent: 50 }));
  });

  it('hiç soru yoksa yüzdeleri sıfırlar', () => {
    const empty = summarizeBlueprint(
      { rows: emptyRows(['out1']), targetTotalPoints: 10, targetDurationMinutes: 30 },
      ['out1'],
    );

    expect(empty.totalQuestions).toBe(0);
    expect(empty.coveragePercent).toBe(0);
    expect(empty.difficultyShares.every((share) => share.percent === 0)).toBe(true);
  });
});

describe('alignRows', () => {
  it('eksik kazanımlar için sıfırlı satır ekler', () => {
    const aligned = alignRows([rows[0]!], ['out1', 'out2']);

    expect(aligned).toHaveLength(2);
    expect(aligned[1]).toEqual({ outcomeId: 'out2', easy: 0, medium: 0, hard: 0 });
  });

  it('artık var olmayan kazanımın satırını düşürür', () => {
    const aligned = alignRows(rows, ['out1']);

    expect(aligned).toHaveLength(1);
    expect(aligned[0]!.outcomeId).toBe('out1');
  });

  it('mevcut değerleri korur', () => {
    expect(alignRows(rows, ['out1'])[0]).toEqual(rows[0]);
  });
});

/* ── Çalışma durumu ──────────────────────────────────────────────────────── */

const OPENS = Date.parse('2026-04-01T09:00:00.000Z');
const CLOSES = Date.parse('2026-04-01T13:00:00.000Z');

function exam(state: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED') {
  return {
    state,
    opensAt: new Date(OPENS).toISOString(),
    closesAt: new Date(CLOSES).toISOString(),
  };
}

describe('examRuntimeStatus', () => {
  it('yayında olmayan sınav daima hazır değildir', () => {
    expect(examRuntimeStatus(exam('DRAFT'), OPENS + 1000)).toBe('not_ready');
    expect(examRuntimeStatus(exam('REVIEW'), OPENS + 1000)).toBe('not_ready');
    expect(examRuntimeStatus(exam('ARCHIVED'), OPENS + 1000)).toBe('not_ready');
  });

  it('açılıştan önce planlanmıştır', () => {
    expect(examRuntimeStatus(exam('PUBLISHED'), OPENS - 1000)).toBe('scheduled');
  });

  it('pencere içinde devam eder', () => {
    expect(examRuntimeStatus(exam('PUBLISHED'), OPENS + 1000)).toBe('active');
  });

  it('kapanıştan sonra kapanmıştır', () => {
    expect(examRuntimeStatus(exam('PUBLISHED'), CLOSES + 1000)).toBe('closed');
  });

  it('sınır anlarını dahil eder', () => {
    expect(examRuntimeStatus(exam('PUBLISHED'), OPENS)).toBe('active');
    expect(examRuntimeStatus(exam('PUBLISHED'), CLOSES)).toBe('active');
  });

  it('geçersiz tarihte hazır değildir', () => {
    expect(
      examRuntimeStatus({ state: 'PUBLISHED', opensAt: 'yok', closesAt: 'yok' }, OPENS),
    ).toBe('not_ready');
  });
});

describe('görünürlük ve oturum kuralları', () => {
  it('öğrenci yalnızca yayındaki sınavları görür', () => {
    expect(isVisibleToStudent('not_ready')).toBe(false);
    expect(isVisibleToStudent('scheduled')).toBe(true);
    expect(isVisibleToStudent('closed')).toBe(true);
  });

  it('oturum yalnızca devam eden sınavda açılır', () => {
    expect(isOpenForAttempt('active')).toBe(true);
    expect(isOpenForAttempt('scheduled')).toBe(false);
  });
});
