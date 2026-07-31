import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';

import { UiStore } from '../../state/ui.store';
import { SKIP_LOADING } from '../http-context';

/**
 * Uçuşta olan istek sayısını tutar — header'daki ince ilerleme çubuğu bunu kullanır.
 * Autosave / heartbeat gibi arka plan istekleri `skipLoading` ile hariç tutulur.
 */
export const loadingInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.context.get(SKIP_LOADING)) return next(request);

  const ui = inject(UiStore);
  ui.requestStarted();
  return next(request).pipe(finalize(() => ui.requestFinished()));
};
