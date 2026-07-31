import { describe, expect, it } from 'vitest';

import { PUBLISH_STATES, PublishState } from '../models/common.model';
import {
  actionFor,
  allowedTransitions,
  availableActions,
  canTransition,
  isDeletable,
  isEditable,
  transitionError,
} from './publish-workflow';

describe('canTransition', () => {
  it('şartnamedeki akışa izin verir', () => {
    expect(canTransition('DRAFT', 'REVIEW')).toBe(true);
    expect(canTransition('REVIEW', 'PUBLISHED')).toBe(true);
    expect(canTransition('PUBLISHED', 'ARCHIVED')).toBe(true);
  });

  it('incelemeden taslağa geri çekmeye izin verir', () => {
    expect(canTransition('REVIEW', 'DRAFT')).toBe(true);
  });

  it('arşivden geri alma taslak durumuna döner', () => {
    expect(canTransition('ARCHIVED', 'DRAFT')).toBe(true);
    expect(canTransition('ARCHIVED', 'PUBLISHED')).toBe(false);
  });

  it('adım atlamayı engeller', () => {
    expect(canTransition('DRAFT', 'PUBLISHED')).toBe(false);
    expect(canTransition('DRAFT', 'ARCHIVED')).toBe(false);
    expect(canTransition('REVIEW', 'ARCHIVED')).toBe(false);
  });

  it('geriye doğru geçersiz geçişleri engeller', () => {
    expect(canTransition('PUBLISHED', 'DRAFT')).toBe(false);
    expect(canTransition('PUBLISHED', 'REVIEW')).toBe(false);
  });

  it('aynı duruma geçişi engeller', () => {
    for (const state of PUBLISH_STATES) {
      expect(canTransition(state, state)).toBe(false);
    }
  });
});

describe('availableActions', () => {
  it('her izin verilen geçiş için bir eylem tanımlıdır', () => {
    for (const state of PUBLISH_STATES) {
      const targets = allowedTransitions(state);
      const actions = availableActions(state);

      expect(actions).toHaveLength(targets.length);
      expect(actions.map((action) => action.target).sort()).toEqual([...targets].sort());
    }
  });

  it('geri dönüşü zor eylemler onay ister', () => {
    expect(actionFor('REVIEW', 'PUBLISHED')?.requiresConfirmation).toBe(true);
    expect(actionFor('PUBLISHED', 'ARCHIVED')?.requiresConfirmation).toBe(true);
  });

  it('geri alınabilir eylemler onay istemez', () => {
    expect(actionFor('DRAFT', 'REVIEW')?.requiresConfirmation).toBe(false);
    expect(actionFor('REVIEW', 'DRAFT')?.requiresConfirmation).toBe(false);
    expect(actionFor('ARCHIVED', 'DRAFT')?.requiresConfirmation).toBe(false);
  });

  it('geçersiz geçiş için eylem döndürmez', () => {
    expect(actionFor('DRAFT', 'PUBLISHED')).toBeNull();
  });
});

describe('isEditable / isDeletable', () => {
  it('yalnızca taslak ve incelemedeki kayıtlar düzenlenebilir', () => {
    expect(isEditable('DRAFT')).toBe(true);
    expect(isEditable('REVIEW')).toBe(true);
    expect(isEditable('PUBLISHED')).toBe(false);
    expect(isEditable('ARCHIVED')).toBe(false);
  });

  it('yalnızca taslak kayıtlar silinebilir', () => {
    expect(isDeletable('DRAFT')).toBe(true);
    expect(isDeletable('REVIEW')).toBe(false);
    expect(isDeletable('PUBLISHED')).toBe(false);
    expect(isDeletable('ARCHIVED')).toBe(false);
  });
});

describe('transitionError', () => {
  it('izin verilen geçişleri kullanıcıya söyler', () => {
    const message = transitionError('DRAFT', 'PUBLISHED');

    expect(message).toContain('Taslak');
    expect(message).toContain('Yayında');
    expect(message).toContain('İncelemede');
  });

  it('her durum için okunabilir bir mesaj üretir', () => {
    for (const from of PUBLISH_STATES) {
      for (const to of PUBLISH_STATES) {
        if (canTransition(from, to)) continue;
        expect(transitionError(from, to as PublishState).length).toBeGreaterThan(0);
      }
    }
  });
});
