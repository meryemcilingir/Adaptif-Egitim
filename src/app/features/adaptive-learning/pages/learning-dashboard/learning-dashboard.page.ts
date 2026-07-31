import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthFacade } from '../../../../core/auth/auth.facade';
import { ToastStore } from '../../../../core/observability/toast.store';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { DashboardFacade } from '../../data-access/dashboard.facade';
import { NotificationFacade } from '../../data-access/notification.facade';
import {
  AdminDashboard,
  DashboardSnapshot,
  InstructorDashboard,
  MeasurementDashboard,
  ObserverDashboard,
  ProgramManagerDashboard,
  StudentDashboard,
} from '../../models/dashboard.model';
import { Notification } from '../../models/notification.model';
import { Recommendation } from '../../models/recommendation.model';
import { AdminDashboardComponent } from './dashboards/admin-dashboard.component';
import { InstructorDashboardComponent } from './dashboards/instructor-dashboard.component';
import { MeasurementDashboardComponent } from './dashboards/measurement-dashboard.component';
import { ObserverDashboardComponent } from './dashboards/observer-dashboard.component';
import { ProgramManagerDashboardComponent } from './dashboards/program-manager-dashboard.component';
import { StudentDashboardComponent } from './dashboards/student-dashboard.component';

/**
 * Dashboard giriş noktası.
 *
 * Sayfa yalnızca ORTAK çerçeveyi (başlık, yükleme/hata durumu, tazeleme) yönetir;
 * içeriği role göre ilgili bileşene devreder. Böylece yeni bir rol eklemek
 * mevcut rollerin şablonunu büyütmez (Open/Closed).
 */
@Component({
  selector: 'app-learning-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AdminDashboardComponent,
    AppButtonComponent,
    AppErrorStateComponent,
    AppLoadingStateComponent,
    AppStatusBadgeComponent,
    InstructorDashboardComponent,
    MeasurementDashboardComponent,
    ObserverDashboardComponent,
    ProgramManagerDashboardComponent,
    RelativeTimePipe,
    StudentDashboardComponent,
  ],
  templateUrl: './learning-dashboard.page.html',
  styleUrl: './learning-dashboard.page.scss',
})
export class LearningDashboardPage implements OnInit {
  protected readonly facade = inject(DashboardFacade);
  private readonly notifications = inject(NotificationFacade);
  private readonly auth = inject(AuthFacade);
  private readonly toast = inject(ToastStore);
  private readonly router = inject(Router);

  readonly roleLabel = this.auth.activeRoleLabel;
  readonly firstName = computed(() => this.auth.user()?.fullName.split(' ')[0] ?? '');

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Günaydın';
    if (hour < 18) return 'İyi günler';
    return 'İyi akşamlar';
  });

  ngOnInit(): void {
    this.facade.load();
    this.notifications.load();
  }

  /*
   * Tip daraltıcılar: şablon `@switch` içinde birleşim tipini daraltamadığı için
   * her rol için açık bir dönüştürücü sunulur. Yanlış eşleşme derleme anında yakalanır.
   */
  asStudent = (snapshot: DashboardSnapshot): StudentDashboard => snapshot as StudentDashboard;
  asInstructor = (snapshot: DashboardSnapshot): InstructorDashboard =>
    snapshot as InstructorDashboard;
  asMeasurement = (snapshot: DashboardSnapshot): MeasurementDashboard =>
    snapshot as MeasurementDashboard;
  asProgramManager = (snapshot: DashboardSnapshot): ProgramManagerDashboard =>
    snapshot as ProgramManagerDashboard;
  asObserver = (snapshot: DashboardSnapshot): ObserverDashboard => snapshot as ObserverDashboard;
  asAdmin = (snapshot: DashboardSnapshot): AdminDashboard => snapshot as AdminDashboard;

  onNotificationRead(notification: Notification): void {
    this.notifications.markRead(notification);
  }

  onRecommendationStart(recommendation: Recommendation): void {
    // İçerik oynatıcı sonraki sprintte gelecek; şimdilik kullanıcı bilgilendirilir.
    this.toast.info(
      'Çalışma planına eklendi',
      `"${recommendation.targetTitle}" öğrenme yolunun başına alındı.`,
    );
  }

  refresh(): void {
    this.facade.load();
    this.notifications.load();
  }

  openDevTools(): void {
    void this.router.navigate(['/dev-tools']);
  }
}
