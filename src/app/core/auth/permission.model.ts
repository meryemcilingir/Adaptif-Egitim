/**
 * Rol ve izin sözleşmesi. İzin matrisi PROJECT_RULES.md §6 ile birebir aynıdır.
 *
 * Open/Closed: yeni bir rol eklemek = `ROLE_PERMISSIONS`'a satır eklemek.
 * Guard, direktif ve servis kodları değişmez.
 */

export const ROLES = [
  'STUDENT',
  'INSTRUCTOR',
  'ASSESSMENT_SPECIALIST',
  'PROGRAM_MANAGER',
  'OBSERVER',
  'PLATFORM_ADMIN',
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Readonly<Record<Role, string>> = {
  STUDENT: 'Öğrenci',
  INSTRUCTOR: 'Eğitmen',
  ASSESSMENT_SPECIALIST: 'Ölçme Uzmanı',
  PROGRAM_MANAGER: 'Program Yöneticisi',
  OBSERVER: 'Gözlemci',
  PLATFORM_ADMIN: 'Platform Yöneticisi',
};

export const ROLE_DESCRIPTIONS: Readonly<Record<Role, string>> = {
  STUDENT: 'Atanan dersleri, adaptif çalışma planını ve sınav oturumlarını kullanır.',
  INSTRUCTOR: 'İçerik, soru, rubrik, değerlendirme ve öğrenci ilerlemesini yönetir.',
  ASSESSMENT_SPECIALIST: 'Soru kalitesi, blueprint, zorluk ve ayırt edicilik analizlerini inceler.',
  PROGRAM_MANAGER: 'Kazanım haritası, program, cohort ve yayın süreçlerini yönetir.',
  OBSERVER: 'Yetkili cohort için salt okunur raporlara erişir.',
  PLATFORM_ADMIN: 'Rol, izin, dönem ve sistem parametrelerini yönetir.',
};

/** `resource:action` biçiminde izinler. */
export const PERMISSIONS = [
  'course:read',
  'course:write',
  'course:publish',
  'outcome:read',
  'outcome:write',
  'outcome:map',
  'content:read',
  'content:write',
  'question:read',
  'question:write',
  'question:publish',
  'blueprint:read',
  'blueprint:write',
  'exam:read',
  'exam:write',
  'exam:publish',
  'session:start',
  'session:terminate',
  'attempt:read',
  'attempt:grade',
  'attempt:override',
  'rubric:write',
  'analytics:student',
  'analytics:cohort',
  'analytics:item',
  'audit:read',
  'admin:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Readonly<Record<Permission, string>> = {
  'course:read': 'Ders görüntüleme',
  'course:write': 'Ders düzenleme',
  'course:publish': 'Ders yayınlama',
  'outcome:read': 'Kazanım görüntüleme',
  'outcome:write': 'Kazanım düzenleme',
  'outcome:map': 'Kazanım haritası yönetimi',
  'content:read': 'İçerik görüntüleme',
  'content:write': 'İçerik düzenleme',
  'question:read': 'Soru görüntüleme',
  'question:write': 'Soru düzenleme',
  'question:publish': 'Soru yayınlama',
  'blueprint:read': 'Blueprint görüntüleme',
  'blueprint:write': 'Blueprint düzenleme',
  'exam:read': 'Sınav görüntüleme',
  'exam:write': 'Sınav düzenleme',
  'exam:publish': 'Sınav yayınlama',
  'session:start': 'Sınav oturumu başlatma',
  'session:terminate': 'Sınav oturumu sonlandırma',
  'attempt:read': 'Sonuç görüntüleme',
  'attempt:grade': 'Değerlendirme yapma',
  'attempt:override': 'Puan geçersiz kılma',
  'rubric:write': 'Rubrik düzenleme',
  'analytics:student': 'Öğrenci analitiği',
  'analytics:cohort': 'Cohort analitiği',
  'analytics:item': 'Madde analizi',
  'audit:read': 'Denetim kaydı görüntüleme',
  'admin:manage': 'Sistem yönetimi',
};

/** İzin matrisi — tek doğruluk kaynağı. */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  STUDENT: [
    'course:read',
    'outcome:read',
    'content:read',
    'exam:read',
    'session:start',
    'attempt:read',
    'analytics:student',
  ],

  INSTRUCTOR: [
    'course:read',
    'course:write',
    'outcome:read',
    'outcome:write',
    'content:read',
    'content:write',
    'question:read',
    'question:write',
    'question:publish',
    'blueprint:read',
    'blueprint:write',
    'exam:read',
    'exam:write',
    'exam:publish',
    'session:terminate',
    'attempt:read',
    'attempt:grade',
    'rubric:write',
    'analytics:student',
    'analytics:cohort',
  ],

  ASSESSMENT_SPECIALIST: [
    'course:read',
    'outcome:read',
    'question:read',
    'question:write',
    'question:publish',
    'blueprint:read',
    'blueprint:write',
    'exam:read',
    'exam:write',
    'attempt:read',
    // Açık uçlu cevapların rubrikle puanlanması ölçme uzmanının asli işidir.
    'attempt:grade',
    'analytics:student',
    'analytics:cohort',
    'analytics:item',
  ],

  PROGRAM_MANAGER: [
    'course:read',
    'course:write',
    'course:publish',
    'outcome:read',
    'outcome:write',
    'outcome:map',
    'content:read',
    'content:write',
    'blueprint:read',
    'exam:read',
    'exam:publish',
    'session:terminate',
    'attempt:read',
    'attempt:override',
    'analytics:student',
    'analytics:cohort',
    'analytics:item',
  ],

  OBSERVER: [
    'course:read',
    'outcome:read',
    'content:read',
    'exam:read',
    'attempt:read',
    'analytics:student',
    'analytics:cohort',
  ],

  /*
   * Platform yöneticisi tüm yönetim izinlerine sahiptir; ancak `session:start`
   * ÖĞRENCİYE ÖZGÜ bir eylemdir (sınava girmek). İzin matrisinde de yalnızca
   * öğrencide tanımlıdır — yönetici sınav oturumu başlatamaz.
   */
  PLATFORM_ADMIN: PERMISSIONS.filter((permission) => permission !== 'session:start'),
};

/**
 * Veri kapsamı — bir rolün hangi kayıtları görebileceğini belirler.
 * Genişten dara: global > program > course > cohort > own
 */
export const DATA_SCOPES = ['own', 'course', 'cohort', 'program', 'global'] as const;
export type DataScope = (typeof DATA_SCOPES)[number];

export const ROLE_DATA_SCOPE: Readonly<Record<Role, DataScope>> = {
  STUDENT: 'own',
  INSTRUCTOR: 'course',
  ASSESSMENT_SPECIALIST: 'program',
  PROGRAM_MANAGER: 'program',
  OBSERVER: 'cohort',
  PLATFORM_ADMIN: 'global',
};

export function permissionsForRoles(roles: readonly Role[]): readonly Permission[] {
  return [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))];
}

/** Birden fazla rol varsa en geniş kapsam geçerlidir. */
export function widestScope(roles: readonly Role[]): DataScope {
  return roles.reduce<DataScope>((widest, role) => {
    const scope = ROLE_DATA_SCOPE[role];
    return DATA_SCOPES.indexOf(scope) > DATA_SCOPES.indexOf(widest) ? scope : widest;
  }, 'own');
}
