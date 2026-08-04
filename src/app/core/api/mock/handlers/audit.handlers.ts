import { AuditEvent, AuditEventInput } from '../../../observability/audit.model';
import { mockIpAddress } from './audit-writer';
import { equals, inList } from '../db/query-engine';
import { requireCaller, requirePermission } from '../mock-auth';
import { MockHandler, created, ok } from '../mock-router';

export const AUDIT_HANDLERS: readonly MockHandler[] = [
  {
    method: 'GET',
    path: '/api/audit-events',
    handle: (context) => {
      requirePermission(context, 'audit:read');

      return ok(
        context.db.collection('auditEvents').query(context.page, {
          searchable: (event: AuditEvent) => [
            event.targetLabel,
            event.actorName,
            event.reason,
            event.action,
            event.ipAddress,
          ],
          filters: {
            action: inList<AuditEvent>((event) => event.action),
            actorId: equals<AuditEvent>((event) => event.actorId),
            targetType: inList<AuditEvent>((event) => event.targetType),
            /* Modül, eylem önekinden TÜRETİLİR; kayıtta ikinci bir alan tutulmaz. */
            module: inList<AuditEvent>((event) => event.action.split('.')[0] ?? ''),
            result: inList<AuditEvent>((event) => (event.success ? 'success' : 'failure')),
          },
          defaultSort: { field: 'createdAt', direction: 'desc' },
        }),
      );
    },
  },

  {
    /**
     * Zaman çizelgesi görünümü (§11).
     *
     * Aynı veri, sayfalama yerine GÜN BAŞINA gruplanmış olarak döner. Liste
     * görünümünün sayfalanmış çıktısını çizelgeye dönüştürmek, bir günün
     * olaylarının iki sayfaya bölünmesi anlamına gelirdi.
     */
    method: 'GET',
    path: '/api/audit-events/timeline',
    handle: (context) => {
      requirePermission(context, 'audit:read');

      const limit = Math.min(Number(context.query.get('limit') ?? 50), 200);
      const module = context.query.get('module');

      const events = context.db
        .collection('auditEvents')
        .filter((event) => !module || event.action.startsWith(`${module}.`))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit);

      const days = new Map<string, AuditEvent[]>();

      for (const event of events) {
        const day = event.createdAt.slice(0, 10);
        days.set(day, [...(days.get(day) ?? []), event]);
      }

      return ok({
        days: [...days.entries()].map(([date, items]) => ({ date, events: items })),
        total: events.length,
      });
    },
  },

  {
    /**
     * İstemci taraflı denetim kaydı (ör. yetkisiz erişim denemesi).
     * Domain mutasyonlarının kaydını ilgili handler'lar kendisi üretir.
     */
    method: 'POST',
    path: '/api/audit-events',
    handle: (context) => {
      const caller = requireCaller(context);
      const input = context.body as AuditEventInput;
      const account = context.db.collection('users').findById(caller.userId);

      const event: AuditEvent = {
        ...input,
        id: `aud_${context.now}_${Math.random().toString(36).slice(2, 8)}`,
        actorId: caller.userId,
        actorName: account?.fullName ?? 'Bilinmiyor',
        actorRole: caller.role,
        ipAddress: mockIpAddress(caller.userId),
        success: input.success ?? true,
        createdAt: new Date(context.now).toISOString(),
      };

      context.db.collection('auditEvents').insert(event);
      return created(event);
    },
  },
];
