import { ROLE_LABELS, Role } from '../../../../auth/permission.model';
import {
  NOTIFICATION_AUDIENCE_LABELS,
  NotificationAudience,
  NotificationTarget,
  resolveRecipients,
  validateCampaign,
} from '../../../../../features/adaptive-learning/domain/notification-targeting';
import {
  CAMPAIGN_KINDS,
  CampaignDraft,
  CampaignKind,
  NotificationCampaign,
} from '../../../../../features/administration/models/admin.model';
import { equals, inList } from '../../db/query-engine';
import { requirePermission } from '../../mock-auth';
import { businessRule, conflict, notFound, validation } from '../../mock-errors';
import { MockContext, MockHandler, created, noContent, ok } from '../../mock-router';
import { writeAudit } from '../audit-writer';
import { readSettings } from '../auth.handlers';

/**
 * Bildirim merkezi (Sprint 9 §7, §8).
 *
 * Kampanya bir ŞABLONDUR; gönderim anında hedef çözülür ve her alıcı için bir
 * `Notification` kaydı üretilir. Alıcı listesi kampanyada saklanmaz: taslak
 * beklerken gruba katılan öğrenci bildirimi alamaz, gruptan çıkan ise almaya
 * devam ederdi (ADR-069).
 */
export const CAMPAIGN_HANDLERS: readonly MockHandler[] = [
  {
    method: 'GET',
    path: '/api/admin/notification-campaigns',
    handle: (context) => {
      requirePermission(context, 'admin:manage');

      return ok(
        context.db.collection('notificationCampaigns').query(context.page, {
          searchable: (campaign: NotificationCampaign) => [
            campaign.title,
            campaign.body,
            campaign.audienceLabel,
            campaign.createdByName,
          ],
          filters: {
            state: inList<NotificationCampaign>((campaign) => campaign.state),
            kind: inList<NotificationCampaign>((campaign) => campaign.kind),
            audience: equals<NotificationCampaign>((campaign) => campaign.audience),
          },
          defaultSort: { field: 'createdAt', direction: 'desc' },
        }),
      );
    },
  },

  {
    /* Önizleme yolu `:id`den ÖNCE gelmelidir. */
    method: 'POST',
    path: '/api/admin/notification-campaigns/preview',
    handle: (context) => {
      requirePermission(context, 'admin:manage');

      const target = readTarget(context.body as Partial<CampaignDraft>);
      const recipients = resolveRecipients(target, context.db.collection('users').all());

      return ok({
        recipientCount: recipients.length,
        label: audienceLabel(context, target),
      });
    },
  },

  {
    method: 'POST',
    path: '/api/admin/notification-campaigns',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const draft = readDraft(context);
      const nowIso = new Date(context.now).toISOString();
      const author = context.db.collection('users').findById(caller.userId);

      const campaign: NotificationCampaign = {
        id: `ntc_${context.now.toString(36)}`,
        title: draft.title,
        body: draft.body,
        kind: draft.kind,
        audience: draft.audience,
        audienceValue: draft.audienceValue,
        audienceLabel: audienceLabel(context, {
          audience: draft.audience,
          value: draft.audienceValue,
        }),
        /* Zamanlanmış kampanyalar da elle gönderilir; gerçek bir zamanlayıcı yoktur. */
        state: draft.scheduledFor ? 'SCHEDULED' : 'DRAFT',
        recipientCount: null,
        scheduledFor: draft.scheduledFor,
        sentAt: null,
        createdBy: caller.userId,
        createdByName: author?.fullName ?? 'Bilinmiyor',
        createdAt: nowIso,
        updatedAt: nowIso,
        version: 1,
        deliveryNote: 'Henüz gönderilmedi.',
      };

      context.db.collection('notificationCampaigns').insert(campaign);
      writeAudit(context, caller, 'notification.created', target(campaign), null);

      return created(campaign);
    },
  },

  {
    method: 'PUT',
    path: '/api/admin/notification-campaigns/:id',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const existing = find(context);
      const draft = readDraft(context);

      assertVersion(context, existing);

      /*
       * Gönderilmiş kampanya değiştirilemez.
       *
       * Değiştirilebilseydi, kullanıcıların gördüğü bildirim ile geçmişteki
       * kayıt birbirinden farklı olurdu — gönderim geçmişi yalancı olurdu.
       */
      if (existing.state === 'SENT') {
        throw businessRule('Gönderilmiş bildirim düzenlenemez. Yeni bir bildirim oluşturun.');
      }

      const updated = context.db.collection('notificationCampaigns').update(existing.id, {
        title: draft.title,
        body: draft.body,
        kind: draft.kind,
        audience: draft.audience,
        audienceValue: draft.audienceValue,
        audienceLabel: audienceLabel(context, {
          audience: draft.audience,
          value: draft.audienceValue,
        }),
        state: draft.scheduledFor ? 'SCHEDULED' : 'DRAFT',
        scheduledFor: draft.scheduledFor,
        updatedAt: new Date(context.now).toISOString(),
        version: existing.version + 1,
      })!;

      writeAudit(context, caller, 'notification.updated', target(updated), null);

      return ok(updated);
    },
  },

  {
    method: 'POST',
    path: '/api/admin/notification-campaigns/:id/send',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const campaign = find(context);

      if (campaign.state === 'SENT') {
        throw businessRule('Bu bildirim zaten gönderilmiş.');
      }

      const settings = readSettings(context.db);

      const recipients = resolveRecipients(
        { audience: campaign.audience, value: campaign.audienceValue },
        context.db.collection('users').all(),
      );

      const violations = validateCampaign({
        title: campaign.title,
        body: campaign.body,
        target: { audience: campaign.audience, value: campaign.audienceValue },
        recipientCount: recipients.length,
      });

      if (violations.length > 0) {
        throw validation(
          'Bildirim gönderilemedi.',
          violations.map((violation) => ({ field: violation.field, message: violation.message })),
        );
      }

      const nowIso = new Date(context.now).toISOString();
      const notifications = context.db.collection('notifications');

      for (const userId of recipients) {
        notifications.insert({
          id: `ntf_${context.now}_${userId}`,
          userId,
          kind: 'system',
          title: campaign.title,
          message: campaign.body,
          link: null,
          read: false,
          createdAt: nowIso,
        });
      }

      const sent = context.db.collection('notificationCampaigns').update(campaign.id, {
        state: 'SENT',
        sentAt: nowIso,
        recipientCount: recipients.length,
        updatedAt: nowIso,
        version: campaign.version + 1,
        deliveryNote: settings.emailEnabled
          ? 'Uygulama içi bildirim oluşturuldu. E-posta gönderimi bu projede simüle edilir, gerçek posta çıkmaz.'
          : 'Uygulama içi bildirim oluşturuldu. E-posta gönderimi ayarlardan kapalı.',
      })!;

      writeAudit(context, caller, 'notification.sent', target(sent), null, [
        {
          field: 'recipientCount',
          label: 'Alıcı sayısı',
          oldValue: null,
          newValue: String(recipients.length),
        },
      ]);

      return ok(sent);
    },
  },

  {
    method: 'DELETE',
    path: '/api/admin/notification-campaigns/:id',
    handle: (context) => {
      const caller = requirePermission(context, 'admin:manage');
      const campaign = find(context);

      if (campaign.state === 'SENT') {
        throw businessRule(
          'Gönderilmiş bildirim silinemez. Gönderim geçmişi denetim için korunur.',
        );
      }

      context.db.collection('notificationCampaigns').remove(campaign.id);
      writeAudit(context, caller, 'notification.deleted', target(campaign), null);

      return noContent();
    },
  },
];

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

