import { ChangeDetectionStrategy, Component, computed, effect, input, output } from '@angular/core';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppDialogComponent } from '../../../../shared/components/app-dialog/app-dialog.component';
import { AppFormFieldComponent } from '../../../../shared/components/app-form-field/app-form-field.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppInputComponent } from '../../../../shared/components/app-input/app-input.component';
import { AppNumberInputComponent } from '../../../../shared/components/app-number-input/app-number-input.component';
import { AppSelectComponent } from '../../../../shared/components/app-select/app-select.component';
import { AppTagInputComponent } from '../../../../shared/components/app-tag-input/app-tag-input.component';
import { AppTextareaComponent } from '../../../../shared/components/app-textarea/app-textarea.component';
import {
  REPORT_FREQUENCIES,
  REPORT_FREQUENCY_LABELS,
  REPORT_LIMITS,
  REPORT_WIDGET_KINDS,
  REPORT_WIDGET_LABELS,
  ReportFrequency,
  ReportWidget,
  ReportWidgetKind,
  SavedReport,
} from '../../models/analytics.model';

/** Widget'ın besleneceği veri kaynakları — analitik ekranlarıyla birebir. */
export const REPORT_SOURCES: readonly { value: string; label: string }[] = [
  { value: 'overview', label: 'Genel bakış göstergeleri' },
  { value: 'trends', label: 'Trend serileri' },
  { value: 'outcomes', label: 'Kazanım analitiği' },
  { value: 'difficulty', label: 'Soru zorluk analizi' },
  { value: 'mastery-matrix', label: 'Ustalık ısı haritası' },
  { value: 'recommendations', label: 'Öneri motoru' },
  { value: 'velocity', label: 'Öğrenme hızı' },
  { value: 'performers', label: 'Başarı panosu' },
];

/** Kaydetme yükü — id sunucuda üretilir. */
export interface ReportDraft {
  readonly name: string;
  readonly description: string;
  readonly filters: Readonly<Record<string, string>>;
  readonly widgets: readonly ReportWidget[];
  readonly schedule: SavedReport['schedule'];
}

/**
 * Rapor oluşturucu (§19, §20).
 *
 * Widget listesi FormArray ile tutulur; sıra kullanıcı tarafından değiştirilir
 * çünkü rapor düzeni bir anlatı sırasıdır — önce özet, sonra ayrıntı.
 *
 * Zamanlama kısmı bilinçli olarak "örnek" etiketiyle sunulur: bu projede
 * gerçek bir zamanlayıcı veya e-posta gönderimi yoktur. Bunu gizlemek,
 * kullanıcının gelmeyecek bir raporu beklemesine yol açardı.
 */
@Component({
  selector: 'app-report-builder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDialogComponent,
    AppFormFieldComponent,
    AppIconComponent,
    AppInputComponent,
    AppNumberInputComponent,
    AppSelectComponent,
    AppTagInputComponent,
    AppTextareaComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './report-builder.component.html',
  styleUrl: './report-builder.component.scss',
})
export class ReportBuilderComponent {
  /** Düzenlenecek rapor; `null` ise yeni rapor oluşturulur. */
  readonly report = input<SavedReport | null>(null);
  /** Kaydedilirken saklanacak güncel analitik filtreleri. */
  readonly currentFilters = input<Readonly<Record<string, string>>>({});
  readonly saving = input(false);

  readonly save = output<ReportDraft>();
  readonly cancel = output<void>();

  readonly limits = REPORT_LIMITS;

