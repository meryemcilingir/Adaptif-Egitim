import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiClient } from '../../../core/api/api-client';
import { API } from '../../../core/api/api-endpoints';
import { DashboardSnapshot } from '../models/dashboard.model';

/** Dashboard verisinin tek HTTP sahibi. Facade endpoint bilmez. */
@Injectable({ providedIn: 'root' })
export class DashboardRepository {
  private readonly api = inject(ApiClient);

  load(): Observable<DashboardSnapshot> {
    return this.api.get<DashboardSnapshot>(API.analytics.dashboard);
  }
}
