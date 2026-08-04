import { Permission } from '../../../../auth/permission.model';
import { AuditAction, AuditChange, AuditEvent } from '../../../../observability/audit.model';
import { PublishState } from '../../../../../features/adaptive-learning/models/common.model';
import {
  canTransition,
  isDeletable,
  isEditable,
  label as stateLabel,
  transitionError,
} from '../../../../../features/adaptive-learning/domain/publish-workflow';
import { Collection, Identified } from '../../db/collection';
import { CollectionName } from '../../db/db-schema';
import { QueryConfig } from '../../db/query-engine';
import { mockIpAddress } from '../audit-writer';
import { requirePermission } from '../../mock-auth';
import { businessRule, conflict, forbidden, notFound, validation } from '../../mock-errors';
import { MockCaller, MockContext, MockHandler, created, noContent, ok } from '../../mock-router';

/**
 * Durum alanı taşıyan her varlık için ortak CRUD + yayın iş akışı handler'ları.
 *
 * Program, ders ve kazanım uç noktaları AYNI şekle sahiptir; üç kez yazmak yerine
 * tek bir fabrika kullanılır (DRY). Varlığa özgü olan her şey `CrudConfig` ile
 * dışarıdan verilir — fabrika içinde `if (entity === 'course')` gibi dallanma YOKTUR
 * (Open/Closed).
 */

/** Durum alanı ve kimlik taşıyan varlıklar. */
export interface StatefulEntity {
  readonly id: string;
  readonly state: PublishState;
  readonly version: number;
  readonly updatedAt: string;
  readonly updatedBy: string;
  readonly publishedAt: string | null;
  readonly archivedAt: string | null;
}

export interface CrudConfig<T extends StatefulEntity> {
  /** Fake DB koleksiyon adı. */
  readonly collection: CollectionName;
  /** `/api/programs` gibi taban yol. */
  readonly basePath: string;
  /** Hata mesajlarında kullanılan tekil ad ("Program", "Ders", "Kazanım"). */
  readonly entityLabel: string;
  /** Denetim kaydındaki hedef tipi. */
  readonly auditType: string;
  readonly permissions: {
    readonly read: Permission;
    readonly write: Permission;
    readonly publish: Permission;
  };
  /** Liste sorgusu yapılandırması (arama alanları, filtreler, sıralama). */
  readonly query: (context: MockContext) => QueryConfig<T>;
  /** Veri kapsamı — kullanıcının göremeyeceği kayıtlar listeye hiç girmez. */
  readonly scope: (caller: MockCaller, item: T) => boolean;
  /** Denetim kaydında görünen okunabilir etiket. */
  readonly labelOf: (item: T) => string;
  /** Gövdeyi doğrular ve yeni kaydı üretir. Doğrulama hatasında fırlatır. */
  readonly create: (context: MockContext, caller: MockCaller) => T;
  /** Gövdeyi doğrular ve güncellenmiş kaydı üretir. */
  readonly update: (existing: T, context: MockContext, caller: MockCaller) => T;
  /** Güncellemede hangi alanların değiştiğini denetim kaydına yazar. */
  readonly changesOf?: (before: T, after: T) => readonly AuditChange[];
  /** Silmeden önce bütünlük kontrolü (bağlı kayıt varsa engelle). */
  readonly assertDeletable?: (item: T, context: MockContext) => void;
  /** Yayına almadan önceki iş kuralı kontrolü (ör. kazanımı olmayan ders yayınlanamaz). */
  readonly assertPublishable?: (item: T, context: MockContext) => void;
  /** İşlem türüne göre denetim eylemi — her varlık kendi eylem adlarını verir. */
  readonly auditActions: {
    readonly created: AuditAction;
    readonly updated: AuditAction;
    readonly deleted: AuditAction;
    readonly transition: (target: PublishState) => AuditAction;
  };
  /** Kayıt değişince güncellenmesi gereken türetilmiş veriler (sayaçlar vb.). */
  readonly afterChange?: (context: MockContext) => void;
}

