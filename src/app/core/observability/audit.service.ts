import { Injectable, inject } from '@angular/core';
import { EMPTY, catchError } from 'rxjs';

import { API } from '../api/api-endpoints';
import { ApiClient } from '../api/api-client';
import { AuditEvent, AuditEventInput } from './audit.model';

/**
 * Denetim kaydı üretimi.
 *
 * Domain mutasyonlarının audit kaydını mock backend kendisi üretir (tek doğruluk kaynağı).
 * Bu servis, backend'in göremediği istemci taraflı olayları (yetkisiz erişim denemesi,
 * yerel override onayı) kaydetmek için kullanılır.
 *
 * Kayıt başarısız olursa asıl işlem bozulmaz — audit "best effort" çalışır.
 */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly api = inject(ApiClient);

  record(input: AuditEventInput): void {
    this.api
      .post<AuditEvent>(API.audit.list, input, { skipLoading: true, skipRetry: true })
      .pipe(catchError(() => EMPTY))
      .subscribe();
  }

  /** Yetkisiz erişim denemeleri de izlenmelidir. */
  recordPermissionDenied(targetType: string, targetId: string, targetLabel: string): void {
    this.record({
      action: 'permission.denied',
      targetType,
      targetId,
      targetLabel,
      reason: null,
      changes: [],
      correlationId: null,
    });
  }
}
