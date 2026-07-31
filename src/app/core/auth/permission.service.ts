import { Injectable, Signal, computed, inject } from '@angular/core';

import { AuthStore } from './auth.store';
import { Permission, Role } from './permission.model';

/**
 * İzin sorgulama servisi.
 *
 * Sadece "butonu gizlemek" için değil; facade'ler işlemi göndermeden önce,
 * guard'lar route'a girmeden önce burayı kullanır (üç seviyeli koruma —
 * ARCHITECTURE.md §5.1).
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private readonly store = inject(AuthStore);

  readonly permissions = this.store.permissions;
  readonly role = this.store.activeRole;

  can(permission: Permission): boolean {
    return this.store.permissions().includes(permission);
  }

  canAny(permissions: readonly Permission[]): boolean {
    return permissions.some((permission) => this.can(permission));
  }

  canAll(permissions: readonly Permission[]): boolean {
    return permissions.every((permission) => this.can(permission));
  }

  hasRole(role: Role): boolean {
    return this.store.activeRole() === role;
  }

  hasAnyRole(roles: readonly Role[]): boolean {
    const active = this.store.activeRole();
    return active !== null && roles.includes(active);
  }

  /** Template'te tekrar tekrar çağırmak yerine reaktif okuma için. */
  can$(permission: Permission): Signal<boolean> {
    return computed(() => this.store.permissions().includes(permission));
  }
}