function find(context: MockContext): NotificationCampaign {
  const campaign = context.db
    .collection('notificationCampaigns')
    .findById(context.params['id'] ?? '');

  if (!campaign) throw notFound('Bildirim');

  return campaign;
}

function target(campaign: NotificationCampaign) {
  return { type: 'NotificationCampaign', id: campaign.id, label: campaign.title };
}

function assertVersion(context: MockContext, campaign: NotificationCampaign): void {
  const expected = (context.body as { expectedVersion?: number } | null)?.expectedVersion;

  if (typeof expected === 'number' && expected !== campaign.version) {
    throw conflict('Bu bildirim siz düzenlerken başkası tarafından değiştirildi.');
  }
}

function readTarget(body: Partial<CampaignDraft>): NotificationTarget {
  return {
    audience: (body.audience ?? 'all') as NotificationAudience,
    value: body.audienceValue ?? null,
  };
}

function readDraft(context: MockContext): CampaignDraft {
  const body = (context.body ?? {}) as Partial<CampaignDraft>;
  const target = readTarget(body);

  const recipients = resolveRecipients(target, context.db.collection('users').all());

  const draft: CampaignDraft = {
    title: (body.title ?? '').trim(),
    body: (body.body ?? '').trim(),
    kind: (CAMPAIGN_KINDS.includes(body.kind as CampaignKind)
      ? body.kind
      : 'announcement') as CampaignKind,
    audience: target.audience,
    audienceValue: target.value,
    scheduledFor: body.scheduledFor ?? null,
  };

  /*
   * Taslak kaydedilirken "alıcısı yok" hatası VERİLMEZ.
   *
   * Yönetici metni yazarken hedefi henüz seçmemiş olabilir; taslağı
   * kaydetmesini engellemek yazdıklarını kaybettirirdi. Alıcı kontrolü
   * gönderim anında yapılır.
   */
  const violations = validateCampaign({
    title: draft.title,
    body: draft.body,
    target,
    recipientCount: recipients.length === 0 ? 1 : recipients.length,
  });

  if (violations.length > 0) {
    throw validation(
      'Bildirim bilgileri geçersiz.',
      violations.map((violation) => ({ field: violation.field, message: violation.message })),
    );
  }

  return draft;
}

/** Hedefin okunabilir adı — kimlik yerine insanın tanıdığı ad gösterilir. */
function audienceLabel(context: MockContext, target: NotificationTarget): string {
  const value = target.value ?? '';

  switch (target.audience) {
    case 'all':
      return NOTIFICATION_AUDIENCE_LABELS.all;
    case 'role':
      return ROLE_LABELS[value as Role] ?? value;
    case 'program':
      return context.db.collection('programs').findById(value)?.name ?? value;
    case 'course': {
      const course = context.db.collection('courses').findById(value);
      return course ? `${course.code} · ${course.name}` : value;
    }
    case 'cohort':
      return context.db.collection('cohorts').findById(value)?.name ?? value;
    case 'user':
      return context.db.collection('users').findById(value)?.fullName ?? value;
    default:
      return value;
  }
}
