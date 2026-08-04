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
import { ATTEMPT_STATES, ATTEMPT_STATE_LABELS, Attempt } from '../../models/attempt.model';
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
    {
      key: 'state',
      label: 'Durum',
      kind: 'multi',
      options: ATTEMPT_STATES.map((state) => ({
        value: state,
        label: ATTEMPT_STATE_LABELS[state],
      })),
    },
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
