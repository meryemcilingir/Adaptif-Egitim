import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, shareReplay, tap } from 'rxjs';

import { ApiError } from '../../../core/api/api-error';
import { ToastStore } from '../../../core/observability/toast.store';
import { AuthStore } from '../../../core/auth/auth.store';
import { Permission } from '../../../core/auth/permission.model';
import { Term } from '../../adaptive-learning/models/common.model';
import {
  AdminOverview,
  GlobalSearchResult,
  RoleDraft,
  RoleRow,
  SystemSettings,
} from '../models/admin.model';
import { AdminRepository } from './admin.repository';
import { LoadState } from './user-admin.facade';

/**
 * Pano, rol, dönem, ayar ve arama orkestrasyonu.
 *
 * Bu dördü tek facade'de toplandı çünkü hepsi TEK KAYIT ya da KISA LİSTE
 * döndürüyor; hiçbirinin sayfalama/filtre durumu yok. Ayrı dosyalara bölmek
 * aynı üç sinyali (veri/durum/hata) dört kez yazmak olurdu.
 */
@Injectable({ providedIn: 'root' })
export class AdminFacade {
  private readonly repository = inject(AdminRepository);
  private readonly toast = inject(ToastStore);
  private readonly auth = inject(AuthStore);

  /* ── Pano ──────────────────────────────────────────────────────────────── */

  private readonly overviewState = signal<AdminOverview | null>(null);
  private readonly overviewStatusState = signal<LoadState>('idle');
  private readonly overviewErrorState = signal<ApiError | null>(null);

  readonly overview = this.overviewState.asReadonly();
  readonly overviewStatus = this.overviewStatusState.asReadonly();
  readonly overviewError = this.overviewErrorState.asReadonly();

  readonly isOverviewLoading = computed(
    () => this.overviewStatusState() === 'loading' && this.overviewState() === null,
  );

  loadOverview(): void {
    this.overviewStatusState.set('loading');
    this.overviewErrorState.set(null);

    this.repository.overview().subscribe({
      next: (overview) => {
        this.overviewState.set(overview);
        this.overviewStatusState.set('success');
      },
      error: (error: ApiError) => {
        this.overviewErrorState.set(error);
        this.overviewStatusState.set('error');
      },
    });
  }

  /* ── Roller ────────────────────────────────────────────────────────────── */

  private readonly rolesState = signal<readonly RoleRow[]>([]);
  private readonly rolesStatusState = signal<LoadState>('idle');
  private readonly rolesErrorState = signal<ApiError | null>(null);
  private readonly savingState = signal(false);

  readonly roles = this.rolesState.asReadonly();
  readonly rolesStatus = this.rolesStatusState.asReadonly();
  readonly rolesError = this.rolesErrorState.asReadonly();
  readonly saving = this.savingState.asReadonly();

  /** Aktif rollerin izin sayısı — pano ve seçicilerde kullanılır. */
  readonly activeRoles = computed(() => this.rolesState().filter((role) => role.archivedAt === null));

  loadRoles(): void {
    this.rolesStatusState.set('loading');
    this.rolesErrorState.set(null);

    this.repository.roles().subscribe({
      next: (roles) => {
        this.rolesState.set(roles);
        this.rolesStatusState.set('success');
      },
      error: (error: ApiError) => {
        this.rolesErrorState.set(error);
        this.rolesStatusState.set('error');
      },
    });
  }

  createRole(draft: RoleDraft): Observable<RoleRow> {
    return this.writeRole(this.repository.createRole(draft), 'Rol oluşturuldu.');
  }

  updateRole(id: string, draft: RoleDraft, expectedVersion: number): Observable<RoleRow> {
    return this.writeRole(
      this.repository.updateRole(id, { ...draft, expectedVersion }),
      /*
       * İzin değişikliği ANINDA yürürlüğe girmez.
       *
       * Oturum izinleri jeton verilirken hesaplanır; kullanıcı bir sonraki
       * girişinde ya da rol değiştirdiğinde yeni izinleri alır. Bunu söylememek,
       * yöneticinin "kaydettim ama hiçbir şey değişmedi" diye düşünmesine yol açardı.
       */
      'Rol güncellendi. Değişiklik, kullanıcıların bir sonraki oturumunda geçerli olur.',
    );
  }

  duplicateRole(id: string): void {
    this.repository.duplicateRole(id).subscribe({
      next: () => {
        this.toast.success('Rol kopyalandı.');
        this.loadRoles();
      },
      error: (error: ApiError) => this.toast.error(error.message),
    });
  }

  toggleRoleArchive(id: string): void {
    this.repository.toggleRoleArchive(id).subscribe({
      next: (role) => {
        this.toast.success(role.archivedAt ? 'Rol arşivlendi.' : 'Rol arşivden çıkarıldı.');
        this.loadRoles();
      },
      error: (error: ApiError) => this.toast.error(error.message),
    });
  }

