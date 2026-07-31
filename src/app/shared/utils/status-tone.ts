import { BadgeTone } from '../components/app-status-badge/app-status-badge.component';
import { AppIconName } from '../icons/app-icons';

/**
 * Durum → rozet görünümü eşlemesi (DESIGN_SYSTEM.md §12).
 *
 * TEK doğruluk kaynağı: aynı durum uygulamanın her yerinde aynı renk ve
 * aynı Türkçe etiketle görünür. Ekranlar kendi eşlemesini yazmaz.
 */
export interface StatusPresentation {
  readonly label: string;
  readonly tone: BadgeTone;
  readonly icon: AppIconName | null;
}

const PRESENTATIONS: Readonly<Record<string, StatusPresentation>> = {
  DRAFT: { label: 'Taslak', tone: 'neutral', icon: 'pencil-line' },
  REVIEW: { label: 'İncelemede', tone: 'warning', icon: 'eye' },
  PUBLISHED: { label: 'Yayında', tone: 'success', icon: 'circle-check-big' },
  SCHEDULED: { label: 'Planlandı', tone: 'info', icon: 'calendar' },
  ACTIVE: { label: 'Devam ediyor', tone: 'primary', icon: 'activity' },
  IN_PROGRESS: { label: 'Devam ediyor', tone: 'primary', icon: 'activity' },
  BLUEPRINT_OK: { label: 'Blueprint uygun', tone: 'info', icon: 'check' },
  CLOSED: { label: 'Kapandı', tone: 'neutral', icon: 'lock' },
  SUBMITTED: { label: 'Gönderildi', tone: 'neutral', icon: 'check' },
  AUTO_GRADED: { label: 'Otomatik puanlandı', tone: 'info', icon: 'check' },
  PENDING_MANUAL: { label: 'Değerlendirme bekliyor', tone: 'warning', icon: 'clipboard-list' },
  GRADED: { label: 'Puanlandı', tone: 'success', icon: 'circle-check-big' },
  RELEASED: { label: 'Sonuç açıklandı', tone: 'success', icon: 'circle-check-big' },
  UNDER_REVIEW: { label: 'İtiraz incelemesi', tone: 'warning', icon: 'eye' },
  EXPIRED: { label: 'Süresi doldu', tone: 'danger', icon: 'clock' },
  TERMINATED: { label: 'Sonlandırıldı', tone: 'danger', icon: 'octagon-x' },
  PAUSED: { label: 'Bağlantı bekleniyor', tone: 'warning', icon: 'wifi-off' },
  NOT_STARTED: { label: 'Başlamadı', tone: 'neutral', icon: null },
  ARCHIVED: { label: 'Arşiv', tone: 'neutral', icon: 'archive' },
  LOCAL: { label: 'Kaydedilmedi', tone: 'neutral', icon: null },
  SYNCING: { label: 'Kaydediliyor', tone: 'info', icon: 'loader-circle' },
  SYNCED: { label: 'Kaydedildi', tone: 'success', icon: 'check' },
  CONFLICT: { label: 'Çakışma', tone: 'danger', icon: 'triangle-alert' },
  FAILED: { label: 'Kaydedilemedi', tone: 'danger', icon: 'circle-alert' },
  not_started: { label: 'Başlanmadı', tone: 'neutral', icon: null },
  locked: { label: 'Kilitli', tone: 'warning', icon: 'lock' },
  recommended: { label: 'Önerilen', tone: 'info', icon: 'sparkles' },
  in_progress: { label: 'Devam ediyor', tone: 'primary', icon: 'activity' },
  completed: { label: 'Tamamlandı', tone: 'success', icon: 'circle-check-big' },
};

const UNKNOWN: StatusPresentation = { label: 'Bilinmiyor', tone: 'neutral', icon: null };

export function statusPresentation(status: string): StatusPresentation {
  return PRESENTATIONS[status] ?? UNKNOWN;
}
