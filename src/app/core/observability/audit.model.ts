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
  'auth.logout',
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
  'auth.logout': 'Çıkış yapıldı',
};

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
  readonly createdAt: string;
}

export type AuditEventInput = Omit<
  AuditEvent,
  'id' | 'actorId' | 'actorName' | 'actorRole' | 'createdAt'
>;
