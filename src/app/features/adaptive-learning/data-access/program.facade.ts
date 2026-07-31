import { Injectable, inject } from '@angular/core';

import { ToastStore } from '../../../core/observability/toast.store';
import { Program, ProgramCreateRequest } from '../models/program.model';
import { CatalogFacade } from './catalog.facade';
import { ProgramRepository } from './catalog.repository';

/** Program orkestrasyonu — ortak katalog davranışını `CatalogFacade`'ten alır. */
@Injectable({ providedIn: 'root' })
export class ProgramFacade extends CatalogFacade<Program, ProgramCreateRequest> {
  constructor() {
    super({
      repository: inject(ProgramRepository),
      toast: inject(ToastStore),
      labels: { entity: 'Program', nameOf: (item) => (item as Program).name },
      initialQuery: { sort: { field: 'code', direction: 'asc' } },
    });
  }
}
