import { FormGroup } from '@angular/forms';

import { ApiError } from '../../core/api/api-error';

/**
 * Sunucudan gelen alan hatalarını forma yazar.
 *
 * Sunucu doğrulaması istemciyle aynı sabitleri kullanır; yine de tekillik gibi
 * yalnızca sunucunun bilebileceği kurallar vardır (ör. "bu kod zaten kullanılıyor").
 * Bu tür hatalar ilgili alanın altında gösterilir — kullanıcı nereyi düzelteceğini bilir.
 *
 * Temizlemeye gerek yoktur: kullanıcı alanı düzenlediğinde Angular validator'ları
 * yeniden çalışır ve hata nesnesini baştan üretir, `server` anahtarı kendiliğinden düşer.
 */
export function applyServerFieldErrors(form: FormGroup, error: ApiError): void {
  for (const fieldError of error.fieldErrors) {
    const control = form.get(fieldError.field);
    if (!control) continue;

    control.setErrors({ ...(control.errors ?? {}), server: fieldError.message });
    control.markAsTouched();
  }
}
