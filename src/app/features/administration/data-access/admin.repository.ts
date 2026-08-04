import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { API } from '../../../core/api/api-endpoints';
import { PageRequest, PageResponse } from '../../../core/api/page-request';
import { AuditEvent } from '../../../core/observability/audit.model';
import { Term } from '../../adaptive-learning/models/common.model';
import { User } from '../../adaptive-learning/models/user.model';
import { NotificationTarget } from '../../adaptive-learning/domain/notification-targeting';
import {
  AdminOverview,
  AudiencePreview,
  CampaignDraft,
  GlobalSearchResult,
  NotificationCampaign,
  RoleDraft,
  RoleRow,
  SystemHealth,
  SystemSettings,
  UserDetail,
  UserDraft,
} from '../models/admin.model';

/** Sürüm çakışması kontrolü için her yazma isteğine eklenen alan (BR-09). */
interface Versioned {
  readonly expectedVersion?: number;
}

/** Gerekçe isteyen yaşam döngüsü işlemleri için gövde. */
interface LifecycleBody {
  readonly reason?: string;
}

/**
 * Yönetim uçlarının tek erişim noktası.
 *
 * Ekranlar `ApiClient`'ı doğrudan çağırmaz: uç adresi, sayfa parametreleri ve
 * gövde şekli burada tanımlıdır. Aksi hâlde her ekran kendi yolunu yazar ve
 * sunucu sözleşmesi değişince hepsini tek tek bulmak gerekirdi.
 */
@Injectable({ providedIn: 'root' })
export class AdminRepository {
  private readonly api = inject(ApiClient);

  /* ── Pano ve sağlık ────────────────────────────────────────────────────── */

  overview(): Observable<AdminOverview> {
    return this.api.get<AdminOverview>(API.admin.overview);
  }

  health(): Observable<SystemHealth> {
    return this.api.get<SystemHealth>(API.admin.health);
  }

  search(term: string): Observable<GlobalSearchResult> {
    return this.api.get<GlobalSearchResult>(API.admin.search, { q: term });
  }

  /* ── Kullanıcılar ──────────────────────────────────────────────────────── */

  users(page: PageRequest): Observable<PageResponse<User>> {
    return this.api.getPage<User>(API.users.list, page);
  }

  user(id: string): Observable<User> {
    return this.api.get<User>(API.users.byId(id));
  }

  userDetail(id: string): Observable<UserDetail> {
    return this.api.get<UserDetail>(API.users.detail(id));
  }

  createUser(draft: UserDraft): Observable<User> {
    return this.api.post<User>(API.users.list, draft);
  }

  updateUser(id: string, draft: UserDraft & Versioned): Observable<User> {
    return this.api.put<User>(API.users.byId(id), draft);
  }

  /**
   * Yaşam döngüsü işlemleri tek bir çağrıda toplanır.
   *
   * Beşi de aynı şekle sahip; ayrı metotlar yazmak beş kopya demekti. Eylem adı
   * yol parçası olarak geçer ve sunucudaki eş adlı handler'a düşer.
   */
  lifecycle(
    id: string,
    action: 'disable' | 'enable' | 'archive' | 'restore' | 'unlock',
    body: LifecycleBody = {},
  ): Observable<User> {
    return this.api.post<User>(API.users.lifecycle(id, action), body);
  }

  resetPassword(
    id: string,
    body: LifecycleBody = {},
  ): Observable<{ temporaryPassword: string; note: string }> {
    return this.api.post<{ temporaryPassword: string; note: string }>(
      API.users.lifecycle(id, 'reset-password'),
      body,
    );
  }

  /* ── Roller ────────────────────────────────────────────────────────────── */

  roles(): Observable<readonly RoleRow[]> {
    return this.api.get<readonly RoleRow[]>(API.admin.roles);
  }

  createRole(draft: RoleDraft): Observable<RoleRow> {
    return this.api.post<RoleRow>(API.admin.roles, draft);
  }

  updateRole(id: string, draft: RoleDraft & Versioned): Observable<RoleRow> {
    return this.api.put<RoleRow>(API.admin.role(id), draft);
  }

  duplicateRole(id: string): Observable<RoleRow> {
    return this.api.post<RoleRow>(API.admin.roleDuplicate(id), {});
  }

  /** Aynı uç hem arşivler hem geri alır; sunucu mevcut duruma bakarak karar verir. */
  toggleRoleArchive(id: string): Observable<RoleRow> {
    return this.api.post<RoleRow>(API.admin.roleArchive(id), {});
  }

  /* ── Akademik dönemler ─────────────────────────────────────────────────── */

  terms(): Observable<readonly Term[]> {
    return this.api.get<readonly Term[]>(API.admin.terms);
  }

  createTerm(draft: Partial<Term>): Observable<Term> {
    return this.api.post<Term>(API.admin.terms, draft);
  }

  updateTerm(id: string, draft: Partial<Term> & Versioned): Observable<Term> {
    return this.api.put<Term>(API.admin.term(id), draft);
  }

  toggleTermArchive(id: string): Observable<Term> {
    return this.api.post<Term>(API.admin.termArchive(id), {});
  }

  /* ── Sistem ayarları ───────────────────────────────────────────────────── */

  settings(): Observable<SystemSettings> {
    return this.api.get<SystemSettings>(API.admin.settings);
  }

  saveSettings(settings: Partial<SystemSettings> & Versioned): Observable<SystemSettings> {
    return this.api.put<SystemSettings>(API.admin.settings, settings);
  }

  /* ── Bildirim kampanyaları ─────────────────────────────────────────────── */

  campaigns(page: PageRequest): Observable<PageResponse<NotificationCampaign>> {
    return this.api.getPage<NotificationCampaign>(API.admin.campaigns, page);
  }

  createCampaign(draft: CampaignDraft): Observable<NotificationCampaign> {
    return this.api.post<NotificationCampaign>(API.admin.campaigns, draft);
  }

  updateCampaign(
    id: string,
    draft: CampaignDraft & Versioned,
  ): Observable<NotificationCampaign> {
    return this.api.put<NotificationCampaign>(API.admin.campaign(id), draft);
  }

  sendCampaign(id: string): Observable<NotificationCampaign> {
    return this.api.post<NotificationCampaign>(API.admin.campaignSend(id), {});
  }

  deleteCampaign(id: string): Observable<void> {
    return this.api.delete<void>(API.admin.campaign(id));
  }

  /** Hedef seçilince "kaç kişiye gidecek?" önizlemesi. */
  previewAudience(target: NotificationTarget): Observable<AudiencePreview> {
    return this.api.post<AudiencePreview>(API.admin.audiencePreview, {
      audience: target.audience,
      audienceValue: target.value,
    });
  }

  /* ── Denetim kaydı ─────────────────────────────────────────────────────── */

  auditEvents(page: PageRequest): Observable<PageResponse<AuditEvent>> {
    return this.api.getPage<AuditEvent>(API.audit.list, page);
  }

  auditTimeline(
    limit = 50,
    module?: string,
  ): Observable<{ days: readonly { date: string; events: readonly AuditEvent[] }[]; total: number }> {
    return this.api.get<{
      days: readonly { date: string; events: readonly AuditEvent[] }[];
      total: number;
    }>(API.audit.timeline, module ? { limit: String(limit), module } : { limit: String(limit) });
  }
}
