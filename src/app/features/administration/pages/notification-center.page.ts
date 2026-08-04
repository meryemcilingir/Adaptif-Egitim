import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';

import { createPageRequest } from '../../../core/api/page-request';
import { ROLES, ROLE_LABELS } from '../../../core/auth/permission.model';
import { AppButtonComponent } from '../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../shared/components/app-card/app-card.component';
import { DialogService } from '../../../shared/components/app-dialog/dialog.service';
import { AppEmptyStateComponent } from '../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../shared/components/app-error-state/app-error-state.component';
import {
  ExportMenuComponent,
  ExportTable,
} from '../../../shared/components/app-export-menu/app-export-menu.component';
import { AppFormFieldComponent } from '../../../shared/components/app-form-field/app-form-field.component';
import { AppIconComponent } from '../../../shared/components/app-icon/app-icon.component';
import { AppInputComponent } from '../../../shared/components/app-input/app-input.component';
import { AppLoadingStateComponent } from '../../../shared/components/app-loading-state/app-loading-state.component';
import { AppSelectComponent } from '../../../shared/components/app-select/app-select.component';
import { AppStatusBadgeComponent } from '../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTextareaComponent } from '../../../shared/components/app-textarea/app-textarea.component';
import {
  CAMPAIGN_LIMITS,
  NOTIFICATION_AUDIENCES,
  NOTIFICATION_AUDIENCE_LABELS,
  NotificationAudience,
} from '../../adaptive-learning/domain/notification-targeting';
import {
  CourseRepository,
  ProgramRepository,
  ReferenceRepository,
} from '../../adaptive-learning/data-access/catalog.repository';
import { CohortSummary } from '../../adaptive-learning/models/common.model';
import {
  CAMPAIGN_KINDS,
  CAMPAIGN_KIND_LABELS,
  CAMPAIGN_STATE_LABELS,
  CampaignKind,
  CampaignState,
  NotificationCampaign,
} from '../models/admin.model';
import { NotificationAdminFacade } from '../data-access/notification-admin.facade';

const STATE_TONES: Readonly<Record<CampaignState, 'success' | 'warning' | 'neutral'>> = {
  DRAFT: 'neutral',
  SCHEDULED: 'warning',
  SENT: 'success',
};

/**
 * Bildirim merkezi (Sprint 9 §7, §8).
 *
 * Sol tarafta oluşturucu, sağda gönderim geçmişi. Hedef seçilir seçilmez
 * "kaç kişiye gidecek?" önizlemesi gelir — bu sayı GÖNDERİM ANINDAKİ hesabın
 * aynısıdır (aynı sunucu fonksiyonu), dolayısıyla önizleme yanıltamaz.
 *
 * Gönderilmiş bildirim düzenlenemez ve silinemez: kullanıcıların gördüğü metin
 * ile geçmişteki kayıt farklılaşırsa gönderim geçmişi yalancı olur.
 */
@Component({
  selector: 'app-notification-center-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppFormFieldComponent,
    AppIconComponent,
    AppInputComponent,
    AppLoadingStateComponent,
    AppSelectComponent,
    AppStatusBadgeComponent,
    AppTextareaComponent,
    DatePipe,
    ExportMenuComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './notification-center.page.html',
  styleUrl: './notification-center.page.scss',
})
export class NotificationCenterPage implements OnInit {
  protected readonly facade = inject(NotificationAdminFacade);
  private readonly dialog = inject(DialogService);
  private readonly programs = inject(ProgramRepository);
  private readonly courses = inject(CourseRepository);
  private readonly reference = inject(ReferenceRepository);

  private readonly editingState = signal<NotificationCampaign | null>(null);
  private readonly targetOptionsState = signal<readonly { value: string; label: string }[]>([]);

  readonly limits = CAMPAIGN_LIMITS;
  readonly stateLabels = CAMPAIGN_STATE_LABELS;
  readonly kindLabels = CAMPAIGN_KIND_LABELS;

  readonly items = this.facade.items;
  readonly total = this.facade.total;
  readonly status = this.facade.status;
  readonly error = this.facade.error;
  readonly saving = this.facade.saving;
  readonly preview = this.facade.preview;

  readonly isLoading = computed(() => this.status() === 'loading');
  readonly hasError = computed(() => this.status() === 'error');
  readonly isEmpty = computed(() => this.status() === 'success' && this.items().length === 0);

  readonly editing = this.editingState.asReadonly();
  readonly targetOptions = this.targetOptionsState.asReadonly();

  readonly audienceOptions = NOTIFICATION_AUDIENCES.map((audience) => ({
    value: audience,
    label: NOTIFICATION_AUDIENCE_LABELS[audience],
  }));

  readonly kindOptions = CAMPAIGN_KINDS.map((kind) => ({
    value: kind,
    label: CAMPAIGN_KIND_LABELS[kind],
  }));

