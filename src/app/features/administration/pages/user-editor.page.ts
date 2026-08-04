import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ApiError } from '../../../core/api/api-error';
import { ROLES, ROLE_LABELS, Role } from '../../../core/auth/permission.model';
import { createPageRequest } from '../../../core/api/page-request';
import { AppButtonComponent } from '../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../shared/components/app-card/app-card.component';
import { AppErrorStateComponent } from '../../../shared/components/app-error-state/app-error-state.component';
import { AppFormFieldComponent } from '../../../shared/components/app-form-field/app-form-field.component';
import { AppIconComponent } from '../../../shared/components/app-icon/app-icon.component';
import { AppInputComponent } from '../../../shared/components/app-input/app-input.component';
import { AppLoadingStateComponent } from '../../../shared/components/app-loading-state/app-loading-state.component';
import { AppMultiSelectComponent } from '../../../shared/components/app-multi-select/app-multi-select.component';
import { AppSelectComponent } from '../../../shared/components/app-select/app-select.component';
import {
  CourseRepository,
  ProgramRepository,
  ReferenceRepository,
} from '../../adaptive-learning/data-access/catalog.repository';
import { CohortSummary } from '../../adaptive-learning/models/common.model';
import { USER_LIMITS, UserDraft } from '../models/admin.model';
import { AdminRepository } from '../data-access/admin.repository';
import { UserAdminFacade } from '../data-access/user-admin.facade';

interface Option {
  readonly value: string;
  readonly label: string;
}

/**
 * Kullanıcı oluşturma ve düzenleme (Sprint 9 §2, §17).
 *
 * Tek bir ekran iki işi yapar: `id` verilmişse düzenleme, verilmemişse
 * oluşturma. İki ayrı ekran, aynı formu ve aynı doğrulamayı iki kez yazmak
 * olurdu.
 *
 * Birincil rol, seçili roller ARASINDAN seçilir; roller değiştiğinde birincil
 * rol geçersiz kalırsa otomatik düzeltilir — sunucuda reddedilen bir gövde
 * göndermenin anlamı yok.
 */
@Component({
  selector: 'app-user-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppErrorStateComponent,
    AppFormFieldComponent,
    AppIconComponent,
    AppInputComponent,
    AppLoadingStateComponent,
    AppMultiSelectComponent,
    AppSelectComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './user-editor.page.html',
  styleUrl: './user-editor.page.scss',
})
export class UserEditorPage implements OnInit {
  /** Düzenleme modunda rota parametresi; oluşturmada tanımsız. */
  readonly id = input<string | undefined>(undefined);

  protected readonly facade = inject(UserAdminFacade);
  private readonly repository = inject(AdminRepository);
  private readonly programs = inject(ProgramRepository);
  private readonly courses = inject(CourseRepository);
  private readonly reference = inject(ReferenceRepository);
  private readonly router = inject(Router);

  private readonly loadingState = signal(false);
  private readonly errorState = signal<ApiError | null>(null);
  private readonly versionState = signal(0);

  private readonly programOptionsState = signal<readonly Option[]>([]);
  private readonly courseOptionsState = signal<readonly Option[]>([]);
  private readonly cohortOptionsState = signal<readonly Option[]>([]);

  readonly limits = USER_LIMITS;
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly saving = this.facade.saving;

  readonly programOptions = this.programOptionsState.asReadonly();
  readonly courseOptions = this.courseOptionsState.asReadonly();
  readonly cohortOptions = this.cohortOptionsState.asReadonly();

