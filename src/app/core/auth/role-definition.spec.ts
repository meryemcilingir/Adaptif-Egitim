import { describe, expect, it } from 'vitest';

import { PERMISSIONS, ROLES, ROLE_PERMISSIONS } from './permission.model';
import {
  PERMISSION_GROUPS,
  RoleDefinition,
  isPermissionLocked,
  permissionsFromDefinitions,
  systemRoleSeeds,
  validateRoleDefinition,
} from './role-definition';

const NOW_ISO = '2026-08-01T09:00:00.000Z';

function definition(overrides: Partial<RoleDefinition> = {}): RoleDefinition {
  return {
    id: 'rol_1',
    key: 'INSTRUCTOR',
    name: 'Eğitmen',
    description: '',
    permissions: ['course:read', 'exam:read'],
    system: true,
    archivedAt: null,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
    version: 1,
    ...overrides,
  };
}

describe('PERMISSION_GROUPS', () => {
  it('her izni tam olarak bir gruba yerleştirir', () => {
    const grouped = PERMISSION_GROUPS.flatMap((group) => group.permissions);

    expect([...grouped].sort()).toEqual([...PERMISSIONS].sort());
    expect(new Set(grouped).size).toBe(PERMISSIONS.length);
  });

  it('boş grup bırakmaz', () => {
    expect(PERMISSION_GROUPS.every((group) => group.permissions.length > 0)).toBe(true);
  });
});

describe('systemRoleSeeds', () => {
  it('altı sistem rolünü derleme zamanı matrisinden üretir', () => {
    const seeds = systemRoleSeeds(NOW_ISO);

    expect(seeds).toHaveLength(ROLES.length);
    expect(seeds.every((seed) => seed.system)).toBe(true);

    for (const seed of seeds) {
      expect(seed.permissions).toEqual([...ROLE_PERMISSIONS[seed.key as never]]);
    }
  });
});

describe('validateRoleDefinition', () => {
  const base = {
    key: 'CUSTOM',
    name: 'Bölüm Koordinatörü',
    description: 'Bölüm derslerini izler.',
    permissions: ['course:read'] as const,
    existingNames: [] as readonly string[],
  };

  it('geçerli tanımı kabul eder', () => {
    expect(validateRoleDefinition({ ...base, permissions: [...base.permissions] })).toEqual([]);
  });

  it('kısa adı reddeder', () => {
    const violations = validateRoleDefinition({
      ...base,
      name: 'AB',
      permissions: [...base.permissions],
    });

    expect(violations[0]?.field).toBe('name');
  });

  it('aynı adı büyük-küçük harf farkına rağmen yakalar', () => {
    const violations = validateRoleDefinition({
      ...base,
      permissions: [...base.permissions],
      existingNames: ['bölüm koordinatörü'],
    });

    expect(violations.some((violation) => violation.field === 'name')).toBe(true);
  });

  it('izinsiz rolü reddeder', () => {
    const violations = validateRoleDefinition({ ...base, permissions: [] });

    expect(violations[0]?.field).toBe('permissions');
  });

  it('platform yöneticisinden admin:manage kaldırılamaz', () => {
    const violations = validateRoleDefinition({
      key: 'PLATFORM_ADMIN',
      name: 'Platform Yöneticisi',
      description: '',
      permissions: ['course:read'],
      existingNames: [],
    });

    expect(violations.some((violation) => violation.field === 'permissions')).toBe(true);
  });

  it('kilitli izin bilgisini tek yerden okur', () => {
    expect(isPermissionLocked('PLATFORM_ADMIN', 'admin:manage')).toBe(true);
    expect(isPermissionLocked('INSTRUCTOR', 'admin:manage')).toBe(false);
  });
});

describe('permissionsFromDefinitions', () => {
  it('veritabanı tanımını derleme zamanı varsayılanının önüne alır', () => {
    const permissions = permissionsFromDefinitions(
      ['INSTRUCTOR'],
      [definition({ permissions: ['course:read'] })],
    );

    expect(permissions).toEqual(['course:read']);
  });

  it('birden fazla rolün izinlerini tekilleştirerek birleştirir', () => {
    const permissions = permissionsFromDefinitions(
      ['INSTRUCTOR', 'OBSERVER'],
      [
        definition({ key: 'INSTRUCTOR', permissions: ['course:read', 'exam:read'] }),
        definition({ id: 'rol_2', key: 'OBSERVER', permissions: ['course:read', 'attempt:read'] }),
      ],
    );

    expect([...permissions].sort()).toEqual(['attempt:read', 'course:read', 'exam:read']);
  });

  it('tanım bulunamazsa derleme zamanı varsayılanına düşer', () => {
    const permissions = permissionsFromDefinitions(['OBSERVER'], []);

    expect(permissions).toEqual([...ROLE_PERMISSIONS.OBSERVER]);
  });

  it('arşivlenmiş tanımı yok sayıp varsayılana düşer', () => {
    const permissions = permissionsFromDefinitions(
      ['OBSERVER'],
      [definition({ key: 'OBSERVER', permissions: [], archivedAt: NOW_ISO })],
    );

    expect(permissions).toEqual([...ROLE_PERMISSIONS.OBSERVER]);
  });
});
