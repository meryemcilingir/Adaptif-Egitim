import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  TemplateRef,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { ApiError } from '../../../../core/api/api-error';
import { createPageRequest } from '../../../../core/api/page-request';
import { PermissionService } from '../../../../core/auth/permission.service';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import {
  AppDropdownComponent,
  DropdownItem,
} from '../../../../shared/components/app-dropdown/app-dropdown.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppFilterBarComponent } from '../../../../shared/components/app-filter-bar/app-filter-bar.component';
import { FilterDefinition } from '../../../../shared/components/app-filter-bar/filter-definition';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppPaginationComponent } from '../../../../shared/components/app-pagination/app-pagination.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../../shared/components/app-table/column-def';
import { SelectOption } from '../../../../shared/components/app-select/app-select.component';
import { AppIconName } from '../../../../shared/icons/app-icons';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import {
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  PUBLISH_STATES,
  PUBLISH_STATE_LABELS,
  PublishState,
} from '../../models/common.model';
import {
  CONTENT_TYPES,
  CONTENT_TYPE_ICONS,
  CONTENT_TYPE_LABELS,
  ContentBulkAction,
  ContentCreateRequest,
  ContentItem,
} from '../../models/content-item.model';
import { LearningOutcome } from '../../models/learning-outcome.model';
import { availableActions } from '../../domain/publish-workflow';
import { CourseRepository, OutcomeRepository } from '../../data-access/catalog.repository';
import { ContentFacade, ContentViewMode } from '../../data-access/content.facade';
import { ContentFormComponent } from './content-form.component';
import { ContentPreviewComponent } from './content-preview.component';

/**
 * İçerik listesi.
 *
 * İki görünüm sunar: kart (grid) ve tablo (list). Veri kaynağı, filtreler ve
 * sayfalama İKİSİNDE DE aynıdır — görünüm yalnızca sunum tercihidir.
 * Hızlı önizleme, içeriği açmadan kararı hızlandırır; toplu işlemler seçili
 * kayıtlara uygulanır ve kısmi başarı gerekçesiyle raporlanır.
 */
@Component({
  selector: 'app-content-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDropdownComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppFilterBarComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    AppPaginationComponent,
    AppStatusBadgeComponent,
    AppTableComponent,
    ContentFormComponent,
    ContentPreviewComponent,
    NgTemplateOutlet,
  ],
  templateUrl: './content-list.page.html',
  styleUrl: './content-list.page.scss',
})
export class ContentListPage implements OnInit {
  protected readonly facade = inject(ContentFacade);
  private readonly courses = inject(CourseRepository);
  private readonly outcomes = inject(OutcomeRepository);
  private readonly dialogs = inject(DialogService);
  private readonly permissions = inject(PermissionService);
  private readonly router = inject(Router);

  /** Route'tan gelen ders filtresi (ders detayından "içerikleri yönet" ile). */
  readonly courseId = input<string | null>(null);

  private readonly titleCell =
    viewChild.required<TemplateRef<{ $implicit: ContentItem }>>('titleCell');
  private readonly typeCell =
    viewChild.required<TemplateRef<{ $implicit: ContentItem }>>('typeCell');
  private readonly outcomeCell =
    viewChild.required<TemplateRef<{ $implicit: ContentItem }>>('outcomeCell');
  private readonly stateCell =
    viewChild.required<TemplateRef<{ $implicit: ContentItem }>>('stateCell');
  private readonly actionsCell =
    viewChild.required<TemplateRef<{ $implicit: ContentItem }>>('actionsCell');
  private readonly selectCell =
    viewChild.required<TemplateRef<{ $implicit: ContentItem }>>('selectCell');

  private readonly courseOptionsState = signal<readonly SelectOption[]>([]);
  private readonly outcomeListState = signal<readonly LearningOutcome[]>([]);
  private readonly formOpenState = signal(false);
  private readonly editingState = signal<ContentItem | null>(null);
  private readonly previewState = signal<ContentItem | null>(null);

