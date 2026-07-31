import { AuditEvent, AuditEventInput } from '../../../observability/audit.model';
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
          ],
          filters: {
            action: inList<AuditEvent>((event) => event.action),
            actorId: equals<AuditEvent>((event) => event.actorId),
            targetType: inList<AuditEvent>((event) => event.targetType),
          },
          defaultSort: { field: 'createdAt', direction: 'desc' },
        }),
      );
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
        createdAt: new Date(context.now).toISOString(),
      };

      context.db.collection('auditEvents').insert(event);
      return created(event);
    },
  },
];
