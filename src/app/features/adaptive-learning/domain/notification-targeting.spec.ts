import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN_LIMITS,
  NotificationTarget,
  TargetableUser,
  resolveRecipients,
  validateCampaign,
} from './notification-targeting';

function user(overrides: Partial<TargetableUser> = {}): TargetableUser {
  return {
    id: 'usr_1',
    roles: ['STUDENT'],
    programId: 'prg_1',
    courseIds: ['crs_1'],
    cohortIds: ['coh_1'],
    state: 'ACTIVE',
    ...overrides,
  };
}

const USERS: readonly TargetableUser[] = [
  user({ id: 'ogrenci' }),
  user({ id: 'egitmen', roles: ['INSTRUCTOR'], cohortIds: [], courseIds: ['crs_1', 'crs_2'] }),
  user({ id: 'baska-program', programId: 'prg_2', courseIds: ['crs_9'], cohortIds: ['coh_9'] }),
  user({ id: 'arsiv', state: 'ARCHIVED' }),
];

function target(audience: NotificationTarget['audience'], value: string | null = null) {
  return { audience, value };
}

describe('resolveRecipients', () => {
  it('tüm kullanıcılar hedefi arşivlenmişleri dışarıda bırakır', () => {
    expect(resolveRecipients(target('all'), USERS)).toEqual([
      'ogrenci',
      'egitmen',
      'baska-program',
    ]);
  });

  it('role göre süzer', () => {
    expect(resolveRecipients(target('role', 'INSTRUCTOR'), USERS)).toEqual(['egitmen']);
  });

  it('programa göre süzer', () => {
    expect(resolveRecipients(target('program', 'prg_1'), USERS)).toEqual(['ogrenci', 'egitmen']);
  });

  it('derse göre süzer', () => {
    expect(resolveRecipients(target('course', 'crs_2'), USERS)).toEqual(['egitmen']);
  });

  it('gruba göre süzer', () => {
    expect(resolveRecipients(target('cohort', 'coh_1'), USERS)).toEqual(['ogrenci']);
  });

  it('tek kullanıcıyı seçer', () => {
    expect(resolveRecipients(target('user', 'egitmen'), USERS)).toEqual(['egitmen']);
  });

  it('arşivlenmiş kullanıcı doğrudan hedeflense bile alıcı olmaz', () => {
    expect(resolveRecipients(target('user', 'arsiv'), USERS)).toEqual([]);
  });

  it('eşleşme yoksa boş liste döner', () => {
    expect(resolveRecipients(target('cohort', 'yok'), USERS)).toEqual([]);
  });
});

describe('validateCampaign', () => {
  const base = {
    title: 'Bakım duyurusu',
    body: 'Sistem cumartesi 02:00-04:00 arasında bakımda olacaktır.',
    target: target('all'),
    recipientCount: 3,
  };

  it('geçerli kampanyayı kabul eder', () => {
    expect(validateCampaign(base)).toEqual([]);
  });

  it('kısa başlığı reddeder', () => {
    expect(validateCampaign({ ...base, title: 'ab' })[0]?.field).toBe('title');
  });

  it('uzun başlığı reddeder', () => {
    const violations = validateCampaign({
      ...base,
      title: 'a'.repeat(CAMPAIGN_LIMITS.title.max + 1),
    });

    expect(violations[0]?.field).toBe('title');
  });

  it('uzun içeriği reddeder', () => {
    const violations = validateCampaign({
      ...base,
      body: 'a'.repeat(CAMPAIGN_LIMITS.body.max + 1),
    });

    expect(violations.some((violation) => violation.field === 'body')).toBe(true);
  });

  it('hedef seçilmemişse reddeder', () => {
    const violations = validateCampaign({ ...base, target: target('cohort', null) });

    expect(violations.some((violation) => violation.field === 'target')).toBe(true);
  });

  it('alıcısı olmayan kampanyayı reddeder', () => {
    const violations = validateCampaign({ ...base, recipientCount: 0 });

    expect(violations.some((violation) => violation.field === 'target')).toBe(true);
  });
});
