/**
 * Denetim kaydı sözleşmesi (BR-18).
 * Yayın, puan değişikliği, oturum sonlandırma ve override işlemleri kayıt üretir.
 */

export const AUDIT_ACTIONS = [
  'program.created',
  'program.updated',
  'program.deleted',
  'program.published',
  'program.archived',
  'program.restored',
  'course.created',
  'course.updated',
  'course.deleted',
  'course.published',
  'course.archived',
  'course.restored',
  'outcome.created',
  'outcome.deleted',
  'outcome.published',
  'outcome.archived',
  'outcome.restored',
  'outcome.prerequisites.updated',
  'outcome.updated',
  'outcome.graph.updated',
  'content.created',
  'content.updated',
  'content.deleted',
  'content.published',
  'content.archived',
  'content.restored',
  'question.created',
  'question.updated',
  'question.deleted',
  'question.restored',
  'question.archived',
  'question.duplicated',
  'question.published',
  'question.versioned',
  'blueprint.created',
  'blueprint.updated',
  'blueprint.deleted',
  'blueprint.published',
  'blueprint.archived',
  'blueprint.restored',
  'exam.created',
  'exam.updated',
  'exam.deleted',
  'exam.duplicated',
  'exam.review_requested',
  'exam.published',
  'exam.archived',
  'exam.restored',
  'exam.closed',
  'session.started',
  'session.terminated',
  'session.submitted',
  'attempt.graded',
  'attempt.score.overridden',
  'attempt.released',
  'permission.denied',
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'user.created',
  'user.updated',
  'user.disabled',
  'user.enabled',
  'user.archived',
  'user.restored',
  'user.deleted',
  'user.password_reset',
  'user.unlocked',
  'user.roles_changed',
  'role.created',
  'role.updated',
  'role.duplicated',
  'role.archived',
  'role.restored',
  'term.created',
  'term.updated',
  'term.archived',
  'settings.updated',
  'notification.created',
  'notification.updated',
  'notification.sent',
  'notification.deleted',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Readonly<Record<AuditAction, string>> = {
  'program.created': 'Program oluşturuldu',
  'program.updated': 'Program güncellendi',
  'program.deleted': 'Program silindi',
  'program.published': 'Program yayınlandı',
  'program.archived': 'Program arşivlendi',
  'program.restored': 'Program arşivden çıkarıldı',
  'course.created': 'Ders oluşturuldu',
  'course.updated': 'Ders güncellendi',
  'course.deleted': 'Ders silindi',
  'course.published': 'Ders yayınlandı',
  'course.archived': 'Ders arşivlendi',
  'course.restored': 'Ders arşivden çıkarıldı',
  'outcome.created': 'Kazanım oluşturuldu',
  'outcome.deleted': 'Kazanım silindi',
  'outcome.published': 'Kazanım yayınlandı',
  'outcome.archived': 'Kazanım arşivlendi',
  'outcome.restored': 'Kazanım arşivden çıkarıldı',
  'outcome.prerequisites.updated': 'Önkoşullar güncellendi',
  'outcome.updated': 'Kazanım güncellendi',
  'outcome.graph.updated': 'Kazanım haritası güncellendi',
  'content.created': 'İçerik oluşturuldu',
  'content.updated': 'İçerik güncellendi',
  'content.deleted': 'İçerik silindi',
  'content.published': 'İçerik yayınlandı',
  'content.archived': 'İçerik arşivlendi',
  'content.restored': 'İçerik arşivden çıkarıldı',
  'question.created': 'Soru oluşturuldu',
  'question.updated': 'Soru güncellendi',
  'question.deleted': 'Soru silindi',
  'question.restored': 'Soru geri alındı',
  'question.archived': 'Soru arşivlendi',
  'question.duplicated': 'Soru kopyalandı',
  'question.published': 'Soru yayınlandı',
  'question.versioned': 'Soru yeni versiyona alındı',
  'blueprint.created': 'Blueprint oluşturuldu',
  'blueprint.updated': 'Blueprint güncellendi',
  'blueprint.deleted': 'Blueprint silindi',
  'blueprint.published': 'Blueprint yayınlandı',
  'blueprint.archived': 'Blueprint arşivlendi',
  'blueprint.restored': 'Blueprint arşivden çıkarıldı',
  'exam.created': 'Sınav oluşturuldu',
  'exam.updated': 'Sınav güncellendi',
  'exam.deleted': 'Sınav silindi',
  'exam.duplicated': 'Sınav kopyalandı',
  'exam.review_requested': 'Sınav incelemeye gönderildi',
  'exam.published': 'Sınav yayınlandı',
  'exam.archived': 'Sınav arşivlendi',
  'exam.restored': 'Sınav taslağa alındı',
  'exam.closed': 'Sınav kapatıldı',
  'session.started': 'Sınav oturumu başlatıldı',
  'session.terminated': 'Sınav oturumu sonlandırıldı',
  'session.submitted': 'Sınav gönderildi',
  'attempt.graded': 'Değerlendirme yapıldı',
  'attempt.score.overridden': 'Puan geçersiz kılındı',
  'attempt.released': 'Sonuç açıklandı',
  'permission.denied': 'Yetkisiz erişim denemesi',
  'auth.login': 'Giriş yapıldı',
  'auth.login_failed': 'Giriş denemesi başarısız',
  'auth.logout': 'Çıkış yapıldı',
  'user.created': 'Kullanıcı oluşturuldu',
  'user.updated': 'Kullanıcı güncellendi',
  'user.disabled': 'Kullanıcı askıya alındı',
  'user.enabled': 'Kullanıcı yeniden etkinleştirildi',
  'user.archived': 'Kullanıcı arşivlendi',
  'user.restored': 'Kullanıcı arşivden çıkarıldı',
  'user.deleted': 'Kullanıcı silindi',
  'user.password_reset': 'Parola sıfırlandı',
  'user.unlocked': 'Hesap kilidi açıldı',
  'user.roles_changed': 'Kullanıcı rolleri değiştirildi',
  'role.created': 'Rol oluşturuldu',
  'role.updated': 'Rol güncellendi',
  'role.duplicated': 'Rol kopyalandı',
  'role.archived': 'Rol arşivlendi',
  'role.restored': 'Rol arşivden çıkarıldı',
  'term.created': 'Dönem oluşturuldu',
  'term.updated': 'Dönem güncellendi',
  'term.archived': 'Dönem arşivlendi',
  'settings.updated': 'Sistem ayarları güncellendi',
  'notification.created': 'Bildirim taslağı oluşturuldu',
  'notification.updated': 'Bildirim güncellendi',
  'notification.sent': 'Bildirim gönderildi',
  'notification.deleted': 'Bildirim silindi',
};

/**
 * Eylemin ait olduğu modül.
 *
 * Eylem adının ÖNEKİNDEN türetilir; ikinci bir eşleme tablosu tutulmaz. Yeni
 * bir eylem eklendiğinde modülü kendiliğinden doğru çıkar (Open/Closed).
 */
export const AUDIT_MODULE_LABELS: Readonly<Record<string, string>> = {
  program: 'Programlar',
  course: 'Dersler',
  outcome: 'Kazanımlar',
  content: 'İçerikler',
  question: 'Soru bankası',
  blueprint: 'Blueprint',
  exam: 'Sınavlar',
  session: 'Sınav oturumu',
  attempt: 'Değerlendirme',
  permission: 'Yetkilendirme',
  auth: 'Kimlik doğrulama',
  user: 'Kullanıcılar',
  role: 'Roller',
  term: 'Akademik dönem',
  settings: 'Sistem ayarları',
  notification: 'Bildirimler',
};

export function auditModuleOf(action: string): string {
  const prefix = action.split('.')[0] ?? '';
  return AUDIT_MODULE_LABELS[prefix] ?? 'Diğer';
}

/** Denetim ekranındaki modül filtresinin seçenekleri. */
export const AUDIT_MODULES: readonly string[] = Object.keys(AUDIT_MODULE_LABELS);

/** Değişen alanın eski ve yeni değeri — audit ekranında okunabilir diff için. */
export interface AuditChange {
  readonly field: string;
  readonly label: string;
  readonly oldValue: string | null;
  readonly newValue: string | null;
}

export interface AuditEvent {
  readonly id: string;
  readonly action: AuditAction;
  readonly actorId: string;
  readonly actorName: string;
  readonly actorRole: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly targetLabel: string;
  readonly reason: string | null;
  readonly changes: readonly AuditChange[];
  readonly correlationId: string | null;
  /**
   * İstemci adresi.
   *
   * Tarayıcıda çalışan bir mock gerçek IP göremez; değer örnektir ve denetim
   * ekranı bunu açıkça işaretler. Alanın var olması, gerçek bir arka uca
   * geçildiğinde sözleşmenin değişmemesini sağlar.
   */
  readonly ipAddress: string;
  /** İşlem başarılı mı — reddedilen denemeler de kayda girer. */
  readonly success: boolean;
  readonly createdAt: string;
}

/**
 * İstemcinin gönderebileceği alanlar.
 *
 * Kim, ne zaman, hangi adresten — bunların hiçbiri istemciden alınmaz. Alınsaydı
 * denetim kaydı, kaydı yazan tarafın beyanı olurdu; denetimin anlamı da kalmazdı.
 */
export type AuditEventInput = Omit<
  AuditEvent,
  'id' | 'actorId' | 'actorName' | 'actorRole' | 'createdAt' | 'ipAddress' | 'success'
> & { readonly success?: boolean };
