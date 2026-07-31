import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';

import { DialogService } from '../../../shared/components/app-dialog/dialog.service';

/** Kirli form içeren sayfalar bu arayüzü uygular. */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

/**
 * Kaydedilmemiş değişiklik varken sayfadan ayrılmayı onaya bağlar.
 * Interface Segregation: sayfa yalnızca tek bir metot sözleşmesini karşılar.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = async (component) => {
  if (!component.hasUnsavedChanges()) return true;

  return inject(DialogService).confirm({
    title: 'Kaydedilmemiş değişiklikler var',
    message: 'Sayfadan ayrılırsanız yaptığınız değişiklikler kaybolacak. Devam edilsin mi?',
    confirmLabel: 'Ayrıl',
    cancelLabel: 'Sayfada kal',
    tone: 'warning',
  });
};
