import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';

import { STORAGE_ADAPTER, STORAGE_KEYS } from '../storage/storage.token';

export type Breakpoint = 'mobile' | 'tablet' | 'laptop' | 'desktop';

interface UiPreferences {
  readonly sidebarCollapsed: boolean;
}

const BREAKPOINTS: readonly { readonly name: Breakpoint; readonly minWidth: number }[] = [
  { name: 'desktop', minWidth: 1280 },
  { name: 'laptop', minWidth: 1024 },
  { name: 'tablet', minWidth: 768 },
  { name: 'mobile', minWidth: 0 },
];

/**
 * Global arayüz durumu: sidebar, breakpoint ve uçuştaki istek sayısı.
 * Domain bilgisi taşımaz (SRP) — yalnızca kabuk davranışını yönetir.
 */
@Injectable({ providedIn: 'root' })
export class UiStore {
  private readonly storage = inject(STORAGE_ADAPTER);
  private readonly document = inject(DOCUMENT);

  private readonly viewportWidth = signal(this.document.defaultView?.innerWidth ?? 1440);
  private readonly userCollapsed = signal(
    this.storage.get<UiPreferences>(STORAGE_KEYS.uiPreferences)?.sidebarCollapsed ?? false,
  );
  private readonly drawerOpen = signal(false);
  private readonly pendingRequests = signal(0);

  readonly breakpoint = computed<Breakpoint>(() => {
    const width = this.viewportWidth();
    return BREAKPOINTS.find((bp) => width >= bp.minWidth)!.name;
  });

  /** Tablet ve altında sidebar overlay drawer olarak davranır. */
  readonly isDrawerMode = computed(
    () => this.breakpoint() === 'mobile' || this.breakpoint() === 'tablet',
  );
  readonly isMobile = computed(() => this.breakpoint() === 'mobile');

  /** Laptop genişliğinde kullanıcı tercihinden bağımsız olarak daraltılır. */
  readonly isSidebarCollapsed = computed(
    () => !this.isDrawerMode() && (this.userCollapsed() || this.breakpoint() === 'laptop'),
  );

  readonly isDrawerOpen = computed(() => this.isDrawerMode() && this.drawerOpen());
  readonly isLoading = computed(() => this.pendingRequests() > 0);

  constructor() {
    const view = this.document.defaultView;
    view?.addEventListener('resize', () => this.viewportWidth.set(view.innerWidth), {
      passive: true,
    });
  }

  toggleSidebar(): void {
    if (this.isDrawerMode()) {
      this.drawerOpen.update((open) => !open);
      return;
    }
    const next = !this.userCollapsed();
    this.userCollapsed.set(next);
    this.storage.set<UiPreferences>(STORAGE_KEYS.uiPreferences, { sidebarCollapsed: next });
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  requestStarted(): void {
    this.pendingRequests.update((count) => count + 1);
  }

  requestFinished(): void {
    this.pendingRequests.update((count) => Math.max(0, count - 1));
  }
}