  readonly courseOptions = this.courseOptionsState.asReadonly();
  readonly outcomeList = this.outcomeListState.asReadonly();
  readonly isFormOpen = this.formOpenState.asReadonly();
  readonly editing = this.editingState.asReadonly();
  readonly preview = this.previewState.asReadonly();

  readonly canWrite = computed(() => this.permissions.can('content:write'));
  readonly canCreate = computed(() => this.canWrite() && this.courseOptionsState().length > 0);

  readonly isLoading = computed(() => this.facade.status() === 'loading');
  readonly hasError = computed(() => this.facade.status() === 'error');
  readonly isGrid = computed(() => this.facade.viewMode() === 'grid');

  /*
   * İçerik düzenleme yetkisi olmayan (öğrenci) görünümünde kartlar dersine
   * göre GRUPLANIR.
   *
   * Yazma yetkisi olan roller (eğitmen vb.) toplu işlem ve düzenleme için
   * tek akışta filtrelenebilir bir liste ister; öğrenci içinse ders ders
   * ayrılmış, düzenli bir kütüphane görünümü daha anlaşılırdır.
   */
  readonly showGrouped = computed(() => this.isGrid() && !this.canWrite());

  readonly groupedContent = computed(() => {
    const groups = new Map<string, { courseId: string; courseLabel: string; items: ContentItem[] }>();

    for (const item of this.facade.items()) {
      const existing = groups.get(item.courseId);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(item.courseId, {
          courseId: item.courseId,
          courseLabel: this.courseLabel(item.courseId) || 'Diğer',
          items: [item],
        });
      }
    }

    return [...groups.values()].sort((a, b) => a.courseLabel.localeCompare(b.courseLabel, 'tr-TR'));
  });

  private readonly courseNameById = computed(
    () => new Map(this.courseOptionsState().map((option) => [option.value, option.label] as const)),
  );
  private readonly outcomeCodeById = computed(
    () => new Map(this.outcomeListState().map((outcome) => [outcome.id, outcome.code] as const)),
  );

  readonly tagPool = computed(() =>
    [...new Set(this.facade.items().flatMap((content) => content.tags))].sort((a, b) =>
      a.localeCompare(b, 'tr-TR'),
    ),
  );

  readonly filters = computed<readonly FilterDefinition[]>(() => [
    /*
     * "Durum" filtresi yalnızca içerik yazma yetkisi olanlara gösterilir.
     *
     * Öğrenci (ve diğer salt-okunur roller) zaten yalnızca YAYINDAKİ içeriği
     * görür (BR-31, `isContentVisible()`) — Taslak/İncelemede/Arşiv seçenekleri
     * onlar için hep boş sonuç döner ve var olmayan bir şeyi filtreleyebiliyor
     * izlenimi verir.
     */
    ...(this.canWrite()
      ? [
          {
            key: 'state',
            label: 'Durum',
            kind: 'multi' as const,
            options: PUBLISH_STATES.map((state) => ({
              value: state,
              label: PUBLISH_STATE_LABELS[state],
            })),
          },
        ]
      : []),
    {
      key: 'type',
      label: 'Tür',
      kind: 'multi',
      options: CONTENT_TYPES.map((value) => ({ value, label: CONTENT_TYPE_LABELS[value] })),
    },
    {
      key: 'courseId',
      label: 'Ders',
      kind: 'single',
      options: this.courseOptionsState().map((option) => ({
        value: option.value,
        label: option.label,
      })),
    },
    {
      key: 'outcomeId',
      label: 'Kazanım',
      kind: 'single',
      options: this.outcomeListState().map((outcome) => ({
        value: outcome.id,
        label: `${outcome.code} · ${outcome.title}`,
      })),
    },
    {
      key: 'difficulty',
      label: 'Zorluk',
      kind: 'multi',
      options: DIFFICULTIES.map((value) => ({ value, label: DIFFICULTY_LABELS[value] })),
    },
    {
      key: 'tags',
      label: 'Etiket',
      kind: 'multi',
      options: this.tagPool().map((tag) => ({ value: tag, label: tag })),
    },
  ]);

  readonly columns = computed<readonly ColumnDef<ContentItem>[]>(() => {
    const columns: ColumnDef<ContentItem>[] = [];

    if (this.canWrite()) {
      columns.push({ key: 'select', header: '', width: '48px', cell: this.selectCell() });
    }

    columns.push(
      { key: 'title', header: 'İçerik', sortable: true, cell: this.titleCell() },
      { key: 'type', header: 'Tür', sortable: true, width: '150px', cell: this.typeCell() },
      {
        key: 'outcomeId',
        header: 'Kazanım',
        width: '190px',
        hideBelow: 'laptop',
        cell: this.outcomeCell(),
      },
      {
        key: 'estimatedDurationMinutes',
        header: 'Süre',
        sortable: true,
        align: 'end',
        numeric: true,
        width: '90px',
        hideBelow: 'tablet',
        value: (row) => `${row.estimatedDurationMinutes} dk`,
      },
      { key: 'state', header: 'Durum', sortable: true, width: '150px', cell: this.stateCell() },
      { key: 'actions', header: '', align: 'end', width: '60px', cell: this.actionsCell() },
    );

    return columns;
  });

  ngOnInit(): void {
    const courseId = this.courseId();
    if (courseId) this.facade.setFilter('courseId', courseId);
    else this.facade.load();

    this.loadReferences();
  }

  /* ── Görünüm ─────────────────────────────────────────────────────────── */

  setViewMode(mode: ContentViewMode): void {
    this.facade.setViewMode(mode);
  }

  /* ── Etiket çözümleyiciler (şablon hücreleri tipsizdir) ──────────────── */

  typeLabel(value: string): string {
    return CONTENT_TYPE_LABELS[value as keyof typeof CONTENT_TYPE_LABELS] ?? value;
  }

  typeIcon(value: string): AppIconName {
    return (CONTENT_TYPE_ICONS[value as keyof typeof CONTENT_TYPE_ICONS] ??
      'file-text') as AppIconName;
  }

  difficultyLabel(value: string): string {
    return DIFFICULTY_LABELS[value as keyof typeof DIFFICULTY_LABELS] ?? value;
  }

  outcomeCode(id: string): string {
    return this.outcomeCodeById().get(id) ?? '—';
  }

  courseLabel(id: string): string {
    return this.courseNameById().get(id) ?? '';
  }

  toneFor(state: string) {
    return statusPresentation(state);
  }

  /* ── Satır/kart işlemleri ────────────────────────────────────────────── */

  rowActions(content: ContentItem): readonly DropdownItem[] {
    const items: DropdownItem[] = [
      { id: 'preview', label: 'Hızlı önizleme', icon: 'eye' },
      { id: 'detail', label: 'Detayı aç', icon: 'external-link' },
    ];

    if (this.canWrite()) {
      items.push({
        id: 'edit',
        label: 'Düzenle',
        icon: 'pencil-line',
        disabled: content.state === 'PUBLISHED' || content.state === 'ARCHIVED',
      });

      for (const action of availableActions(content.state)) {
        items.push({ id: `state:${action.target}`, label: action.label, icon: action.icon });
      }

      items.push({
        id: 'delete',
        label: 'Sil',
        icon: 'trash-2',
        tone: 'danger',
        separatorBefore: true,
        disabled: content.state !== 'DRAFT',
      });
    }

    return items;
  }

  onRowAction(content: ContentItem, item: DropdownItem): void {
    if (item.id === 'preview') return this.openPreview(content);
    if (item.id === 'detail') return this.openDetail(content);
    if (item.id === 'edit') return this.openForm(content);
    if (item.id === 'delete') return void this.confirmDelete(content);
    if (item.id.startsWith('state:')) {
      void this.runTransition(content, item.id.slice('state:'.length) as PublishState);
    }
  }

  openDetail(content: ContentItem): void {
    void this.router.navigate(['/contents', content.id]);
  }

  openPreview(content: ContentItem): void {
    this.previewState.set(content);
  }

  closePreview(): void {
    this.previewState.set(null);
  }

  /* ── Form ────────────────────────────────────────────────────────────── */

  openForm(content: ContentItem | null): void {
    this.editingState.set(content);
    this.formOpenState.set(true);
  }

  closeForm(): void {
    this.formOpenState.set(false);
    this.editingState.set(null);
  }

  onSave(payload: ContentCreateRequest, form: ContentFormComponent): void {
    const editing = this.editingState();
    const request = editing ? this.facade.update(editing, payload) : this.facade.create(payload);

    request.subscribe({
      next: () => {
        this.closeForm();
        this.facade.load();
      },
      error: (error: ApiError) => form.applyServerErrors(error),
    });
  }

  currentCourseFilter(): string | null {
    const value = this.facade.query().filters['courseId'];
    return typeof value === 'string' ? value : null;
  }

  /* ── Toplu işlemler ──────────────────────────────────────────────────── */

  readonly bulkActions: readonly DropdownItem[] = [
    { id: 'publish', label: 'Yayına al', icon: 'book-open-check' },
    { id: 'draft', label: 'Taslağa al', icon: 'rotate-ccw' },
    { id: 'archive', label: 'Arşivle', icon: 'archive' },
    { id: 'delete', label: 'Sil', icon: 'trash-2', tone: 'danger', separatorBefore: true },
  ];

  async onBulkAction(item: DropdownItem): Promise<void> {
    const action = item.id as ContentBulkAction;
    const count = this.facade.selectedCount();

    const confirmed = await this.dialogs.confirm({
      title: `${item.label} · ${count} içerik`,
      message:
        action === 'delete'
          ? `Seçili ${count} içerik kalıcı olarak silinecek. Bu işlem geri alınamaz.`
          : `Seçili ${count} içerik için "${item.label}" işlemi uygulanacak. Uygun olmayan kayıtlar atlanır.`,
      confirmLabel: item.label,
      tone: action === 'delete' ? 'danger' : 'primary',
    });

    if (confirmed) this.facade.runBulk(action).subscribe({ error: () => undefined });
  }

  private async confirmDelete(content: ContentItem): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'İçeriği sil',
      message: `"${content.title}" kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (confirmed) this.facade.remove(content).subscribe({ error: () => undefined });
  }

  private async runTransition(content: ContentItem, state: PublishState): Promise<void> {
    const action = availableActions(content.state).find((item) => item.target === state);
    if (!action) return;

    if (!action.requiresConfirmation) {
      this.facade.transition(content, state).subscribe({ error: () => undefined });
      return;
    }

    const result = await this.dialogs.ask({
      title: action.label,
      message: `"${content.title}" — ${action.description}`,
      confirmLabel: action.label,
      tone: action.tone === 'warning' ? 'warning' : 'primary',
      requireReason: true,
      reasonLabel: 'Gerekçe',
      reasonHint: 'Bu açıklama denetim kaydına yazılır. En az 10 karakter girin.',
    });

    if (result.confirmed) {
      this.facade.transition(content, state, result.reason).subscribe({ error: () => undefined });
    }
  }

  /** Form ve filtre listeleri için dersler ve kazanımlar. */
  private loadReferences(): void {
    forkJoin({
      courses: this.courses.list(createPageRequest({ size: 200 })),
      outcomes: this.outcomes.list(createPageRequest({ size: 500 })),
    }).subscribe({
      next: ({ courses, outcomes }) => {
        this.courseOptionsState.set(
          courses.items.map((course) => ({
            value: course.id,
            label: `${course.code} · ${course.name}`,
          })),
        );
        this.outcomeListState.set(outcomes.items);
      },
    });
  }
}
