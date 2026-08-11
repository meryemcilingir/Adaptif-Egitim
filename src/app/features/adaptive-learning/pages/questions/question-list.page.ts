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

import { createPageRequest } from '../../../../core/api/page-request';
import { PermissionService } from '../../../../core/auth/permission.service';
import { UiStore } from '../../../../core/state/ui.store';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { DialogService } from '../../../../shared/components/app-dialog/dialog.service';
import {
  AppDropdownComponent,
  DropdownItem,
} from '../../../../shared/components/app-dropdown/app-dropdown.component';
import { AppFilterBarComponent } from '../../../../shared/components/app-filter-bar/app-filter-bar.component';
import { FilterDefinition } from '../../../../shared/components/app-filter-bar/filter-definition';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { SelectOption } from '../../../../shared/components/app-select/app-select.component';
import { AppTableComponent } from '../../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../../shared/components/app-table/column-def';
import { toPlainText } from '../../../../shared/utils/rich-text.util';
import {
  COGNITIVE_LEVELS,
  COGNITIVE_LEVEL_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  PUBLISH_STATES,
  PUBLISH_STATE_LABELS,
  PublishState,
} from '../../models/common.model';
import { LearningOutcome } from '../../models/learning-outcome.model';
import {
  QUESTION_LIMITS,
  QUESTION_REVIEW_STATUSES,
  QUESTION_REVIEW_STATUS_LABELS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  Question,
  QuestionBulkAction,
} from '../../models/question.model';
import { availableActions } from '../../domain/publish-workflow';
import {
  canCreateNewVersion,
  canDecideReview,
  canResubmitForReview,
  canSubmitForReview,
} from '../../domain/question.rules';
import { QuestionBadgesComponent } from '../../components/question/question-badges.component';
import { QuestionPreviewDialogComponent } from '../../components/question/question-preview-dialog.component';
import { CourseRepository, OutcomeRepository } from '../../data-access/catalog.repository';
import { QuestionFacade } from '../../data-access/question.facade';

/**
 * Kolon görünürlüğü menüsündeki anahtarlanabilir kolonlar.
 *
 * `hideBelow`, kolon tanımındakiyle AYNI eşiktir: tablo dar ekranda o kolonu
 * zaten gizler. Menüde bunu söylemezsek kullanıcı kolonu açar, ekranda hiçbir
 * şey değişmez ve menü bozuk sanılır.
 */
const TOGGLEABLE_COLUMNS = [
  { key: 'badges', label: 'Rozetler', hideBelow: null },
  { key: 'outcome', label: 'Kazanım', hideBelow: 'laptop' },
  { key: 'points', label: 'Puan', hideBelow: 'tablet' },
  { key: 'estimatedSolveTimeSeconds', label: 'Süre', hideBelow: 'tablet' },
  { key: 'usageCount', label: 'Kullanım', hideBelow: 'laptop' },
  { key: 'updatedAt', label: 'Güncelleme', hideBelow: 'laptop' },
] as const;

/**
 * Soru bankası listesi.
 *
 * Binlerce kayıt varsayımıyla kurulmuştur: filtreleme, arama, sıralama ve
 * sayfalama **sunucuda** yapılır; istemci yalnızca görünen sayfayı tutar.
 * Kolon görünürlüğü kullanıcı tercihidir ve sorguyu etkilemez.
 */
@Component({
  selector: 'app-question-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDropdownComponent,
    AppFilterBarComponent,
    AppIconComponent,
    AppTableComponent,
    QuestionBadgesComponent,
    QuestionPreviewDialogComponent,
  ],
  templateUrl: './question-list.page.html',
  styleUrl: './question-list.page.scss',
})
export class QuestionListPage implements OnInit {
  protected readonly facade = inject(QuestionFacade);
  private readonly courses = inject(CourseRepository);
  private readonly outcomes = inject(OutcomeRepository);
  private readonly dialogs = inject(DialogService);
  private readonly permissions = inject(PermissionService);
  private readonly ui = inject(UiStore);
  private readonly router = inject(Router);