  readonly kindOptions = REPORT_WIDGET_KINDS.map((kind) => ({
    value: kind,
    label: REPORT_WIDGET_LABELS[kind],
  }));
  readonly sourceOptions = REPORT_SOURCES;
  readonly frequencyOptions = REPORT_FREQUENCIES.map((frequency) => ({
    value: frequency,
    label: REPORT_FREQUENCY_LABELS[frequency],
  }));
  readonly spanOptions = [
    { value: '1', label: 'Yarım genişlik' },
    { value: '2', label: 'Tam genişlik' },
  ];

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(REPORT_LIMITS.name.min),
        Validators.maxLength(REPORT_LIMITS.name.max),
      ],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(REPORT_LIMITS.description.max)],
    }),
    widgets: new FormArray<FormGroup<WidgetForm>>([]),
    scheduleEnabled: new FormControl(false, { nonNullable: true }),
    frequency: new FormControl<ReportFrequency>('weekly', { nonNullable: true }),
    dayOfPeriod: new FormControl(1, { nonNullable: true }),
    hour: new FormControl(8, { nonNullable: true }),
    recipients: new FormControl<readonly string[]>([], { nonNullable: true }),
  });

  get widgets(): FormArray<FormGroup<WidgetForm>> {
    return this.form.controls.widgets;
  }

  readonly title = computed(() =>
    this.report() ? 'Raporu düzenle' : 'Yeni rapor oluştur',
  );

  /** Gün alanının sınırı sıklığa göre değişir. */
  readonly maxDay = computed(() => (this.form.controls.frequency.value === 'weekly' ? 7 : 28));

  constructor() {
    effect(() => this.reset(this.report()));
  }

  addWidget(): void {
    if (this.widgets.length >= REPORT_LIMITS.widgets.max) return;

    this.widgets.push(
      new FormGroup<WidgetForm>({
        id: new FormControl(`w_${Date.now().toString(36)}_${this.widgets.length}`, {
          nonNullable: true,
        }),
        kind: new FormControl<ReportWidgetKind>('kpi', { nonNullable: true }),
        title: new FormControl('Yeni bileşen', {
          nonNullable: true,
          validators: [Validators.required, Validators.maxLength(60)],
        }),
        source: new FormControl('overview', { nonNullable: true }),
        span: new FormControl('1', { nonNullable: true }),
      }),
    );
  }

  removeWidget(index: number): void {
    this.widgets.removeAt(index);
  }

  moveWidget(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.widgets.length) return;

    const control = this.widgets.at(index);
    this.widgets.removeAt(index);
    this.widgets.insert(target, control);
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const value = this.form.getRawValue();

    this.save.emit({
      name: value.name.trim(),
      description: value.description.trim(),
      filters: this.currentFilters(),
      widgets: value.widgets.map((widget) => ({
        id: widget.id,
        kind: widget.kind,
        title: widget.title.trim(),
        source: widget.source,
        span: widget.span === '2' ? 2 : 1,
      })),
      schedule: value.scheduleEnabled
        ? {
            frequency: value.frequency,
            dayOfPeriod: value.dayOfPeriod,
            hour: value.hour,
            recipients: value.recipients.slice(0, REPORT_LIMITS.recipients.max),
            enabled: true,
            nextRunAt: nextRunAt(value.frequency, value.dayOfPeriod, value.hour),
          }
        : null,
    });
  }

  /** Form durumunu gelen rapora göre kurar. */
  private reset(report: SavedReport | null): void {
    this.widgets.clear();

    for (const widget of report?.widgets ?? []) {
      this.widgets.push(
        new FormGroup<WidgetForm>({
          id: new FormControl(widget.id, { nonNullable: true }),
          kind: new FormControl(widget.kind, { nonNullable: true }),
          title: new FormControl(widget.title, {
            nonNullable: true,
            validators: [Validators.required, Validators.maxLength(60)],
          }),
          source: new FormControl(widget.source, { nonNullable: true }),
          span: new FormControl(String(widget.span), { nonNullable: true }),
        }),
      );
    }

    const schedule = report?.schedule ?? null;

    this.form.patchValue({
      name: report?.name ?? '',
      description: report?.description ?? '',
      scheduleEnabled: schedule !== null,
      frequency: schedule?.frequency ?? 'weekly',
      dayOfPeriod: schedule?.dayOfPeriod ?? 1,
      hour: schedule?.hour ?? 8,
      recipients: schedule?.recipients ?? [],
    });
  }
}

interface WidgetForm {
  id: FormControl<string>;
  kind: FormControl<ReportWidgetKind>;
  title: FormControl<string>;
  source: FormControl<string>;
  span: FormControl<string>;
}

/**
 * Sonraki çalışma zamanı.
 *
 * Gerçek bir zamanlayıcı olmadığı için bu değer yalnızca ekranda gösterilir;
 * yine de tutarlı olsun diye takvimden hesaplanır, uydurulmaz.
 */
function nextRunAt(frequency: ReportFrequency, dayOfPeriod: number, hour: number): string {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);

  if (frequency === 'weekly') {
    const currentDay = next.getDay() === 0 ? 7 : next.getDay();
    let delta = dayOfPeriod - currentDay;
    if (delta < 0 || (delta === 0 && next <= now)) delta += 7;
    next.setDate(next.getDate() + delta);
  } else {
    next.setDate(dayOfPeriod);
    if (next <= now) next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString();
}