  private writeRole(request: Observable<RoleRow>, message: string): Observable<RoleRow> {
    this.savingState.set(true);

    const shared = request.pipe(
      tap({
        next: () => {
          this.savingState.set(false);
          this.toast.success(message);
          this.loadRoles();
        },
        error: () => this.savingState.set(false),
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    shared.subscribe({ error: () => undefined });
    return shared;
  }

  /* ── Akademik dönemler ─────────────────────────────────────────────────── */

  private readonly termsState = signal<readonly Term[]>([]);
  private readonly termsStatusState = signal<LoadState>('idle');
  private readonly termsErrorState = signal<ApiError | null>(null);

  readonly terms = this.termsState.asReadonly();
  readonly termsStatus = this.termsStatusState.asReadonly();
  readonly termsError = this.termsErrorState.asReadonly();

  loadTerms(): void {
    this.termsStatusState.set('loading');
    this.termsErrorState.set(null);

    this.repository.terms().subscribe({
      next: (terms) => {
        this.termsState.set(terms);
        this.termsStatusState.set('success');
      },
      error: (error: ApiError) => {
        this.termsErrorState.set(error);
        this.termsStatusState.set('error');
      },
    });
  }

  createTerm(draft: Partial<Term>): Observable<Term> {
    return this.writeTerm(this.repository.createTerm(draft), 'Dönem oluşturuldu.');
  }

  updateTerm(id: string, draft: Partial<Term>, expectedVersion: number): Observable<Term> {
    return this.writeTerm(
      this.repository.updateTerm(id, { ...draft, expectedVersion }),
      'Dönem güncellendi.',
    );
  }

  toggleTermArchive(id: string): void {
    this.repository.toggleTermArchive(id).subscribe({
      next: (term) => {
        this.toast.success(term.archivedAt ? 'Dönem arşivlendi.' : 'Dönem arşivden çıkarıldı.');
        this.loadTerms();
      },
      error: (error: ApiError) => this.toast.error(error.message),
    });
  }

  private writeTerm(request: Observable<Term>, message: string): Observable<Term> {
    this.savingState.set(true);

    const shared = request.pipe(
      tap({
        next: () => {
          this.savingState.set(false);
          this.toast.success(message);
          this.loadTerms();
        },
        error: () => this.savingState.set(false),
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    shared.subscribe({ error: () => undefined });
    return shared;
  }

  /* ── Sistem ayarları ───────────────────────────────────────────────────── */

  private readonly settingsState = signal<SystemSettings | null>(null);
  private readonly settingsStatusState = signal<LoadState>('idle');
  private readonly settingsErrorState = signal<ApiError | null>(null);

  readonly settings = this.settingsState.asReadonly();
  readonly settingsStatus = this.settingsStatusState.asReadonly();
  readonly settingsError = this.settingsErrorState.asReadonly();

  loadSettings(): void {
    this.settingsStatusState.set('loading');
    this.settingsErrorState.set(null);

    this.repository.settings().subscribe({
      next: (settings) => {
        this.settingsState.set(settings);
        this.settingsStatusState.set('success');
      },
      error: (error: ApiError) => {
        this.settingsErrorState.set(error);
        this.settingsStatusState.set('error');
      },
    });
  }

  saveSettings(patch: Partial<SystemSettings>): Observable<SystemSettings> {
    const current = this.settingsState();
    this.savingState.set(true);

    const shared = this.repository
      .saveSettings({ ...patch, expectedVersion: current?.version })
      .pipe(
        tap({
          next: (settings) => {
            this.savingState.set(false);
            this.settingsState.set(settings);
            this.toast.success('Sistem ayarları kaydedildi.');
          },
          error: () => this.savingState.set(false),
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    shared.subscribe({ error: () => undefined });
    return shared;
  }

  /* ── Genel arama ───────────────────────────────────────────────────────── */

  private readonly searchState = signal<GlobalSearchResult | null>(null);
  private readonly searchingState = signal(false);

  readonly searchResult = this.searchState.asReadonly();
  readonly searching = this.searchingState.asReadonly();

  search(term: string): void {
    if (term.trim().length < 2) {
      this.searchState.set(null);
      return;
    }

    this.searchingState.set(true);

    this.repository.search(term).subscribe({
      next: (result) => {
        this.searchState.set(result);
        this.searchingState.set(false);
      },
      // Arama hatası toast üretmez: kullanıcı yazmaya devam ediyordur, panel sessizce boş kalır.
      error: () => {
        this.searchState.set(null);
        this.searchingState.set(false);
      },
    });
  }

  clearSearch(): void {
    this.searchState.set(null);
  }

  /** Ekranların butonları gizlemek için kullandığı kısayol (§9, §15). */
  can(permission: Permission): boolean {
    return this.auth.permissions().includes(permission);
  }
}