export function createCrudHandlers<T extends StatefulEntity>(
  config: CrudConfig<T>,
): readonly MockHandler[] {
  /*
   * `FakeDb.collection()` koleksiyon adına göre birleşim tipi döner; fabrika ise
   * tek bir `T` ile çalışır. Dönüşüm TEK bir yerde yapılır, handler gövdelerine sızmaz.
   */
  const collectionOf = (context: MockContext): Collection<T & Identified> =>
    context.db.collection(config.collection) as unknown as Collection<T & Identified>;

  const find = (context: MockContext, id: string): T => {
    const item = collectionOf(context).findById(id);
    if (!item) throw notFound(config.entityLabel);
    return item;
  };

  const assertScope = (caller: MockCaller, item: T): void => {
    if (!config.scope(caller, item)) {
      throw forbidden(`Bu ${config.entityLabel.toLocaleLowerCase('tr-TR')} kapsamınız dışında.`);
    }
  };

  return [
    /* ── Liste ─────────────────────────────────────────────────────────── */
    {
      method: 'GET',
      path: config.basePath,
      handle: (context) => {
        const caller = requirePermission(context, config.permissions.read);

        return ok(
          collectionOf(context).queryWithin(
            (item) => config.scope(caller, item),
            context.page,
            config.query(context) as QueryConfig<T & Identified>,
          ),
        );
      },
    },

    /* ── Detay ─────────────────────────────────────────────────────────── */
    {
      method: 'GET',
      path: `${config.basePath}/:id`,
      handle: (context) => {
        const caller = requirePermission(context, config.permissions.read);
        const item = find(context, context.params['id'] ?? '');
        assertScope(caller, item);
        return ok(item);
      },
    },

    /* ── Oluştur ───────────────────────────────────────────────────────── */
    {
      method: 'POST',
      path: config.basePath,
      handle: (context) => {
        const caller = requirePermission(context, config.permissions.write);
        const item = config.create(context, caller);

        collectionOf(context).insert(item);
        config.afterChange?.(context);
        writeAudit(context, caller, config, config.auditActions.created, item, []);

        return created(item);
      },
    },

    /* ── Güncelle ──────────────────────────────────────────────────────── */
    {
      method: 'PUT',
      path: `${config.basePath}/:id`,
      handle: (context) => {
        const caller = requirePermission(context, config.permissions.write);
        const existing = find(context, context.params['id'] ?? '');
        assertScope(caller, existing);

        // Yayındaki/arşivlenmiş kayıt doğrudan düzenlenemez (BR-21).
        if (!isEditable(existing.state)) {
          throw businessRule(
            `"${stateLabel(existing.state)}" durumundaki bir ${config.entityLabel.toLocaleLowerCase('tr-TR')} düzenlenemez. Önce taslağa geri alın.`,
            { state: existing.state },
          );
        }

        assertVersion(context, existing);

        const updated = config.update(existing, context, caller);
        collectionOf(context).replace(updated);
        config.afterChange?.(context);

        const changes = config.changesOf?.(existing, updated) ?? [];
        if (changes.length > 0) {
          writeAudit(context, caller, config, config.auditActions.updated, updated, changes);
        }

        return ok(updated);
      },
    },

    /* ── Sil ───────────────────────────────────────────────────────────── */
    {
      method: 'DELETE',
      path: `${config.basePath}/:id`,
      handle: (context) => {
        const caller = requirePermission(context, config.permissions.write);
        const existing = find(context, context.params['id'] ?? '');
        assertScope(caller, existing);

        // Yalnızca hiç yayınlanmamış taslaklar silinebilir; gerisi arşivlenir.
        if (!isDeletable(existing.state)) {
          throw businessRule(
            `Yalnızca taslak durumdaki kayıtlar silinebilir. "${stateLabel(existing.state)}" durumundaki bir ${config.entityLabel.toLocaleLowerCase('tr-TR')} için arşivleme kullanın.`,
            { state: existing.state },
          );
        }

        config.assertDeletable?.(existing, context);

        collectionOf(context).remove(existing.id);
        config.afterChange?.(context);
        writeAudit(context, caller, config, config.auditActions.deleted, existing, []);

        return noContent();
      },
    },

    /* ── Durum geçişi ──────────────────────────────────────────────────── */
    {
      method: 'POST',
      path: `${config.basePath}/:id/transition`,
      handle: (context) => {
        const caller = requirePermission(context, config.permissions.publish);
        const existing = find(context, context.params['id'] ?? '');
        assertScope(caller, existing);

        const body = context.body as { state?: PublishState; reason?: string } | null;
        const target = body?.state;

        if (!target) throw validation('Hedef durum belirtilmedi.');

        // Geçersiz geçiş: kullanıcıya hangi geçişlerin mümkün olduğu söylenir.
        if (!canTransition(existing.state, target)) {
          throw businessRule(transitionError(existing.state, target), {
            from: existing.state,
            to: target,
          });
        }

        if (target === 'PUBLISHED') config.assertPublishable?.(existing, context);

        const now = new Date(context.now).toISOString();
        const updated = {
          ...existing,
          state: target,
          version: existing.version + 1,
          updatedAt: now,
          updatedBy: caller.userId,
          publishedAt: target === 'PUBLISHED' ? now : existing.publishedAt,
          archivedAt: target === 'ARCHIVED' ? now : target === 'DRAFT' ? null : existing.archivedAt,
        } as T & Identified;

        collectionOf(context).replace(updated);
        config.afterChange?.(context);

        writeAudit(
          context,
          caller,
          config,
          config.auditActions.transition(target),
          updated,
          [
            {
              field: 'state',
              label: 'Durum',
              oldValue: stateLabel(existing.state),
              newValue: stateLabel(target),
            },
          ],
          body?.reason?.trim() || null,
        );

        return ok(updated);
      },
    },
  ];
}

