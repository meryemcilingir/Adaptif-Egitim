import { AuditAction, AuditChange } from '../../../observability/audit.model';
import { MockCaller, MockContext } from '../mock-router';

/**
 * Denetim kaydı yazıcısı (BR-18).
 *
 * Sınav, soru ve değerlendirme uçları aynı kaydı üretiyordu; üç kopya arasında
 * bir alan eklendiğinde diğerlerinin unutulması kaçınılmazdı. Tek fark hedefin
 * türü ve etiketiydi — o da parametreye alındı.
 */
export interface AuditTarget {
  readonly type: string;
  readonly id: string;
  readonly label: string;
}

export function writeAudit(
  context: MockContext,
  caller: MockCaller,
  action: AuditAction,
  target: AuditTarget,
  reason: string | null,
  changes: readonly AuditChange[] = [],
  success = true,
): void {
  const actor = context.db.collection('users').findById(caller.userId);

  context.db.collection('auditEvents').insert({
    id: `aud_${context.now}_${auditSequence()}`,
    action,
    actorId: caller.userId,
    actorName: actor?.fullName ?? 'Bilinmiyor',
    actorRole: caller.role,
    targetType: target.type,
    targetId: target.id,
    targetLabel: target.label,
    reason,
    changes: [...changes],
    correlationId: context.request.headers.get('X-Correlation-Id'),
    ipAddress: mockIpAddress(caller.userId),
    success,
    createdAt: new Date(context.now).toISOString(),
  });
}

/**
 * Kimlik son eki.
 *
 * `Math.random()` kullanılmıyor: aynı milisaniyede yazılan iki kayıt için
 * çakışmayan ama TEKRARLANABİLİR bir sayaç, demo verisinin deterministik
 * kalmasını sağlar.
 */
let counter = 0;

function auditSequence(): string {
  counter = (counter + 1) % 1_000_000;
  return counter.toString(36).padStart(4, '0');
}

/**
 * Örnek istemci adresi.
 *
 * Tarayıcıda çalışan bir mock gerçek IP göremez. Rastgele üretmek yerine
 * kullanıcı kimliğinden TÜRETİLİR: aynı kişi her zaman aynı adresten görünür,
 * böylece denetim ekranındaki "aynı hesap iki farklı adresten" gibi desenler
 * anlamlı kalır ve demo verisi deterministik olur.
 */
export function mockIpAddress(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) % 65_536;

  return `10.0.${Math.floor(hash / 256)}.${(hash % 254) + 1}`;
}
