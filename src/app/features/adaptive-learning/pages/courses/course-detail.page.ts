import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ApiError } from '../../../../core/api/api-error';
import { createPageRequest } from '../../../../core/api/page-request';
import { PermissionService } from '../../../../core/auth/permission.service';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import { SelectOption } from '../../../../shared/components/app-select/app-select.component';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import {
  PublishActionsComponent,
  TransitionRequest,
} from '../../components/publish-actions/publish-actions.component';
import {
  OutcomeRepository,
  ProgramRepository,
  ReferenceRepository,
} from '../../data-access/catalog.repository';
import { CourseFacade } from '../../data-access/course.facade';
import {
  COURSE_CATEGORY_LABELS,
  COURSE_LEVEL_LABELS,
  Course,
  CourseCreateRequest,
} from '../../models/course.model';
import { LearningOutcome } from '../../models/learning-outcome.model';
import { COGNITIVE_LEVEL_LABELS, DIFFICULTY_LABELS } from '../../models/common.model';
import { isEditable } from '../../domain/publish-workflow';
import { CourseFormComponent } from './course-form.component';

/** Ders detayı: künye, yayın iş akışı ve derse bağlı kazanımlar. */
@Component({
  selector: 'app-course-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppLoadingStateComponent,
    AppStatusBadgeComponent,
    CourseFormComponent,
    PublishActionsComponent,
    RelativeTimePipe,
  ],
  templateUrl: './course-detail.page.html',
  styleUrl: './course-detail.page.scss',
})
export class CourseDetailPage implements OnInit {
  protected readonly facade = inject(CourseFacade);
  private readonly outcomes = inject(OutcomeRepository);
  private readonly programs = inject(ProgramRepository);
  private readonly reference = inject(ReferenceRepository);
  private readonly dialogs = inject(DialogService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  private readonly outcomeState = signal<readonly LearningOutcome[]>([]);
  private readonly outcomeLoadingState = signal(false);
  private readonly programOptionsState = signal<readonly SelectOption[]>([]);
  private readonly termOptionsState = signal<readonly SelectOption[]>([]);
  private readonly instructorOptionsState = signal<readonly SelectOption[]>([]);
  private readonly formOpenState = signal(false);
  private readonly pendingTargetState = signal<TransitionRequest['state'] | null>(null);

  readonly courseOutcomes = this.outcomeState.asReadonly();
  readonly isOutcomesLoading = this.outcomeLoadingState.asReadonly();
  readonly programOptions = this.programOptionsState.asReadonly();
  readonly termOptions = this.termOptionsState.asReadonly();
  readonly instructorOptions = this.instructorOptionsState.asReadonly();
  readonly isFormOpen = this.formOpenState.asReadonly();
  readonly pendingTarget = this.pendingTargetState.asReadonly();

  readonly labels = {
    category: COURSE_CATEGORY_LABELS,
    level: COURSE_LEVEL_LABELS,
    cognitive: COGNITIVE_LEVEL_LABELS,
    difficulty: DIFFICULTY_LABELS,
  };

  readonly canWrite = computed(() => this.permissions.can('course:write'));
  readonly canPublish = computed(() => this.permissions.can('course:publish'));
  readonly canEdit = computed(() => {
    const course = this.facade.detail();
    return this.canWrite() && course !== null && isEditable(course.state);
  });

  constructor() {
    effect(() => {
      const id = this.id();
      this.facade.loadDetail(id);
      this.loadOutcomes(id);
    });
  }

  ngOnInit(): void {
    forkJoin({
      programs: this.programs.list(createPageRequest({ size: 100 })),
      terms: this.reference.terms(),
      instructors: this.reference.staff('INSTRUCTOR'),
    }).subscribe({
      next: ({ programs, terms, instructors }) => {
        this.programOptionsState.set(
          programs.items.map((program) => ({
            value: program.id,
            label: `${program.code} · ${program.name}`,
          })),
        );
        this.termOptionsState.set(terms.map((term) => ({ value: term.id, label: term.name })));
        this.instructorOptionsState.set(
          instructors.map((user) => ({ value: user.id, label: user.fullName })),
        );
      },
    });
  }

  toneFor(state: string) {
    return statusPresentation(state);
  }

  goBack(): void {
    void this.router.navigate(['/courses']);
  }

  openOutcome(outcome: LearningOutcome): void {
    void this.router.navigate(['/outcomes', outcome.id]);
  }

  openOutcomeList(course: Course): void {
    void this.router.navigate(['/outcomes'], { queryParams: { courseId: course.id } });
  }

  openContentList(course: Course): void {
    void this.router.navigate(['/contents'], { queryParams: { courseId: course.id } });
  }

  openGraph(course: Course): void {
    void this.router.navigate(['/outcomes/map'], { queryParams: { courseId: course.id } });
  }

  openForm(): void {
    this.formOpenState.set(true);
  }

  closeForm(): void {
    this.formOpenState.set(false);
  }

  onSave(payload: CourseCreateRequest, form: CourseFormComponent): void {
    const course = this.facade.detail();
    if (!course) return;

    this.facade.update(course, payload).subscribe({
      next: () => this.closeForm(),
      error: (error: ApiError) => form.applyServerErrors(error),
    });
  }

  onTransition(request: TransitionRequest): void {
    const course = this.facade.detail();
    if (!course) return;

    this.pendingTargetState.set(request.state);
    this.facade.transition(course, request.state, request.reason).subscribe({
      next: () => this.pendingTargetState.set(null),
      error: () => this.pendingTargetState.set(null),
    });
  }

  async confirmDelete(): Promise<void> {
    const course = this.facade.detail();
    if (!course) return;

    const confirmed = await this.dialogs.confirm({
      title: 'Dersi sil',
      message: `"${course.name}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (!confirmed) return;

    this.facade.remove(course).subscribe({
      next: () => this.goBack(),
      error: () => undefined,
    });
  }

  private loadOutcomes(courseId: string): void {
    this.outcomeLoadingState.set(true);

    this.outcomes.list(createPageRequest({ size: 100, filters: { courseId } })).subscribe({
      next: (page) => {
        this.outcomeState.set(page.items);
        this.outcomeLoadingState.set(false);
      },
      error: () => {
        this.outcomeState.set([]);
        this.outcomeLoadingState.set(false);
      },
    });
  }
}
