import { describe, expect, it } from 'vitest';

import {
  TERM_LIMITS,
  TermInput,
  TermRecord,
  activeTerm,
  findOverlap,
  isEditable,
  sortTerms,
  termName,
  termStatus,
  validateAcademicYear,
  validateTerm,
} from './academic-term.rules';

const NOW = Date.parse('2026-03-15T12:00:00.000Z');

function record(overrides: Partial<TermRecord> = {}): TermRecord {
  return {
    id: 'trm_1',
    academicYear: '2025-2026',
    semester: 'SPRING',
    startDate: '2026-02-01',
    endDate: '2026-06-15',
    archivedAt: null,
    ...overrides,
  };
}

function input(overrides: Partial<TermInput> = {}): TermInput {
  return {
    id: null,
    academicYear: '2026-2027',
    semester: 'FALL',
    startDate: '2026-09-15',
    endDate: '2027-01-20',
    ...overrides,
  };
}

describe('validateAcademicYear', () => {
  it('doğru biçimi kabul eder', () => {
    expect(validateAcademicYear('2025-2026')).toBeNull();
  });

  it('biçim bozuksa reddeder', () => {
    expect(validateAcademicYear('2025')).not.toBeNull();
    expect(validateAcademicYear('25-26')).not.toBeNull();
  });

  it('ardışık olmayan yılları reddeder', () => {
    const violation = validateAcademicYear('2025-2030');
    expect(violation?.field).toBe('academicYear');
  });
});

describe('validateTerm', () => {
  it('geçerli dönemde ihlal üretmez', () => {
    expect(validateTerm(input(), [record()], NOW)).toEqual([]);
  });

  it('bitiş başlangıçtan önceyse reddeder', () => {
    const violations = validateTerm(
      input({ startDate: '2026-09-15', endDate: '2026-09-01' }),
      [],
      NOW,
    );

    expect(violations.some((violation) => violation.field === 'endDate')).toBe(true);
  });

  it('çok kısa dönemi reddeder', () => {
    const violations = validateTerm(
      input({ startDate: '2026-09-15', endDate: '2026-09-18' }),
      [],
      NOW,
    );

    expect(violations[0]?.message).toContain(String(TERM_LIMITS.minDays));
  });

  it('tarihleri çakışan dönemi reddeder', () => {
    const violations = validateTerm(
      input({ startDate: '2026-05-01', endDate: '2026-09-01' }),
      [record()],
      NOW,
    );

    expect(violations.some((violation) => violation.field === 'form')).toBe(true);
  });

  it('arşivlenmiş dönemle çakışmayı yok sayar', () => {
    const archived = record({ archivedAt: '2026-01-01T00:00:00.000Z' });

    const violations = validateTerm(
      input({ startDate: '2026-05-01', endDate: '2026-09-01' }),
      [archived],
      NOW,
    );

    expect(violations).toEqual([]);
  });

  it('aynı yıl ve yarıyıl ikinci kez tanımlanamaz', () => {
    const violations = validateTerm(
      input({ academicYear: '2025-2026', semester: 'SPRING', startDate: '2026-08-01', endDate: '2026-08-20' }),
      [record()],
      NOW,
    );

    expect(violations.some((violation) => violation.field === 'semester')).toBe(true);
  });

  it('tamamlanmış dönem düzenlenemez', () => {
    const past = record({ id: 'trm_past', startDate: '2025-09-01', endDate: '2026-01-20' });

    const violations = validateTerm(
      { ...input(), id: 'trm_past', startDate: '2025-09-01', endDate: '2026-01-25' },
      [past],
      NOW,
    );

    expect(violations.some((violation) => violation.message.includes('Tamamlanmış'))).toBe(true);
  });

  it('kendi kaydını çakışma sayması gerekmez', () => {
    const violations = validateTerm(
      { ...input(), id: 'trm_1', academicYear: '2025-2026', semester: 'SPRING', startDate: '2026-02-01', endDate: '2026-06-20' },
      [record()],
      NOW,
    );

    expect(violations).toEqual([]);
  });
});

describe('findOverlap', () => {
  it('uçları paylaşan dönemleri çakışma sayar', () => {
    const overlap = findOverlap(
      input({ startDate: '2026-06-15', endDate: '2026-08-15' }),
      [record()],
    );

    expect(overlap?.id).toBe('trm_1');
  });

  it('bitişik ama ayrık dönemleri çakışma saymaz', () => {
    const overlap = findOverlap(
      input({ startDate: '2026-06-16', endDate: '2026-08-15' }),
      [record()],
    );

    expect(overlap).toBeNull();
  });
});

describe('termStatus', () => {
  it('bugünü kapsayan dönem aktiftir', () => {
    expect(termStatus(record(), NOW)).toBe('ACTIVE');
  });

  it('başlamamış dönem yaklaşandır', () => {
    expect(termStatus(record({ startDate: '2026-09-01', endDate: '2027-01-15' }), NOW)).toBe(
      'UPCOMING',
    );
  });

  it('bitmiş dönem tamamlanmıştır', () => {
    expect(termStatus(record({ startDate: '2025-09-01', endDate: '2026-01-20' }), NOW)).toBe(
      'COMPLETED',
    );
  });

  it('arşiv her zaman takvimin önündedir', () => {
    expect(termStatus(record({ archivedAt: '2026-03-01T00:00:00.000Z' }), NOW)).toBe('ARCHIVED');
  });
});

describe('activeTerm', () => {
  it('aynı anda yalnızca bir dönem aktif olabilir', () => {
    const terms = [
      record({ id: 'a', startDate: '2025-09-01', endDate: '2026-01-20' }),
      record({ id: 'b' }),
      record({ id: 'c', startDate: '2026-09-01', endDate: '2027-01-15' }),
    ];

    expect(activeTerm(terms, NOW)?.id).toBe('b');
    expect(terms.filter((term) => termStatus(term, NOW) === 'ACTIVE')).toHaveLength(1);
  });

  it('aktif dönem yoksa null döner', () => {
    expect(activeTerm([record({ startDate: '2026-09-01', endDate: '2027-01-15' })], NOW)).toBeNull();
  });
});

describe('isEditable', () => {
  it('aktif ve yaklaşan dönemler düzenlenebilir', () => {
    expect(isEditable(record(), NOW)).toBe(true);
    expect(isEditable(record({ startDate: '2026-09-01', endDate: '2027-01-15' }), NOW)).toBe(true);
  });

  it('tamamlanmış ve arşivlenmiş dönemler düzenlenemez', () => {
    expect(isEditable(record({ startDate: '2025-09-01', endDate: '2026-01-20' }), NOW)).toBe(false);
    expect(isEditable(record({ archivedAt: '2026-03-01T00:00:00.000Z' }), NOW)).toBe(false);
  });
});

describe('sortTerms', () => {
  it('en yeni dönem başa gelir', () => {
    const sorted = sortTerms([
      record({ id: 'eski', startDate: '2025-09-01', endDate: '2026-01-20' }),
      record({ id: 'yeni', startDate: '2026-09-01', endDate: '2027-01-15' }),
    ]);

    expect(sorted[0]?.id).toBe('yeni');
  });
});

describe('termName', () => {
  it('okunabilir ad üretir', () => {
    expect(termName({ academicYear: '2025-2026', semester: 'SPRING' })).toBe('2025-2026 Bahar');
  });
});