/* ── Yardımcılar ─────────────────────────────────────────────────────────── */

/**
 * İyimser kilitleme: istemci elindeki sürümü gönderir, sunucudaki sürümle
 * uyuşmuyorsa 409 döner ve değişiklik sessizce ezilmez (BR-09 ile aynı ilke).
 */
function assertVersion(context: MockContext, existing: StatefulEntity): void {
  const expected = (context.body as { expectedVersion?: number } | null)?.expectedVersion;
  if (expected === undefined || expected === existing.version) return;

  throw conflict(
    'Bu kayıt siz düzenlerken başka bir yerde değiştirildi. Sayfayı yenileyip değişikliklerinizi tekrar uygulayın.',
    { expectedVersion: expected, actualVersion: existing.version },
  );
}

function writeAudit<T extends StatefulEntity>(
  context: MockContext,
  caller: MockCaller,
  config: CrudConfig<T>,
  action: AuditAction,
  item: T,
  changes: readonly AuditChange[],
  reason: string | null = null,
): void {
  const actor = context.db.collection('users').findById(caller.userId);

  const event: AuditEvent = {
    id: `aud_${context.now}_${Math.random().toString(36).slice(2, 8)}`,
    action,
    actorId: caller.userId,
    actorName: actor?.fullName ?? 'Bilinmiyor',
    actorRole: caller.role,
    ipAddress: mockIpAddress(caller.userId),
    success: true,
    targetType: config.auditType,
    targetId: item.id,
    targetLabel: config.labelOf(item),
    reason,
    changes,
    correlationId: context.request.headers.get('X-Correlation-Id'),
    createdAt: new Date(context.now).toISOString(),
  };

  context.db.collection('auditEvents').insert(event);
}

/** İki kayıt arasındaki alan farklarını denetim kaydı biçiminde üretir. */
export function diffFields<T>(
  before: T,
  after: T,
  fields: readonly { readonly key: keyof T & string; readonly label: string }[],
): AuditChange[] {
  return fields
    .filter((field) => String(before[field.key] ?? '') !== String(after[field.key] ?? ''))
    .map((field) => ({
      field: field.key,
      label: field.label,
      oldValue: formatValue(before[field.key]),
      newValue: formatValue(after[field.key]),
    }));
}

function formatValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