  readonly isEditing = computed(() => this.id() !== undefined);
  readonly title = computed(() => (this.isEditing() ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı'));

  readonly roleOptions: readonly Option[] = ROLES.map((role) => ({
    value: role,
    label: ROLE_LABELS[role],
  }));

  readonly form = new FormGroup({
    fullName: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(USER_LIMITS.fullName.min),
        Validators.maxLength(USER_LIMITS.fullName.max),
      ],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(USER_LIMITS.email.max)],
    }),
    username: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(USER_LIMITS.username.min),
        Validators.maxLength(USER_LIMITS.username.max),
      ],
    }),
    department: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(USER_LIMITS.department.max)],
    }),
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(USER_LIMITS.title.max)],
    }),
    roles: new FormControl<readonly string[]>([], {
      nonNullable: true,
      validators: [Validators.required],
    }),
    primaryRole: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    programId: new FormControl('', { nonNullable: true }),
    courseIds: new FormControl<readonly string[]>([], { nonNullable: true }),
    cohortIds: new FormControl<readonly string[]>([], { nonNullable: true }),
  });

  /** Birincil rol seçenekleri, seçili rollerle sınırlıdır. */
  readonly primaryRoleOptions = computed(() =>
    this.selectedRoles().map((role) => ({ value: role, label: ROLE_LABELS[role as Role] ?? role })),
  );

  private readonly selectedRolesState = signal<readonly string[]>([]);
  private readonly selectedRoles = this.selectedRolesState.asReadonly();

  constructor() {
    this.form.controls.roles.valueChanges.subscribe((roles) => {
      this.selectedRolesState.set(roles);

      // Birincil rol artık seçili değilse ilk role düşülür; boş bırakmak formu kilitlerdi.
      const primary = this.form.controls.primaryRole.value;
      if (!roles.includes(primary)) {
        this.form.controls.primaryRole.setValue(roles[0] ?? '');
      }
    });
  }

  ngOnInit(): void {
    this.loadReferences();

    const id = this.id();
    if (id) this.loadUser(id);
  }

  onEmailBlur(): void {
    const username = this.form.controls.username;
    if (this.isEditing() || username.dirty || username.value.length > 0) return;

    const email = this.form.controls.email.value;
    const suggestion = (email.split('@')[0] ?? '').toLocaleLowerCase('tr-TR');
    if (suggestion) username.setValue(suggestion);
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();

    const draft: UserDraft = {
      fullName: value.fullName.trim(),
      email: value.email.trim().toLowerCase(),
      username: value.username.trim().toLowerCase(),
      department: value.department.trim(),
      title: value.title.trim(),
      roles: value.roles as readonly Role[],
      primaryRole: value.primaryRole as Role,
      programId: value.programId || null,
      courseIds: value.courseIds,
      cohortIds: value.cohortIds,
    };

    const id = this.id();

    const request = id
      ? this.facade.update(id, draft, this.versionState())
      : this.facade.create(draft);

    request.subscribe({
      next: (user) => void this.router.navigate(['/admin/users', user.id]),
      // Hata mesajını facade toast olarak gösterdi; ekran formda kalır.
      error: () => undefined,
    });
  }

  cancel(): void {
    const id = this.id();
    void this.router.navigate(id ? ['/admin/users', id] : ['/admin/users']);
  }

  private loadUser(id: string): void {
    this.loadingState.set(true);
    this.errorState.set(null);

    this.repository.user(id).subscribe({
      next: (user) => {
        this.versionState.set(user.version);
        this.selectedRolesState.set(user.roles);

        this.form.patchValue({
          fullName: user.fullName,
          email: user.email,
          username: user.username,
          department: user.department,
          title: user.title,
          roles: user.roles,
          primaryRole: user.primaryRole,
          programId: user.programId ?? '',
          courseIds: user.courseIds,
          cohortIds: user.cohortIds,
        });

        this.loadingState.set(false);
      },
      error: (error: ApiError) => {
        this.errorState.set(error);
        this.loadingState.set(false);
      },
    });
  }

  private loadReferences(): void {
    forkJoin({
      programs: this.programs.list(createPageRequest({ size: 100 })),
      courses: this.courses.list(createPageRequest({ size: 200 })),
      cohorts: this.reference.cohorts(),
    }).subscribe({
      next: ({ programs, courses, cohorts }) => {
        this.programOptionsState.set(
          programs.items.map((program) => ({ value: program.id, label: program.name })),
        );
        this.courseOptionsState.set(
          courses.items.map((course) => ({
            value: course.id,
            label: `${course.code} · ${course.name}`,
          })),
        );
        this.cohortOptionsState.set(
          cohorts.map((cohort: CohortSummary) => ({ value: cohort.id, label: cohort.name })),
        );
      },
      // Referanslar gelmezse seçiciler boş kalır; form yine de kaydedilebilir.
      error: () => undefined,
    });
  }

  retry(): void {
    const id = this.id();
    if (id) this.loadUser(id);
  }
}
