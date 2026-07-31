import { AppIconName } from '../../../shared/icons/app-icons';

/**
 * Kullanıcı bildirimleri.
 *
 * Toast (anlık geri bildirim) ile karıştırılmamalıdır: bildirimler kalıcıdır,
 * okundu bilgisi taşır ve kullanıcı sonradan da görebilir.
 */

export const NOTIFICATION_KINDS = [
  'exam_scheduled',
  'exam_reminder',
  'grading_pending',
  'result_released',
  'recommendation_ready',
  'item_flagged',
  'outcome_published',
  'session_terminated',
  'system',
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface NotificationPresentation {
  readonly icon: AppIconName;
  readonly tone: NotificationTone;
  readonly label: string;
}

/** Bildirim türü → görünüm eşlemesi. Tek doğruluk kaynağı. */
export const NOTIFICATION_PRESENTATION: Readonly<
  Record<NotificationKind, NotificationPresentation>
> = {
  exam_scheduled: { icon: 'calendar', tone: 'info', label: 'Sınav planlandı' },
  exam_reminder: { icon: 'clock', tone: 'warning', label: 'Sınav hatırlatması' },
  grading_pending: { icon: 'clipboard-list', tone: 'warning', label: 'Değerlendirme bekliyor' },
  result_released: { icon: 'circle-check-big', tone: 'success', label: 'Sonuç açıklandı' },
  recommendation_ready: { icon: 'sparkles', tone: 'info', label: 'Yeni öneri' },
  item_flagged: { icon: 'flag', tone: 'danger', label: 'Madde incelemesi' },
  outcome_published: { icon: 'target', tone: 'success', label: 'Kazanım yayınlandı' },
  session_terminated: { icon: 'octagon-x', tone: 'danger', label: 'Oturum sonlandırıldı' },
  system: { icon: 'info', tone: 'neutral', label: 'Sistem' },
};

export interface Notification {
  readonly id: string;
  readonly userId: string;
  readonly kind: NotificationKind;
  readonly title: string;
  readonly message: string;
  /** Tıklanınca gidilecek uygulama içi rota (varsa). */
  readonly link: string | null;
  readonly read: boolean;
  readonly createdAt: string;
}

export interface NotificationFeed {
  readonly items: readonly Notification[];
  readonly unreadCount: number;
}
