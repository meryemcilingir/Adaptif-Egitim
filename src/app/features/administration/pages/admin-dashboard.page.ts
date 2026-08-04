import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AppButtonComponent } from '../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../shared/components/app-card/app-card.component';
import { AppChartCardComponent } from '../../../shared/components/app-chart-card/app-chart-card.component';
import { AppErrorStateComponent } from '../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../shared/components/app-loading-state/app-loading-state.component';
import { AppIconName } from '../../../shared/icons/app-icons';
import { toTimeCategories, toTimeSeries } from '../../../shared/utils/chart-adapters';
import { SystemHealthCardComponent } from '../components/system-health-card.component';
import { AdminFacade } from '../data-access/admin.facade';

/** Panodan doğrudan erişilen yönetim işlemleri (§1). */
interface QuickAction {
  readonly label: string;
  readonly description: string;
  readonly icon: AppIconName;
  readonly link: string;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    label: 'Kullanıcı oluştur',
    description: 'Yeni hesap açıp rol ve program ata',
    icon: 'user-round',
    link: '/admin/users/new',
  },
  {
    label: 'Bildirim gönder',
    description: 'Role, gruba veya herkese duyuru ilet',
    icon: 'bell',
    link: '/admin/notifications',
  },
  {
    label: 'Akademik dönem',
    description: 'Dönem tanımla, tarihleri düzenle',
    icon: 'calendar',
    link: '/admin/terms',
  },
  {
    label: 'Sistem ayarları',
    description: 'Platform, sınav, güvenlik parametreleri',
    icon: 'settings',
    link: '/admin/settings',
  },
  {
    label: 'Denetim kaydı',
    description: 'Kim, ne zaman, ne yaptı',
    icon: 'scroll-text',
    link: '/audit-log',
  },
];

/**
 * Yönetim panosu (Sprint 9 §1, §14).
 *
 * On gösterge, beş grafik ve hızlı işlemler tek ekranda toplanır. Göstergeler
 * TIKLANABİLİRDİR: bir sayıya bakan yönetici genellikle o sayının arkasındaki
 * listeyi görmek ister; tıklanamayan bir KPI kartı onu menüde yol aramaya iter.
 */
@Component({
  selector: 'app-admin-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppChartCardComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    DatePipe,
    SystemHealthCardComponent,
  ],
  templateUrl: './admin-dashboard.page.html',
  styleUrl: './admin-dashboard.page.scss',
})
export class AdminDashboardPage implements OnInit {
  protected readonly facade = inject(AdminFacade);
  private readonly router = inject(Router);

  readonly quickActions = QUICK_ACTIONS;

  readonly overview = this.facade.overview;
  readonly isLoading = this.facade.isOverviewLoading;
  readonly error = this.facade.overviewError;
  readonly hasError = computed(() => this.facade.overviewStatus() === 'error');

  /** Tüm grafikler AYNI zaman eksenini paylaşır; farklı pencereler yanıltıcı olurdu. */
  readonly categories = computed(() => toTimeCategories(this.overview()?.userGrowth ?? []));

  readonly userGrowthSeries = computed(() =>
    toTimeSeries('Toplam kullanıcı', this.overview()?.userGrowth ?? []),
  );
  readonly loginSeries = computed(() =>
    toTimeSeries('Başarılı giriş', this.overview()?.loginActivity ?? []),
  );
  readonly examSeries = computed(() =>
    toTimeSeries('Teslim edilen sınav', this.overview()?.examActivity ?? []),
  );
  readonly courseSeries = computed(() =>
    toTimeSeries('İçerik erişimi', this.overview()?.courseActivity ?? []),
  );
  readonly questionSeries = computed(() =>
    toTimeSeries('Toplam soru', this.overview()?.questionGrowth ?? []),
  );

  ngOnInit(): void {
    this.facade.loadOverview();
  }

  open(link: string | null): void {
    if (link) void this.router.navigate([link]);
  }
}
