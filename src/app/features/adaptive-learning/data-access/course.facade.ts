import { Injectable, inject } from '@angular/core';

import { ToastStore } from '../../../core/observability/toast.store';
import { Course, CourseCreateRequest } from '../models/course.model';
import { CatalogFacade } from './catalog.facade';
import { CourseRepository } from './catalog.repository';

/** Ders orkestrasyonu — ortak katalog davranışını `CatalogFacade`'ten alır. */
@Injectable({ providedIn: 'root' })
export class CourseFacade extends CatalogFacade<Course, CourseCreateRequest> {
  constructor() {
    super({
      repository: inject(CourseRepository),
      toast: inject(ToastStore),
      labels: { entity: 'Ders', nameOf: (item) => (item as Course).name },
      initialQuery: { sort: { field: 'code', direction: 'asc' } },
    });
  }
}
