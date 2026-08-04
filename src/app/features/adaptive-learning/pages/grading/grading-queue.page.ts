import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  TemplateRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { createPageRequest } from '../../../../core/api/page-request';
import { AppFilterBarComponent } from '../../../../shared/components/app-filter-bar/app-filter-bar.component';
import { FilterDefinition } from '../../../../shared/components/app-filter-bar/filter-definition';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../../shared/components/app-table/column-def';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { ATTEMPT_STATES, ATTEMPT_STATE_LABELS, GradingQueueItem } from '../../models/attempt.model';
import { CourseRepository } from '../../data-access/catalog.repository';
import { GradingFacade } from '../../data-access/grading.facade';

/**
 * Değerlendirme kuyruğu.
 *
 * Kuyruk yalnızca İŞ BEKLEYEN denemeleri gösterir: elle puanlanacak cevabı,
 * çözülmemiş çakışması veya açık itirazı olanlar. Tamamlanmış denemeler deneme
 * listesinden izlenir — kuyruğu "her şeyin listesi" yapmak, onu bir yapılacaklar
 * aracı olmaktan çıkarırdı.
 *
 * Varsayılan sıralama bekleme süresine göredir: en uzun bekleyen en üstte.
 */
@Component({
  selector: 'app-grading-queue-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppFilterBarComponent, AppStatusBadgeComponent, AppTableComponent],
  templateUrl: './grading-queue.page.html',
  styleUrl: './grading-queue.page.scss',
})
export class GradingQueuePage implements OnInit {
  protected readonly facade = inject(GradingFacade);
  private readonly courses = inject(CourseRepository);
  private readonly router = inject(Router);

  private readonly studentCell =
    viewChild.required<TemplateRef<{ $implicit: GradingQueueItem }>>('studentCell');
  private readonly workCell =
    viewChild.required<TemplateRef<{ $implicit: GradingQueueItem }>>('workCell');
  private readonly waitingCell =
    viewChild.required<TemplateRef<{ $implicit: GradingQueueItem }>>('waitingCell');

  private readonly courseOptionsState = signal<readonly { value: string; label: string }[]>([]);

  toneFor(state: string) {
    return statusPresentation(state);
  }

  readonly columns = computed<readonly ColumnDef<GradingQueueItem>[]>(() => [
    { key: 'studentName', header: 'Öğrenci', sortable: true, cell: this.studentCell() },
    {
      key: 'examTitle',
      header: 'Sınav',
      sortable: true,
      value: (row) => `${row.courseCode} · ${row.examTitle}`,
    },
    { key: 'work', header: 'Bekleyen iş', width: '220px', cell: this.workCell() },
    {
      key: 'submittedAt',
      header: 'Gönderim',
      sortable: true,
      width: '130px',
      hideBelow: 'laptop',
      value: (row) => new Date(row.submittedAt).toLocaleDateString('tr-TR'),
    },
    {
      key: 'waitingHours',
      header: 'Bekleme',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '110px',
      cell: this.waitingCell(),
    },
  ]);

  readonly filters = computed<readonly FilterDefinition[]>(() => [
    {
      key: 'state',
      label: 'Durum',
      kind: 'multi',
      options: ATTEMPT_STATES.map((state) => ({
        value: state,
        label: ATTEMPT_STATE_LABELS[state],
      })),
    },
    {
      key: 'courseCode',
      label: 'Ders',
      kind: 'single',
      options: this.courseOptionsState(),
    },
  ]);

  ngOnInit(): void {
    this.facade.loadQueue();

    this.courses.list(createPageRequest({ size: 200 })).subscribe({
      next: (page) =>
        this.courseOptionsState.set(
          page.items.map((course) => ({
            value: course.code,
            label: `${course.code} · ${course.name}`,
          })),
        ),
    });
  }

  /** Bekleme süresi uzadıkça vurgulanır — kuyruğun tıkandığı yer görünür olsun. */
  waitingTone(hours: number): 'neutral' | 'warning' | 'danger' {
    if (hours >= 72) return 'danger';
    if (hours >= 24) return 'warning';
    return 'neutral';
  }

  formatWaiting(hours: number): string {
    if (hours < 1) return '1 saatten az';
    if (hours < 24) return `${hours} saat`;
    return `${Math.floor(hours / 24)} gün`;
  }

  open(item: GradingQueueItem): void {
    void this.router.navigate(['/grading', item.id]);
  }
}
