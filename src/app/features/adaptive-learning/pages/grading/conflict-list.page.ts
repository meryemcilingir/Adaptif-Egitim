import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  TemplateRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';

import { AppFilterBarComponent } from '../../../../shared/components/app-filter-bar/app-filter-bar.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppTableComponent } from '../../../../shared/components/app-table/app-table.component';
import { ColumnDef } from '../../../../shared/components/app-table/column-def';
import { GradingQueueItem } from '../../models/attempt.model';
import { GradingFacade } from '../../data-access/grading.facade';

/**
 * Çakışma listesi — değerlendirici anlaşmazlıklarının hakemlik kuyruğu.
 *
 * Değerlendirme kuyruğundan (`grading-queue.page.ts`) AYRI bir ekrandır ve
 * `attempt:override` iznine bağlıdır. Ayrımın nedeni yetki değil, İŞİN KENDİSİ:
 * puanlamak eğitmenin işidir, iki eğitmen anlaşamadığında karar vermek program
 * yöneticisinin. Bu ekranı kuyruğa bir filtre olarak eklemek, program
 * yöneticisine puanlanmayı bekleyen yüzlerce cevabı da göstermek anlamına
 * gelirdi — oysa onun sorumluluğu yalnızca hakemlik.
 *
 * Liste boşsa bu bir "iş yok" durumudur, hata değil: çakışma istisnadır.
 */
@Component({
  selector: 'app-conflict-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppFilterBarComponent, AppStatusBadgeComponent, AppTableComponent],
  templateUrl: './conflict-list.page.html',
  styleUrl: './grading-queue.page.scss',
})
export class ConflictListPage implements OnInit {
  protected readonly facade = inject(GradingFacade);
  private readonly router = inject(Router);

  private readonly studentCell =
    viewChild.required<TemplateRef<{ $implicit: GradingQueueItem }>>('studentCell');
  private readonly conflictCell =
    viewChild.required<TemplateRef<{ $implicit: GradingQueueItem }>>('conflictCell');
  private readonly stateCell =
    viewChild.required<TemplateRef<{ $implicit: GradingQueueItem }>>('stateCell');
  private readonly waitingCell =
    viewChild.required<TemplateRef<{ $implicit: GradingQueueItem }>>('waitingCell');

  /**
   * Sonucu açıklanmış deneme kilitlidir — hakem puanı değiştiremez.
   * Satırda bunu ÖNCEDEN söylemek, tıklayıp kilitli panelle karşılaşmayı önler.
   */
  isLocked(item: GradingQueueItem): boolean {
    return item.state === 'RELEASED';
  }

  readonly columns = computed<readonly ColumnDef<GradingQueueItem>[]>(() => [
    { key: 'studentName', header: 'Öğrenci', sortable: true, cell: this.studentCell() },
    {
      key: 'examTitle',
      header: 'Sınav',
      sortable: true,
      value: (row) => `${row.courseCode} · ${row.examTitle}`,
    },
    { key: 'conflictCount', header: 'Çakışma', width: '130px', cell: this.conflictCell() },
    { key: 'state', header: 'Durum', width: '170px', cell: this.stateCell() },
    {
      key: 'submittedAt',
      header: 'Gönderim',
      sortable: true,
      width: '130px',
      hideBelow: 'laptop',
      value: (row) => new Date(row.submittedAt).toLocaleDateString('tr-TR'),
    },
    {
      key: 'waitingHours',
      header: 'Bekleme',
      sortable: true,
      align: 'end',
      numeric: true,
      width: '110px',
      cell: this.waitingCell(),
    },
  ]);

  ngOnInit(): void {
    this.facade.loadConflicts();
  }

  /**
   * Bekleyen çakışma öğrencinin puanını belirsiz bırakır; bu yüzden eşik
   * kuyruktakinden DAHA SIKIDIR — bir gün bekleyen çakışma zaten geciktir.
   */
  waitingTone(hours: number): 'neutral' | 'warning' | 'danger' {
    if (hours >= 48) return 'danger';
    if (hours >= 12) return 'warning';
    return 'neutral';
  }

  formatWaiting(hours: number): string {
    if (hours < 1) return '1 saatten az';
    if (hours < 24) return `${hours} saat`;
    return `${Math.floor(hours / 24)} gün`;
  }

  open(item: GradingQueueItem): void {
    void this.router.navigate(['/grading', item.id]);
  }
}