  /** Route'tan gelen ders filtresi. */
  readonly courseId = input<string | null>(null);
  /** Panodaki durum sayaçlarından gelen filtre (ör. ?state=DRAFT). */
  readonly state = input<string | null>(null);
  /** Panodaki "Favorilerim" sayacından gelen filtre (ör. ?favoriteOnly=true). */
  readonly favoriteOnly = input<string | null>(null);

  private readonly selectCell =
    viewChild.required<TemplateRef<{ $implicit: Question }>>('selectCell');
  private readonly titleCell =
    viewChild.required<TemplateRef<{ $implicit: Question }>>('titleCell');
  private readonly badgesCell =
    viewChild.required<TemplateRef<{ $implicit: Question }>>('badgesCell');
  private readonly outcomeCell =
    viewChild.required<TemplateRef<{ $implicit: Question }>>('outcomeCell');
  private readonly favoriteCell =
    viewChild.required<TemplateRef<{ $implicit: Question }>>('favoriteCell');
  private readonly actionsCell =
    viewChild.required<TemplateRef<{ $implicit: Question }>>('actionsCell');

  private readonly courseOptionsState = signal<readonly SelectOption[]>([]);
  private readonly outcomeListState = signal<readonly LearningOutcome[]>([]);
  private readonly previewState = signal<Question | null>(null);
  private readonly hiddenColumnsState = signal<ReadonlySet<string>>(new Set());
  private readonly activeCourseId = signal<string | null>(null);

  readonly courseOptions = this.courseOptionsState.asReadonly();
  readonly preview = this.previewState.asReadonly();
  readonly canWrite = computed(() => this.permissions.can('question:write'));
  /** İnceleme kararı verebilen (onay/revizyon/red/yayın) tek rol Ölçme Uzmanı'dır. */
  readonly canReview = computed(() => this.permissions.can('question:publish'));

  /*
   * Aynı ekran iki rol için farklı iş görür: Ölçme Uzmanı için "Soru bankası"
   * (tüm derslerin incelemesi), Eğitmen için "Sorularım" (yalnızca kendi
   * derslerinin soruları — veri kapsamı zaten `course`). Ayrı bir sayfa/route
   * açmak yerine BAŞLIK role göre değişir; liste/filtre/tablo altyapısı ortaktır.
   */
  readonly pageTitle = computed(() => (this.canReview() ? 'Soru bankası' : 'Sorularım'));
  readonly pageDescription = computed(() =>
    this.canReview()
      ? 'İncelemeye gönderilen soruları değerlendirin; onaylayın, revizyon isteyin veya yayına alın.'
      : 'Derslerinizin sorularını yazın, incelemeye gönderin ve ölçme uzmanının yorumlarını görün.',
  );

  /*
   * Soru bankası DERS DERS açılır (kartlı seçim), tıklanan dersin sorularını
   * mevcut tablo görünümünde gösterir.
   *
   * Bir durum/favori filtresiyle (panodaki sayaçlardan) veya doğrudan bir
   * derse gelindiyse kart ızgarası atlanıp doğrudan filtrelenmiş listeye
   * gidilir — kullanıcı "Yayında" sayacına tıkladığında önce ders seçmesi
   * istenmemeli.
   */
  readonly showCourseGrid = computed(
    () => this.activeCourseId() === null && !this.facade.isFiltered(),
  );

  readonly selectedCourseLabel = computed(
    () => this.courseOptionsState().find((option) => option.value === this.activeCourseId())?.label ?? null,
  );

  readonly toggleableColumns = TOGGLEABLE_COLUMNS;

  private readonly outcomeById = computed(
    () => new Map(this.outcomeListState().map((outcome) => [outcome.id, outcome] as const)),
  );

  readonly tagPool = computed(() =>
    [...new Set(this.facade.items().flatMap((question) => question.tags))].sort((a, b) =>
      a.localeCompare(b, 'tr-TR'),
    ),
  );

  /* ── Kolonlar ────────────────────────────────────────────────────────── */