  private readonly programOptionsState = signal<readonly { value: string; label: string }[]>([]);
  private readonly courseOptionsState = signal<readonly { value: string; label: string }[]>([]);
  private readonly cohortOptionsState = signal<readonly { value: string; label: string }[]>([]);

  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(CAMPAIGN_LIMITS.title.min),
        Validators.maxLength(CAMPAIGN_LIMITS.title.max),
      ],
    }),
    body: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(CAMPAIGN_LIMITS.body.max)],
    }),
    kind: new FormControl<CampaignKind>('announcement', { nonNullable: true }),
    audience: new FormControl<NotificationAudience>('all', { nonNullable: true }),
    audienceValue: new FormControl('', { nonNullable: true }),
    scheduledFor: new FormControl('', { nonNullable: true }),
  });

  private readonly audienceState = signal<NotificationAudience>('all');
  private readonly audienceValue = this.audienceState.asReadonly();

  /**
   * Form değerinin sinyal karşılığı.
   *
   * Reactive Forms sinyal değildir; `computed` içinde `form.valid` okumak
   * bağımlılık kurmaz ve düğme ilk hesaplanan durumunda donardı (ADR-070).
   */
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** Hedef türü `all` değilse bir kayıt seçilmelidir. */
  readonly needsTarget = computed(() => this.audienceValue() !== 'all');

  readonly canSubmit = computed(() => {
    void this.formValue();
    return this.form.valid && (!this.needsTarget() || this.form.controls.audienceValue.value !== '');
  });

  readonly exportTable = computed<ExportTable | null>(() => {
    const rows = this.items();
    if (rows.length === 0) return null;

    return {
      fileName: 'bildirimler',
      columns: [
        'Başlık',
        'Tür',
        'Hedef',
        'Durum',
        'Alıcı',
        'Oluşturma',
        'Gönderim',
        'Teslim notu',
      ],
      rows: rows.map((campaign) => [
        campaign.title,
        CAMPAIGN_KIND_LABELS[campaign.kind],
        campaign.audienceLabel,
        CAMPAIGN_STATE_LABELS[campaign.state],
        campaign.recipientCount ?? '—',
        campaign.createdAt.slice(0, 10),
        campaign.sentAt?.slice(0, 10) ?? '—',
        campaign.deliveryNote,
      ]),
    };
  });

  constructor() {
    this.form.controls.audience.valueChanges.pipe(takeUntilDestroyed()).subscribe((audience) => {
      this.audienceState.set(audience);

      // Tür değişince önceki seçim başka bir varlık kümesine aitti; temizlenir.
      this.form.controls.audienceValue.setValue('');
      this.targetOptionsState.set(this.optionsFor(audience));
      this.facade.clearPreview();

      if (audience === 'all') this.facade.previewAudience({ audience, value: null });
    });

    this.form.controls.audienceValue.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => {
        this.facade.previewAudience({ audience: this.audienceValue(), value: value || null });
      });
  }

  ngOnInit(): void {
    this.facade.load();
    this.loadReferences();
    this.facade.previewAudience({ audience: 'all', value: null });
  }

  toneOf(state: CampaignState): 'success' | 'warning' | 'neutral' {
    return STATE_TONES[state];
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (!this.canSubmit()) return;

    const value = this.form.getRawValue();
    const editing = this.editingState();

    const draft = {
      title: value.title.trim(),
      body: value.body.trim(),
      kind: value.kind,
      audience: value.audience,
      audienceValue: value.audienceValue || null,
      scheduledFor: value.scheduledFor || null,
    };

    const request = editing
      ? this.facade.update(editing.id, draft, editing.version)
      : this.facade.create(draft);

    request.subscribe({ next: () => this.resetForm(), error: () => undefined });
  }

  edit(campaign: NotificationCampaign): void {
    this.editingState.set(campaign);
    this.audienceState.set(campaign.audience);
    this.targetOptionsState.set(this.optionsFor(campaign.audience));

    this.form.setValue({
      title: campaign.title,
      body: campaign.body,
      kind: campaign.kind,
      audience: campaign.audience,
      audienceValue: campaign.audienceValue ?? '',
      scheduledFor: campaign.scheduledFor?.slice(0, 10) ?? '',
    });
  }

  resetForm(): void {
    this.editingState.set(null);
    this.audienceState.set('all');
    this.form.reset({
      title: '',
      body: '',
      kind: 'announcement',
      audience: 'all',
      audienceValue: '',
      scheduledFor: '',
    });
  }

  async send(campaign: NotificationCampaign): Promise<void> {
    const preview = this.preview();

    const confirmed = await this.dialog.confirm({
      title: 'Bildirim gönderilsin mi?',
      message: `“${campaign.title}” — ${campaign.audienceLabel}. Gönderim geri alınamaz ve bildirim düzenlenemez hâle gelir.${
        preview ? ` Tahminî alıcı: ${preview.recipientCount}.` : ''
      }`,
      confirmLabel: 'Gönder',
      tone: 'primary',
    });

    if (!confirmed) return;

    this.facade.send(campaign.id);
  }

  async remove(campaign: NotificationCampaign): Promise<void> {
    const confirmed = await this.dialog.confirm({
      title: 'Bildirim silinsin mi?',
      message: `“${campaign.title}” taslağı kalıcı olarak silinecek.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (!confirmed) return;

    this.facade.remove(campaign.id);
  }

  onPage(page: number): void {
    this.facade.goToPage(page);
  }

  private optionsFor(
    audience: NotificationAudience,
  ): readonly { value: string; label: string }[] {
    switch (audience) {
      case 'role':
        return ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
      case 'program':
        return this.programOptionsState();
      case 'course':
        return this.courseOptionsState();
      case 'cohort':
        return this.cohortOptionsState();
      default:
        return [];
    }
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

        this.targetOptionsState.set(this.optionsFor(this.audienceValue()));
      },
      error: () => undefined,
    });
  }
}
