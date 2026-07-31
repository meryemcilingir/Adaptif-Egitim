import { Injectable, computed, inject, signal } from '@angular/core';

import { ApiError } from '../api/api-error';
import { ID_GENERATOR } from '../platform/platform.tokens';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Toast {
  readonly id: string;
  readonly tone: ToastTone;
  readonly title: string;
  readonly message?: string;
  readonly action?: ToastAction;
  /** 0 → otomatik kapanmaz (kullanıcı kapatır). */
  readonly durationMs: number;
  readonly correlationId?: string;
}

const DEFAULT_DURATIONS: Readonly<Record<ToastTone, number>> = {
  success: 3500,
  info: 4000,
  warning: 6000,
  error: 0,
};

const MAX_VISIBLE = 4;

/**
 * Bildirim kuyruğu. Aynı anda en fazla `MAX_VISIBLE` bildirim gösterilir;
 * hata bildirimleri kullanıcı kapatana kadar durur.
 */
@Injectable({ providedIn: 'root' })
export class ToastStore {
  private readonly idGenerator = inject(ID_GENERATOR);
  private readonly state = signal<readonly Toast[]>([]);
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  readonly toasts = computed(() => this.state().slice(0, MAX_VISIBLE));

  success(title: string, message?: string, action?: ToastAction): string {
    return this.push({ tone: 'success', title, message, action });
  }

  info(title: string, message?: string, action?: ToastAction): string {
    return this.push({ tone: 'info', title, message, action });
  }

  warning(title: string, message?: string, action?: ToastAction): string {
    return this.push({ tone: 'warning', title, message, action });
  }

  error(title: string, message?: string, action?: ToastAction): string {
    return this.push({ tone: 'error', title, message, action });
  }

  /** `ApiError`'ı doğrudan bildirime çevirir — çağıran yerde tekrar mesaj yazılmaz. */
  fromApiError(error: ApiError, title = 'İşlem tamamlanamadı', retry?: () => void): string {
    return this.push({
      tone: error.code === 'FORBIDDEN' ? 'warning' : 'error',
      title,
      message: error.message,
      correlationId: error.correlationId,
      action: retry && error.retryable ? { label: 'Tekrar dene', run: retry } : undefined,
    });
  }

  dismiss(id: string): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    this.state.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  dismissAll(): void {
    for (const id of this.timers.keys()) this.dismiss(id);
    this.state.set([]);
  }

  private push(input: Omit<Toast, 'id' | 'durationMs'> & { durationMs?: number }): string {
    const toast: Toast = {
      ...input,
      id: this.idGenerator.next('toast'),
      durationMs: input.durationMs ?? DEFAULT_DURATIONS[input.tone],
    };

    this.state.update((toasts) => [toast, ...toasts]);

    if (toast.durationMs > 0) {
      this.timers.set(
        toast.id,
        setTimeout(() => this.dismiss(toast.id), toast.durationMs),
      );
    }
    return toast.id;
  }
}
