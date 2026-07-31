import { Exam, ExamRuntimeStatus } from '../models/exam.model';

/**
 * Sınavın ÇALIŞMA durumu — saklanmaz, tarihlerden türetilir.
 *
 * Neden türetiliyor: "sınav başladı" bilgisini kayda yazmak, o kaydı güncelleyecek
 * bir zamanlayıcı gerektirir. Zamanlayıcı gecikirse veya çalışmazsa veri yalan söyler.
 * Tarih karşılaştırması ise her istekte kendiliğinden doğrudur (ADR-042).
 *
 * Yazım durumu (`state`) ile karıştırılmamalıdır: yayında OLMAYAN bir sınav
 * takvimde ne kadar uygun olursa olsun `not_ready` sayılır.
 */
export function examRuntimeStatus(
  exam: Pick<Exam, 'state' | 'opensAt' | 'closesAt'>,
  nowMs: number,
): ExamRuntimeStatus {
  if (exam.state !== 'PUBLISHED') return 'not_ready';

  const opens = Date.parse(exam.opensAt);
  const closes = Date.parse(exam.closesAt);

  if (Number.isNaN(opens) || Number.isNaN(closes)) return 'not_ready';
  if (nowMs < opens) return 'scheduled';
  if (nowMs > closes) return 'closed';
  return 'active';
}

/** Öğrenciye görünür mü? Planlanmış, devam eden ve kapanmış sınavlar listelenir. */
export function isVisibleToStudent(status: ExamRuntimeStatus): boolean {
  return status !== 'not_ready';
}

/** Sınav şu anda çözülebilir mi (oturum açılabilir mi)? */
export function isOpenForAttempt(status: ExamRuntimeStatus): boolean {
  return status === 'active';
}

/** Sınavın başlamasına kalan tam gün sayısı; başlamışsa `0`. */
export function daysUntilOpen(exam: Pick<Exam, 'opensAt'>, nowMs: number): number {
  const opens = Date.parse(exam.opensAt);
  if (Number.isNaN(opens)) return 0;
  return Math.max(0, Math.ceil((opens - nowMs) / 86_400_000));
}
