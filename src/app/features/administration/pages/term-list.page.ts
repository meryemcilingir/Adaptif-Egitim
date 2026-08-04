import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';

import { AppButtonComponent } from '../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../shared/components/app-card/app-card.component';
import { AppDialogComponent } from '../../../shared/components/app-dialog/app-dialog.component';
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
import {
  SEMESTERS,
  SEMESTER_LABELS,
  Semester,
  TERM_STATUS_LABELS,
  TermRecord,
  TermStatus,
  isEditable,
  termStatus,
  validateTerm,
} from '../../adaptive-learning/domain/academic-term.rules';
import { Term } from '../../adaptive-learning/models/common.model';
import { AdminFacade } from '../data-access/admin.facade';

const STATUS_TONES: Readonly<Record<TermStatus, 'success' | 'warning' | 'neutral' | 'danger'>> = {
  ACTIVE: 'success',
  UPCOMING: 'neutral',
  COMPLETED: 'warning',
  ARCHIVED: 'danger',
};

/**
 * Akademik dönem yönetimi (Sprint 9 §5).
 *
 * Durum SAKLANMAZ, takvimden türetilir: "aktif dönem" bugünü kapsayan
 * dönemdir. Tarihler çakışamadığı için aynı anda en fazla bir dönem aktif
 * olabilir — bunu ayrı bir bayrakla garanti etmeye çalışmak, iki kaydın birden
 * aktif işaretlenmesi riskini doğururdu (ADR-065).
 *
 * Doğrulama istemcide de sunucuda da AYNI saf fonksiyonla yapılır; form
 * "kaydedilebilir" derken sunucunun reddetmesi mümkün değildir.
 */
@Component({
  selector: 'app-term-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppDialogComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppFormFieldComponent,
    AppIconComponent,
    AppInputComponent,
    AppLoadingStateComponent,
    AppSelectComponent,
    AppStatusBadgeComponent,
    ExportMenuComponent,
    ReactiveFormsModule,
  ],
  templateUrl: './term-list.page.html',
  styleUrl: './term-list.page.scss',
})
export class TermListPage implements OnInit {
  protected readonly facade = inject(AdminFacade);
  private readonly dialog = inject(DialogService);

  private readonly editingState = signal<Term | null>(null);
  private readonly dialogOpenState = signal(false);
  private readonly nowState = signal(Date.now());

  readonly statusLabels = TERM_STATUS_LABELS;
  readonly semesterLabels = SEMESTER_LABELS;

  readonly terms = this.facade.terms;
  readonly saving = this.facade.saving;
  readonly error = this.facade.termsError;
  readonly isLoading = computed(
    () => this.facade.termsStatus() === 'loading' && this.facade.terms().length === 0,
  );
  readonly hasError = computed(() => this.facade.termsStatus() === 'error');
  readonly isEmpty = computed(
    () => this.facade.termsStatus() === 'success' && this.facade.terms().length === 0,
  );

  readonly isDialogOpen = this.dialogOpenState.asReadonly();
  readonly editing = this.editingState.asReadonly();
  readonly dialogTitle = computed(() =>
    this.editingState() ? 'Dönemi düzenle' : 'Yeni akademik dönem',
  );

  readonly semesterOptions = SEMESTERS.map((semester) => ({
    value: semester,
    label: SEMESTER_LABELS[semester],
  }));

  readonly activeTerm = computed(() =>
    this.terms().find((term) => this.statusOf(term) === 'ACTIVE') ?? null,
  );

  readonly form = new FormGroup({
    academicYear: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    semester: new FormControl<Semester>('FALL', { nonNullable: true }),
    startDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    endDate: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  /**
   * Form değerinin sinyal karşılığı.
   *
   * Reactive Forms sinyal DEĞİLDİR; `computed` içinde `getRawValue()` çağırmak
   * bağımlılık kurmaz ve doğrulama hiç tazelenmezdi (çakışma uyarısı yazarken
   * görünmüyordu). Değer bir sinyale kopyalanır, hesaplamalar onu okur.
   */
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /**
   * Kaydetmeden ÖNCE görülen ihlaller.
   *
   * Sunucuya gidip hata almak yerine aynı domain fonksiyonu formda çalıştırılır;
   * kullanıcı çakışmayı yazarken görür.
   */
  readonly violations = computed(() => {
    void this.formValue();
    const value = this.form.getRawValue();
    if (!value.academicYear || !value.startDate || !value.endDate) return [];

    return validateTerm(
      {
        id: this.editingState()?.id ?? null,
        academicYear: value.academicYear,
        semester: value.semester,
        startDate: value.startDate,
        endDate: value.endDate,
      },
      this.terms().map(toRecord),
      this.nowState(),
    );
  });

  readonly canSave = computed(() => {
    void this.formValue();
    return this.form.valid && this.violations().length === 0;
  });

  readonly exportTable = computed<ExportTable | null>(() => {
    const rows = this.terms();
    if (rows.length === 0) return null;

    return {
      fileName: 'akademik-donemler',
      columns: ['Dönem', 'Akademik yıl', 'Yarıyıl', 'Başlangıç', 'Bitiş', 'Durum'],
      rows: rows.map((term) => [
        term.name,
        term.academicYear,
        SEMESTER_LABELS[term.semester],
        term.startDate.slice(0, 10),
        term.endDate.slice(0, 10),
        TERM_STATUS_LABELS[this.statusOf(term)],
      ]),
    };
  });

  ngOnInit(): void {
    this.facade.loadTerms();
  }

  statusOf(term: Term): TermStatus {
    return termStatus(toRecord(term), this.nowState());
  }

  toneOf(term: Term): 'success' | 'warning' | 'neutral' | 'danger' {
    return STATUS_TONES[this.statusOf(term)];
  }

  canEdit(term: Term): boolean {
    return isEditable(toRecord(term), this.nowState());
  }

  openCreate(): void {
    this.editingState.set(null);
    this.form.reset({ academicYear: '', semester: 'FALL', startDate: '', endDate: '' });
    this.nowState.set(Date.now());
    this.dialogOpenState.set(true);
  }

  openEdit(term: Term): void {
    this.editingState.set(term);
    this.form.setValue({
      academicYear: term.academicYear,
      semester: term.semester,
      startDate: term.startDate.slice(0, 10),
      endDate: term.endDate.slice(0, 10),
    });
    this.nowState.set(Date.now());
    this.dialogOpenState.set(true);
  }

  close(): void {
    this.dialogOpenState.set(false);
    this.editingState.set(null);
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (!this.canSave()) return;

    const value = this.form.getRawValue();
    const editing = this.editingState();

    const request = editing
      ? this.facade.updateTerm(editing.id, value, editing.version)
      : this.facade.createTerm(value);

    request.subscribe({ next: () => this.close(), error: () => undefined });
  }

  async toggleArchive(term: Term): Promise<void> {
    if (!term.archivedAt) {
      const confirmed = await this.dialog.confirm({
        title: 'Dönem arşivlensin mi?',
        message: `“${term.name}” arşivlenecek. Bu döneme bağlı ders varsa işlem reddedilir.`,
        confirmLabel: 'Arşivle',
        tone: 'danger',
      });

      if (!confirmed) return;
    }

    this.facade.toggleTermArchive(term.id);
  }
}

function toRecord(term: Term): TermRecord {
  return {
    id: term.id,
    academicYear: term.academicYear,
    semester: term.semester,
    startDate: term.startDate,
    endDate: term.endDate,
    archivedAt: term.archivedAt,
  };
}
