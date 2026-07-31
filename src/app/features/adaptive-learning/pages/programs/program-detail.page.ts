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

import { ApiError } from '../../../../core/api/api-error';
import { PermissionService } from '../../../../core/auth/permission.service';
import { createPageRequest } from '../../../../core/api/page-request';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import { SelectOption } from '../../../../shared/components/app-select/app-select.component';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import {
  PublishActionsComponent,
  TransitionRequest,
} from '../../components/publish-actions/publish-actions.component';
import { CourseRepository, ReferenceRepository } from '../../data-access/catalog.repository';
import { ProgramFacade } from '../../data-access/program.facade';
import { Course } from '../../models/course.model';
import { ProgramCreateRequest } from '../../models/program.model';
import { isEditable } from '../../domain/publish-workflow';
import { ProgramFormComponent } from './program-form.component';

/**
 * Program detayı: künye, yayın iş akışı ve programa bağlı dersler.
 * Route parametresi `withComponentInputBinding` ile doğrudan `input`'a bağlanır.
 */
@Component({
  selector: 'app-program-detail-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppLoadingStateComponent,
    AppStatusBadgeComponent,
    ProgramFormComponent,
    PublishActionsComponent,
    RelativeTimePipe,
  ],
  templateUrl: './program-detail.page.html',
  styleUrl: './program-detail.page.scss',
})
export class ProgramDetailPage implements OnInit {
  protected readonly facade = inject(ProgramFacade);
  private readonly courses = inject(CourseRepository);
  private readonly reference = inject(ReferenceRepository);
  private readonly dialogs = inject(DialogService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  private readonly courseState = signal<readonly Course[]>([]);
  private readonly courseLoadingState = signal(false);
  private readonly coordinatorState = signal<readonly SelectOption[]>([]);
  private readonly formOpenState = signal(false);
  private readonly pendingTargetState = signal<TransitionRequest['state'] | null>(null);

  readonly programCourses = this.courseState.asReadonly();
  readonly isCoursesLoading = this.courseLoadingState.asReadonly();
  readonly coordinators = this.coordinatorState.asReadonly();
  readonly isFormOpen = this.formOpenState.asReadonly();
  readonly pendingTarget = this.pendingTargetState.asReadonly();

  readonly canWrite = computed(() => this.permissions.can('course:write'));
  readonly canPublish = computed(() => this.permissions.can('course:publish'));
  readonly canEdit = computed(() => {
    const program = this.facade.detail();
    return this.canWrite() && program !== null && isEditable(program.state);
  });

  constructor() {
    // Route kimliği değişince detay ve bağlı dersler yeniden yüklenir.
    effect(() => {
      const id = this.id();
      this.facade.loadDetail(id);
      this.loadCourses(id);
    });
  }

  ngOnInit(): void {
    this.reference.staff('PROGRAM_MANAGER').subscribe({
      next: (staff) =>
        this.coordinatorState.set(staff.map((user) => ({ value: user.id, label: user.fullName }))),
    });
  }

  toneFor(state: string) {
    return statusPresentation(state);
  }

  openCourse(course: Course): void {
    void this.router.navigate(['/courses', course.id]);
  }

  goBack(): void {
    void this.router.navigate(['/programs']);
  }

  openForm(): void {
    this.formOpenState.set(true);
  }

  closeForm(): void {
    this.formOpenState.set(false);
  }

  onSave(payload: ProgramCreateRequest, form: ProgramFormComponent): void {
    const program = this.facade.detail();
    if (!program) return;

    this.facade.update(program, payload).subscribe({
      next: () => this.closeForm(),
      error: (error: ApiError) => form.applyServerErrors(error),
    });
  }

  onTransition(request: TransitionRequest): void {
    const program = this.facade.detail();
    if (!program) return;

    this.pendingTargetState.set(request.state);
    this.facade.transition(program, request.state, request.reason).subscribe({
      next: () => this.pendingTargetState.set(null),
      error: () => this.pendingTargetState.set(null),
    });
  }

  async confirmDelete(): Promise<void> {
    const program = this.facade.detail();
    if (!program) return;

    const confirmed = await this.dialogs.confirm({
      title: 'Programı sil',
      message: `"${program.name}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (!confirmed) return;

    this.facade.remove(program).subscribe({
      next: () => this.goBack(),
      error: () => undefined,
    });
  }

  private loadCourses(programId: string): void {
    this.courseLoadingState.set(true);

    this.courses.list(createPageRequest({ size: 100, filters: { programId } })).subscribe({
      next: (page) => {
        this.courseState.set(page.items);
        this.courseLoadingState.set(false);
      },
      error: () => {
        this.courseState.set([]);
        this.courseLoadingState.set(false);
      },
    });
  }
}