  readonly columnMenu = computed<readonly DropdownItem[]>(() => {
    const breakpoint = this.ui.breakpoint();

    return TOGGLEABLE_COLUMNS.map((column) => {
      const visible = !this.hiddenColumnsState().has(column.key);
      const suppressed =
        column.hideBelow === 'laptop'
          ? breakpoint !== 'laptop' && breakpoint !== 'desktop'
          : column.hideBelow === 'tablet' && breakpoint === 'mobile';

      return {
        id: `col:${column.key}`,
        label: column.label,
        checked: visible,
        hint: visible && suppressed ? 'Ekran dar olduğu için şu an gizli' : undefined,
      };
    });
  });

  readonly columns = computed<readonly ColumnDef<Question>[]>(() => {
    const hidden = this.hiddenColumnsState();
    const all: (ColumnDef<Question> & { toggleKey?: string })[] = [];

    if (this.canWrite()) {
      all.push({ key: 'select', header: '', width: '44px', cell: this.selectCell() });
    }

    all.push(
      { key: 'favorite', header: '', width: '44px', cell: this.favoriteCell() },
      { key: 'title', header: 'Soru', sortable: true, cell: this.titleCell() },
      {
        key: 'badges',
        header: 'Etiketler',
        width: '260px',
        cell: this.badgesCell(),
        toggleKey: 'badges',
      },
      {
        key: 'outcome',
        header: 'Kazanım',
        width: '150px',
        hideBelow: 'laptop',
        cell: this.outcomeCell(),
        toggleKey: 'outcome',
      },
      {
        key: 'points',
        header: 'Puan',
        sortable: true,
        align: 'end',
        numeric: true,
        width: '80px',
        hideBelow: 'tablet',
        value: (row) => row.points,
        toggleKey: 'points',
      },
      {
        key: 'estimatedSolveTimeSeconds',
        header: 'Süre',
        sortable: true,
        align: 'end',
        numeric: true,
        width: '90px',
        hideBelow: 'tablet',
        value: (row) => `${Math.round(row.estimatedSolveTimeSeconds / 60)} dk`,
        toggleKey: 'estimatedSolveTimeSeconds',
      },
      {
        key: 'usageCount',
        header: 'Kullanım',
        sortable: true,
        align: 'end',
        numeric: true,
        width: '100px',
        hideBelow: 'laptop',
        value: (row) => row.usageCount,
        toggleKey: 'usageCount',
      },
      {
        key: 'updatedAt',
        header: 'Güncelleme',
        sortable: true,
        width: '130px',
        hideBelow: 'laptop',
        value: (row) => new Date(row.updatedAt).toLocaleDateString('tr-TR'),
        toggleKey: 'updatedAt',
      },
      { key: 'actions', header: '', align: 'end', width: '60px', cell: this.actionsCell() },
    );

    return all.filter((column) => !column.toggleKey || !hidden.has(column.toggleKey));
  });

  readonly filters = computed<readonly FilterDefinition[]>(() => [
    {
      key: 'state',
      label: 'Durum',
      kind: 'multi',
      options: PUBLISH_STATES.map((state) => ({
        value: state,
        label: PUBLISH_STATE_LABELS[state],
      })),
    },
    {
      key: 'reviewStatus',
      label: 'İnceleme durumu',
      kind: 'multi',
      options: QUESTION_REVIEW_STATUSES.filter((status) => status !== 'NONE').map((status) => ({
        value: status,
        label: QUESTION_REVIEW_STATUS_LABELS[status],
      })),
    },
    {
      key: 'type',
      label: 'Tür',
      kind: 'multi',
      options: QUESTION_TYPES.map((value) => ({ value, label: QUESTION_TYPE_LABELS[value] })),
    },
    {
      key: 'difficulty',
      label: 'Zorluk',
      kind: 'multi',
      options: DIFFICULTIES.map((value) => ({ value, label: DIFFICULTY_LABELS[value] })),
    },
    {
      key: 'level',
      label: 'Bloom seviyesi',
      kind: 'multi',
      options: COGNITIVE_LEVELS.map((value) => ({ value, label: COGNITIVE_LEVEL_LABELS[value] })),
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
      key: 'tags',
      label: 'Etiket',
      kind: 'multi',
      options: this.tagPool().map((tag) => ({ value: tag, label: tag })),
    },
    {
      key: 'favoriteOnly',
      label: 'Yalnızca favorilerim',
      kind: 'boolean',
    },
    {
      key: 'flaggedOnly',
      label: 'İnceleme bayrağı olanlar',
      kind: 'boolean',
    },
  ]);

