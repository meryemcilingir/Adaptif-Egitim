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
import { forkJoin } from 'rxjs';

import { createPageRequest } from '../../../../core/api/page-request';
import { AppFilterBarComponent } from '../../../../shared/components/app-filter-bar/app-filter-bar.component';
import { FilterDefinition } from '../../../../shared/components/app-filter-bar/filter-definition';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../../shared/components/app-table/column-def';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { Attempt } from '../../models/attempt.model';
import { FilterValue } from '../../../../core/api/page-request';
import { formatDuration } from '../../domain/exam-clock';
import { CourseRepository } from '../../data-access/catalog.repository';
import { ExamRepository } from '../../data-access/exam.repository';
import { GradingFacade } from '../../data-access/grading.facade';

/**
 * Deneme listesi.
 *
 * Değerlendirme kuyruğundan farkı: burada TÜM denemeler vardır — tamamlanmış,
 * açıklanmış, bekleyen. Kuyruk "ne yapmam gerekiyor" sorusuna, bu liste "ne
 * oldu" sorusuna cevap verir.
 *
 * Puan sütunu yalnızca değerlendirmesi biten denemelerde doludur; bekleyenlerde
 * yanıltıcı bir kısmi toplam göstermek yerine tire konur.
 */
@Component({
  selector: 'app-attempt-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppFilterBarComponent, AppStatusBadgeComponent, AppTableComponent],
  templateUrl: './attempt-list.page.html',
  styleUrl: './attempt-list.page.scss',
})
export class AttemptListPage implements OnInit {
  protected readonly facade = inject(GradingFacade);
  private readonly courses = inject(CourseRepository);
  private readonly exams = inject(ExamRepository);
  private readonly router = inject(Router);

  private readonly studentCell =
    viewChild.required<TemplateRef<{ $implicit: Attempt }>>('studentCell');
  private readonly stateCell =
    viewChild.required<TemplateRef<{ $implicit: Attempt }>>('stateCell');
  private readonly scoreCell =
    viewChild.required<TemplateRef<{ $implicit: Attempt }>>('scoreCell');

  private readonly courseOptionsState = signal<readonly { value: string; label: string }[]>([]);
  private readonly examOptionsState = signal<readonly { value: string; label: string }[]>([]);

  /*
   * Liste iki kovaya ayrılır: ELİNİZDE İŞ OLANLAR ve BİTENLER.
   *
   * Ayrım eğitmenin sorusuna göre yapılır: "hâlâ ne yapmam gerekiyor?".
   * `GRADED` puanlanmıştır ama sonucu henüz açıklanmamıştır — eğitmenin bir
   * adım daha atması gerektiği için bekleyenler kovasındadır; yalnızca
   * `RELEASED` gerçekten kapanmış sayılır. Kovalar birlikte TÜM durumları
   * kapsar, hiçbir deneme iki kovanın arasında kaybolmaz.
   *
   * Aynı `state` alanını hem kovalar hem de bir açılır filtre yönetseydi ikisi
   * birbirini sessizce ezerdi; bu yüzden filtre çubuğunda durum filtresi YOK,
   * durum seçimi tek yerden (kovalardan) yapılır.
   */
  private static readonly PENDING_STATES = [
    'SUBMITTED',
    'AUTO_GRADED',
    'PENDING_MANUAL',
    'UNDER_REVIEW',
    'GRADED',
  ] as const;
  private static readonly RELEASED_STATES = ['RELEASED'] as const;

  private readonly bucketState = signal<'all' | 'pending' | 'released'>('all');
  readonly bucket = this.bucketState.asReadonly();

  setBucket(bucket: 'all' | 'pending' | 'released'): void {
    this.bucketState.set(bucket);

    const states: FilterValue =
      bucket === 'pending'
        ? [...AttemptListPage.PENDING_STATES]
        : bucket === 'released'
          ? [...AttemptListPage.RELEASED_STATES]
          : null;

    this.facade.setAttemptFilter('state', states);
  }

  /** Filtreler temizlenince kova seçimi de başa döner — ikisi tek durumdur. */
  clearFilters(): void {
    this.bucketState.set('all');
    this.facade.clearAttemptFilters();
  }

  toneFor(state: string) {
    return statusPresentation(state);
  }

  /** Puan yalnızca değerlendirme bittiğinde anlamlıdır. */
  hasScore(attempt: Attempt): boolean {
    return attempt.state === 'GRADED' || attempt.state === 'RELEASED';
  }

  durationOf(attempt: Attempt): string {
    return formatDuration(attempt.durationSeconds * 1000);
  }

  readonly columns = computed<readonly ColumnDef<Attempt>[]>(() => [
    { key: 'studentName', header: 'Öğrenci', sortable: true, cell: this.studentCell() },
    { key: 'examTitle', header: 'Sınav', sortable: true, value: (row) => row.examTitle },
    { key: 'state', header: 'Durum', sortable: true, width: '160px', cell: this.stateCell() },
    {
      key: 'startedAt',
      header: 'Başlangıç',
      sortable: true,
      width: '140px',
      hideBelow: 'laptop',
      value: (row) => this.formatDateTime(row.startedAt),
    },
    {
      key: 'submittedAt',
      header: 'Teslim',
      sortable: true,
      width: '140px',
      hideBelow: 'tablet',
      value: (row) => this.formatDateTime(row.submittedAt),
    },
    {
      key: 'durationSeconds',
      header: 'Süre',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '100px',
      hideBelow: 'laptop',
      value: (row) => this.durationOf(row),
    },
    {
      key: 'totalScore',
      header: 'Puan',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '110px',
      cell: this.scoreCell(),
    },
  ]);

  readonly filters = computed<readonly FilterDefinition[]>(() => [
    { key: 'courseId', label: 'Ders', kind: 'single', options: this.courseOptionsState() },
    { key: 'examId', label: 'Sınav', kind: 'single', options: this.examOptionsState() },
  ]);

  ngOnInit(): void {
    this.facade.loadAttempts();

    forkJoin({
      courses: this.courses.list(createPageRequest({ size: 200 })),
      exams: this.exams.list(createPageRequest({ size: 200 })),
    }).subscribe({
      next: ({ courses, exams }) => {
        this.courseOptionsState.set(
          courses.items.map((course) => ({
            value: course.id,
            label: `${course.code} · ${course.name}`,
          })),
        );
        this.examOptionsState.set(
          exams.items.map((exam) => ({ value: exam.id, label: exam.title })),
        );
      },
    });
  }

  open(attempt: Attempt): void {
    void this.router.navigate(['/attempts', attempt.id]);
  }

  private formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
