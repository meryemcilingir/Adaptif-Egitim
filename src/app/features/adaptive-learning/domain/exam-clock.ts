import { ExamSession } from '../models/exam-session.model';

/**
 * Sınav saati (BR-07).
 *
 * KRİTİK: kalan süre asla istemci saatinden hesaplanmaz. Sunucu her yanıtta
 * `serverNow` gönderir; istemci bununla kendi saati arasındaki farkı (`offset`)
 * bir kez ölçer ve sayacı hep bu düzeltmeyle yürütür. Öğrencinin bilgisayar
 * saatini geri alması sınav süresini uzatmaz.
 *
 * Saf fonksiyonlardır (Angular/Date.now bağımlılığı yok, "şimdi" hep parametre)
 * → doğrudan test edilir ve mock sunucu da aynı fonksiyonları kullanır.
 */

/** Kullanıcının bilgilendirileceği eşikler — büyükten küçüğe. */
export const TIMER_THRESHOLDS_MS: readonly number[] = [
  10 * 60_000,
  5 * 60_000,
  60_000,
] as const;

export const TIMER_THRESHOLD_LABELS: Readonly<Record<number, string>> = {
  [10 * 60_000]: 'Sınavın bitmesine 10 dakika kaldı.',
  [5 * 60_000]: 'Sınavın bitmesine 5 dakika kaldı.',
  [60_000]: 'Son 1 dakika. Süre dolunca sınav otomatik teslim edilecek.',
};

/** Kalan sürenin görsel aciliyeti — renk ve vurgu bundan seçilir. */
export type TimerUrgency = 'normal' | 'warning' | 'critical';

export interface ClockReading {
  readonly remainingMs: number;
  readonly elapsedMs: number;
  readonly totalMs: number;
  readonly percentRemaining: number;
  readonly urgency: TimerUrgency;
  readonly expired: boolean;
}

/**
 * Sunucu ile istemci saati arasındaki fark.
 *
 * Pozitif değer, sunucunun istemciden ileride olduğunu gösterir. Ölçüm anındaki
 * ağ gecikmesi de bu farka karışır; sınav süreleri dakika ölçeğinde olduğu için
 * yüz milisaniyelik sapma önemsizdir ve düzeltmeye çalışmak yanıltıcı bir
 * kesinlik hissi verirdi.
 */
export function serverOffset(serverNowIso: string, clientNowMs: number): number {
  return Date.parse(serverNowIso) - clientNowMs;
}

/** Offset uygulanmış "sunucu şimdi"si. */
export function serverTime(clientNowMs: number, offsetMs: number): number {
  return clientNowMs + offsetMs;
}

export function readClock(
  startedAtIso: string,
  expiresAtIso: string,
  serverNowMs: number,
): ClockReading {
  const start = Date.parse(startedAtIso);
  const end = Date.parse(expiresAtIso);

  const totalMs = Math.max(0, end - start);
  const remainingMs = Math.max(0, end - serverNowMs);
  const elapsedMs = Math.max(0, Math.min(totalMs, serverNowMs - start));

  return {
    remainingMs,
    elapsedMs,
    totalMs,
    percentRemaining: totalMs === 0 ? 0 : Math.round((remainingMs / totalMs) * 100),
    urgency: urgencyOf(remainingMs),
    expired: remainingMs <= 0,
  };
}

export function readSessionClock(session: ExamSession, serverNowMs: number): ClockReading {
  return readClock(session.startedAt, session.expiresAt, serverNowMs);
}

export function urgencyOf(remainingMs: number): TimerUrgency {
  if (remainingMs <= 60_000) return 'critical';
  if (remainingMs <= 5 * 60_000) return 'warning';
  return 'normal';
}

/**
 * İki ölçüm arasında hangi eşiğin GEÇİLDİĞİNİ döndürür.
 *
 * Sayaç her saniye çalıştığı için "kalan süre 5 dakikanın altında" demek yetmez;
 * uyarı her saniye tekrarlanırdı. Eşik yalnızca `previous` üstündeyken `current`
 * altına düştüğü an bir kez tetiklenir. Sekme arka plandayken tarayıcı zamanlayıcıyı
 * kıstığı için birden çok eşik aynı anda geçilebilir — o durumda EN KÜÇÜĞÜ döner,
 * çünkü kullanıcıya en acil bilgi verilmelidir.
 */
export function crossedThreshold(previousMs: number, currentMs: number): number | null {
  let crossed: number | null = null;

  for (const threshold of TIMER_THRESHOLDS_MS) {
    if (previousMs > threshold && currentMs <= threshold) {
      crossed = crossed === null ? threshold : Math.min(crossed, threshold);
    }
  }

  return crossed;
}

/** `01:23:45` / `12:07` biçiminde sayaç metni. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  return hours > 0 ? `${String(hours).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** "2 saat 15 dakika" gibi okunabilir metin — bekleme odası geri sayımı için. */
export function humanizeDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (days > 0) return `${days} gün ${hours} saat`;
  if (hours > 0) return `${hours} saat ${minutes} dakika`;
  if (minutes > 0) return `${minutes} dakika ${seconds} saniye`;
  return `${seconds} saniye`;
}