  ngOnInit(): void {
    this.loadReferences();

    const courseId = this.courseId();
    const state = this.state();

    if (courseId) {
      this.selectCourse(courseId);
    } else if (state) {
      this.facade.setFilter('state', [state]);
    } else if (this.favoriteOnly()) {
      this.facade.setFilter('favoriteOnly', 'true');
    }
  }

  /* ── Ders seçimi (kartlı görünüm) ──────────────────────────────────────── */

  selectCourse(courseId: string): void {
    this.activeCourseId.set(courseId);
    this.facade.setFilter('courseId', courseId);
  }

  backToCourses(): void {
    this.activeCourseId.set(null);
    this.facade.clearFilters();
  }

  /* ── Görünüm yardımcıları ────────────────────────────────────────────── */

  plainStem(html: string): string {
    return toPlainText(html).slice(0, 120);
  }

  outcomeCode(question: Question): string {
    const first = question.outcomeIds[0];
    return first ? (this.outcomeById().get(first)?.code ?? '—') : '—';
  }

  isFavorite(question: Question): boolean {
    return this.facade.isFavoriteFor(question);
  }

  onColumnToggle(item: DropdownItem): void {
    const key = item.id.replace('col:', '');
    this.hiddenColumnsState.update((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  /* ── Satır işlemleri ─────────────────────────────────────────────────── */

  rowActions(question: Question): readonly DropdownItem[] {
    const items: DropdownItem[] = [
      { id: 'preview', label: 'Önizle', icon: 'eye' },
      { id: 'detail', label: 'Detayı aç', icon: 'external-link' },
    ];

    if (this.canWrite()) {
      items.push(
        {
          id: 'edit',
          label: 'Düzenle',
          icon: 'square-pen',
          disabled: question.state === 'PUBLISHED' || question.state === 'ARCHIVED',
        },
        { id: 'duplicate', label: 'Kopyala', icon: 'copy' },
      );

      if (canCreateNewVersion(question.state)) {
        items.push({ id: 'version', label: 'Yeni versiyon oluştur', icon: 'history' });
      }

      /*
       * "İncelemeye gönder"/"Yeniden gönder" yazarın (eğitmen dâhil) işidir —
       * bilerek `question:publish` isteyen genel geçiş uç noktasına DEĞİL,
       * `question:write` isteyen özel uç noktalara bağlıdır (bkz. handler).
       */
      if (canSubmitForReview(question.state)) {
        items.push({
          id: 'submit-review',
          label: 'İncelemeye gönder',
          icon: 'arrow-right',
          separatorBefore: true,
        });
      }
      if (canResubmitForReview(question.state, question.reviewStatus)) {
        items.push({
          id: 'resubmit-review',
          label: 'Yeniden incelemeye gönder',
          icon: 'arrow-right',
          separatorBefore: true,
        });
      }

      items.push({
        id: 'delete',
        label: 'Sil',
        icon: 'trash-2',
        tone: 'danger',
        separatorBefore: true,
        disabled: question.state === 'PUBLISHED',
      });
    }

    /*
     * Onay/revizyon/red/yayın/arşiv gibi karar niteliğindeki eylemler yalnızca
     * `question:publish` sahibi Ölçme Uzmanı'na gösterilir — eğitmen bu
     * butonları hiç GÖRMEZ (yalnızca gizlenmiş olmakla kalmaz, aynı zamanda
     * sunucu da bu izni ister).
     */
    if (this.canReview()) {
      if (canDecideReview(question.state, question.reviewStatus)) {
        items.push(
          { id: 'approve', label: 'Onayla', icon: 'circle-check-big', separatorBefore: true },
          { id: 'request-revision', label: 'Revizyon iste', icon: 'circle-alert' },
          { id: 'reject', label: 'Reddet', icon: 'x', tone: 'danger' },
        );
      }

      for (const action of availableActions(question.state)) {
        items.push({ id: `state:${action.target}`, label: action.label, icon: action.icon });
      }
    }

    return items;
  }

  onRowAction(question: Question, item: DropdownItem): void {
    switch (item.id) {
      case 'preview':
        return this.previewState.set(question);
      case 'detail':
        return this.openDetail(question);
      case 'edit':
        return this.openEditor(question);
      case 'duplicate':
        return void this.facade.duplicate(question).subscribe({ error: () => undefined });
      case 'version':
        return void this.askNewVersion(question);
      case 'delete':
        return void this.confirmDelete(question);
      case 'submit-review':
        return void this.askReviewAction('submit', question);
      case 'resubmit-review':
        return void this.askReviewAction('resubmit', question);
      case 'approve':
        return void this.askReviewAction('approve', question);
      case 'request-revision':
        return void this.askReviewAction('request-revision', question);
      case 'reject':
        return void this.askReviewAction('reject', question);
      default:
        if (item.id.startsWith('state:')) {
          void this.runTransition(question, item.id.slice('state:'.length) as PublishState);
        }
    }
  }

  /** İnceleme akışı eylemleri — yalnızca revizyon/red için gerekçe zorunludur. */
  private async askReviewAction(
    kind: 'submit' | 'resubmit' | 'approve' | 'request-revision' | 'reject',
    question: Question,
  ): Promise<void> {
    const config: Readonly<
      Record<
        typeof kind,
        { title: string; message: string; confirmLabel: string; requireReason: boolean }
      >
    > = {
      submit: {
        title: 'İncelemeye gönder',
        message: `"${question.title}" ölçme uzmanının incelemesine sunulacak. Onaylanana kadar düzenlenemez.`,
        confirmLabel: 'İncelemeye gönder',
        requireReason: false,
      },
      resubmit: {
        title: 'Yeniden incelemeye gönder',
        message: `"${question.title}" düzeltmelerle birlikte tekrar incelemeye sunulacak.`,
        confirmLabel: 'Yeniden gönder',
        requireReason: false,
      },
      approve: {
        title: 'Soruyu onayla',
        message: `"${question.title}" onaylanacak ve yayına hazır hâle gelecek.`,
        confirmLabel: 'Onayla',
        requireReason: false,
      },
      'request-revision': {
        title: 'Revizyon iste',
        message: `"${question.title}" eğitmene geri gönderilecek. Ne düzeltilmesi gerektiğini açıklayın.`,
        confirmLabel: 'Revizyon iste',
        requireReason: true,
      },
      reject: {
        title: 'Soruyu reddet',
        message: `"${question.title}" reddedilecek. Eğitmen gerekçeyi görüp yeniden gönderebilir.`,
        confirmLabel: 'Reddet',
        requireReason: true,
      },
    };

    const { title, message, confirmLabel, requireReason } = config[kind];

    const result = await this.dialogs.ask({
      title,
      message,
      confirmLabel,
      tone: kind === 'reject' ? 'danger' : kind === 'request-revision' ? 'warning' : 'primary',
      requireReason,
      reasonLabel: requireReason ? 'Gerekçe' : 'Not (opsiyonel)',
      reasonHint: requireReason
        ? `Bu açıklama eğitmene gösterilir. En az ${QUESTION_LIMITS.commentMessage.min} karakter girin.`
        : undefined,
      minReasonLength: requireReason ? QUESTION_LIMITS.commentMessage.min : undefined,
      maxReasonLength: QUESTION_LIMITS.commentMessage.max,
    });

    if (!result.confirmed) return;

    const message$ = result.reason;
    const request$ =
      kind === 'submit'
        ? this.facade.submitForReview(question, message$)
        : kind === 'resubmit'
          ? this.facade.resubmitForReview(question, message$)
          : kind === 'approve'
            ? this.facade.approve(question, message$)
            : kind === 'request-revision'
              ? this.facade.requestRevision(question, message$)
              : this.facade.reject(question, message$);

    request$.subscribe({ error: () => undefined });
  }

  openDetail(question: Question): void {
    void this.router.navigate(['/questions', question.id]);
  }

  openEditor(question: Question | null): void {
    void this.router.navigate(question ? ['/questions', question.id, 'edit'] : ['/questions/new']);
  }

  closePreview(): void {
    this.previewState.set(null);
  }

  toggleFavorite(question: Question): void {
    this.facade
      .toggleFavorite(question, !this.isFavorite(question))
      .subscribe({ error: () => undefined });
  }

  /* ── Toplu işlemler ──────────────────────────────────────────────────── */

  readonly bulkActions: readonly DropdownItem[] = [
    { id: 'publish', label: 'Yayına al', icon: 'circle-check-big' },
    { id: 'archive', label: 'Arşivle', icon: 'archive' },
    { id: 'restore', label: 'Taslağa al', icon: 'rotate-ccw' },
    { id: 'export', label: 'Dışa aktar', icon: 'download', separatorBefore: true },
    { id: 'delete', label: 'Sil', icon: 'trash-2', tone: 'danger', separatorBefore: true },
  ];

  async onBulkAction(item: DropdownItem): Promise<void> {
    if (item.id === 'export') return this.facade.exportSelected();

    const action = item.id as QuestionBulkAction;
    const count = this.facade.selectedCount();

    const confirmed = await this.dialogs.confirm({
      title: `${item.label} · ${count} soru`,
      message:
        action === 'delete'
          ? `Seçili ${count} soru silinecek. Kayıtlar korunur ancak listelerden kaldırılır.`
          : `Seçili ${count} soru için "${item.label}" işlemi uygulanacak. Uygun olmayanlar atlanır.`,
      confirmLabel: item.label,
      tone: action === 'delete' ? 'danger' : 'primary',
    });

    if (confirmed) this.facade.runBulk(action).subscribe({ error: () => undefined });
  }

  /* ── İçe aktarma (mock) ──────────────────────────────────────────────── */

  async openImport(): Promise<void> {
    await this.dialogs.confirm({
      title: 'İçe aktarma',
      message:
        'İçe aktarma sözleşmesi hazır; dosya yükleme akışı sınav modülüyle birlikte açılacak. Şimdilik örnek satırlarla önizleme yapılır.',
      confirmLabel: 'Örnek önizlemeyi çalıştır',
      tone: 'primary',
    });
  }

  private async askNewVersion(question: Question): Promise<void> {
    const result = await this.dialogs.ask({
      title: 'Yeni versiyon oluştur',
      message: `"${question.title}" yayından çıkarılmadan yeni bir taslak versiyona alınır. Mevcut sürüm sınav geçmişi için korunur.`,
      confirmLabel: 'Versiyon oluştur',
      tone: 'primary',
      requireReason: true,
      reasonLabel: 'Değişiklik notu',
      reasonHint: `Bu not versiyon geçmişinde görünür. En az 10, en fazla ${QUESTION_LIMITS.changeNote.max} karakter.`,
      maxReasonLength: QUESTION_LIMITS.changeNote.max,
    });

    if (result.confirmed) {
      this.facade.createVersion(question, result.reason).subscribe({
        next: (updated) => this.openEditor(updated),
        error: () => undefined,
      });
    }
  }

  private async confirmDelete(question: Question): Promise<void> {
    const confirmed = await this.dialogs.confirm({
      title: 'Soruyu sil',
      message: `"${question.code} · ${question.title}" listelerden kaldırılacak. Kayıt korunur ve gerekirse geri alınabilir.`,
      confirmLabel: 'Sil',
      tone: 'danger',
    });

    if (confirmed) this.facade.softDelete(question).subscribe({ error: () => undefined });
  }

  private async runTransition(question: Question, state: PublishState): Promise<void> {
    const action = availableActions(question.state).find((item) => item.target === state);
    if (!action) return;

    if (!action.requiresConfirmation) {
      this.facade.transition(question, state).subscribe({ error: () => undefined });
      return;
    }

    const result = await this.dialogs.ask({
      title: action.label,
      message: `"${question.title}" — ${action.description}`,
      confirmLabel: action.label,
      tone: action.tone === 'warning' ? 'warning' : 'primary',
      requireReason: true,
      reasonLabel: 'Gerekçe',
      reasonHint: 'Bu açıklama denetim kaydına yazılır. En az 10 karakter girin.',
    });

    if (result.confirmed) {
      this.facade.transition(question, state, result.reason).subscribe({ error: () => undefined });
    }
  }

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
