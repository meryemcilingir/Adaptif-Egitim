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
  'term:read',
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
  'term:read': 'Akademik dönem görüntüleme',
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

  /*
   * Eğitmen yalnızca KENDİ dersinin günlük işleyişinden sorumludur: içerik,
   * değerlendirme ve kendi ders kapsamındaki analitik. Soru bankası, blueprint
   * ve sınav oluşturma/yayınlama tamamen Ölçme Uzmanının işidir — eğitmen
   * sınavı yalnızca GÖRÜR ve değerlendirir, oluşturmaz. Ders/program kataloğu
   * (course:write) ve kazanım tanımı (outcome:write) Program Yöneticisinindir.
   */
  INSTRUCTOR: [
    'course:read',
    'outcome:read',
    'content:read',
    'content:write',
    'exam:read',
    'attempt:read',
    'attempt:grade',
    'rubric:write',
    'analytics:student',
    'analytics:cohort',
  ],

  /*
   * Ölçme uzmanı, soru bankası → blueprint → sınav oluşturucu hattının TEK
   * sahibidir; bu yüzden `exam:publish` de burada — Taslak→İnceleme→Yayında
   * geçişlerinin tamamı bu izni ister (aksi hâlde sihirbazı sonuna kadar
   * kullanamaz).
   */
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
    'exam:publish',
    /*
     * Ölçme uzmanı ölçme ARAÇLARINDAN (soru, blueprint, sınav) sorumludur;
     * öğrenci cevaplarını değerlendirmek eğitmenin işidir — bu yüzden
     * `attempt:grade` burada YOK. Sonuçları görebilir (`attempt:read`,
     * madde analizi için) ama puanlayamaz.
     */
    'attempt:read',
    'analytics:student',
    'analytics:cohort',
    'analytics:item',
  ],

  /*
   * Program yöneticisi kataloğun (program/ders/kazanım) akademik sahibidir;
   * soru/blueprint/madde analizi ölçme uzmanının işidir — bu yüzden onlara
   * dokunmaz. `term:read` ile akademik takvimi salt okunur görür.
   */
  PROGRAM_MANAGER: [
    'course:read',
    'course:write',
    'course:publish',
    'outcome:read',
    'outcome:write',
    'outcome:map',
    'content:read',
    'content:write',
    'exam:read',
    'exam:publish',
    'session:terminate',
    'attempt:read',
    'attempt:override',
    'analytics:student',
    'analytics:cohort',
    'term:read',
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
   * Platform yöneticisi akademik sürecin SAHİBİ değildir — yalnızca sistemin
   * işletim yöneticisidir: rol/izin, akademik dönem ve sistem parametrelerini
   * yönetir (ADR-077). Ders, kazanım, soru, sınav, değerlendirme ve tüm
   * analitik ekranları kapsamı dışındadır; bunlar Program Yöneticisi, Ölçme
   * Uzmanı ve Eğitmenin işidir.
   *
   * `analytics:student` yalnızca `/learning/dashboard` (Panel) rotasının
   * kapısı olduğu için burada — panelin kendi verisi (kullanıcı/denetim
   * sayıları) zaten sunucu tarafında ayrıca derlenir, akademik veriye erişim
   * gerektirmez. `audit:read` ayrı tutulur çünkü `/audit-log` rotası özellikle
   * bu izni ister, `admin:manage`'in kapsamadığı tek istisnadır.
   */
  PLATFORM_ADMIN: ['analytics:student', 'audit:read', 'admin:manage'],
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
