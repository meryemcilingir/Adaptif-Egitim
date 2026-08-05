import { Injectable, signal } from '@angular/core';

export type ConfirmTone = 'primary' | 'danger' | 'warning';

export interface ConfirmRequest {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly tone?: ConfirmTone;
  /**
   * Zorunlu gerekçe alanı (BR-12).
   * Puan değişikliği, override ve oturum sonlandırma gibi işlemlerde açılır.
   */
  readonly requireReason?: boolean;
  readonly reasonLabel?: string;
  readonly reasonHint?: string;
  readonly minReasonLength?: number;
  /** Belirtilmezse gerekçe alanı sınırsız kalır (mevcut davranış korunur). */
  readonly maxReasonLength?: number;
}

export interface ConfirmResult {
  readonly confirmed: boolean;
  readonly reason: string;
}

interface PendingConfirm {
  readonly request: ConfirmRequest;
  readonly resolve: (result: ConfirmResult) => void;
}

/**
 * Onay diyaloglarının tek yönetim noktası.
 *
 * Yıkıcı işlemler `confirm()` çağrısı olmadan tamamlanmaz (PROJECT_RULES.md §1).
 * `AppConfirmDialogComponent` uygulama kabuğunda bir kez render edilir ve
 * bu servisin sinyalini dinler.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly pendingState = signal<PendingConfirm | null>(null);

  readonly pending = this.pendingState.asReadonly();

  /** Basit onay — yalnızca evet/hayır. */
  confirm(request: ConfirmRequest): Promise<boolean> {
    return this.ask(request).then((result) => result.confirmed);
  }

  /** Gerekçeli onay — reddedilirse `confirmed: false` döner. */
  ask(request: ConfirmRequest): Promise<ConfirmResult> {
    return new Promise<ConfirmResult>((resolve) => {
      this.pendingState.set({ request, resolve });
    });
  }

  resolve(result: ConfirmResult): void {
    const pending = this.pendingState();
    this.pendingState.set(null);
    pending?.resolve(result);
  }

  dismiss(): void {
    this.resolve({ confirmed: false, reason: '' });
  }
}
