import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Permission } from '../../../core/auth/permission.model';
import {
  PERMISSION_GROUPS,
  isPermissionLocked,
  permissionLabel,
} from '../../../core/auth/role-definition';
import { AppIconComponent } from '../../../shared/components/app-icon/app-icon.component';

/** Bir izin satırının gösterim durumu. */
interface PermissionCell {
  readonly permission: Permission;
  readonly label: string;
  readonly checked: boolean;
  readonly locked: boolean;
}

interface GroupView {
  readonly key: string;
  readonly label: string;
  readonly cells: readonly PermissionCell[];
  readonly selectedCount: number;
  readonly total: number;
  /** Grubun tamamı seçili mi — başlıktaki toplu seçim kutusu için. */
  readonly allSelected: boolean;
}

/**
 * İzin matrisi (Sprint 9 §4).
 *
 * İzinler MODÜL bazında gruplanır çünkü yönetici "bu rol dersleri
 * düzenleyebilsin mi?" diye düşünür, `course:write` diye değil. Gruplama
 * `core/auth/role-definition.ts` içinde tanımlıdır; bileşen ikinci bir liste
 * tutmaz.
 *
 * Kilitli izinler GİZLENMEZ, devre dışı gösterilir. Gizlenseydi yönetici
 * "platform yöneticisinden sistem yönetimi iznini almış olabilir miyim?" diye
 * merak eder; kilidi görmek kuralı öğretir.
 *
 * Bileşen kendi yaydığı listeyi geri OKUMAZ: tek bir iznin değişimini yayar,
 * birleştirmeyi listenin sahibi yapar (ADR-055).
 */
@Component({
  selector: 'app-permission-matrix',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent],
  templateUrl: './permission-matrix.component.html',
  styleUrl: './permission-matrix.component.scss',
})
export class PermissionMatrixComponent {
  readonly selected = input.required<readonly Permission[]>();
  /** Kilit kuralı role göre değişir (ör. `PLATFORM_ADMIN` → `admin:manage`). */
  readonly roleKey = input('');
  readonly disabled = input(false);

  /** Tek izin değişimi — `true` eklendi, `false` kaldırıldı. */
  readonly toggle = output<{ permission: Permission; checked: boolean }>();
  /** Grup başlığındaki toplu seçim. */
  readonly toggleGroup = output<{ permissions: readonly Permission[]; checked: boolean }>();

  readonly groups = computed<readonly GroupView[]>(() => {
    const selected = new Set(this.selected());
    const key = this.roleKey();

    return PERMISSION_GROUPS.map((group) => {
      const cells = group.permissions.map<PermissionCell>((permission) => ({
        permission,
        label: permissionLabel(permission),
        checked: selected.has(permission),
        locked: isPermissionLocked(key, permission),
      }));

      const selectedCount = cells.filter((cell) => cell.checked).length;

      return {
        key: group.key,
        label: group.label,
        cells,
        selectedCount,
        total: cells.length,
        allSelected: selectedCount === cells.length,
      };
    });
  });

  readonly totalSelected = computed(() => this.selected().length);

  onToggle(cell: PermissionCell): void {
    if (cell.locked || this.disabled()) return;
    this.toggle.emit({ permission: cell.permission, checked: !cell.checked });
  }

  onToggleGroup(group: GroupView): void {
    if (this.disabled()) return;

    // Kilitli izinler toplu işlemden muaftır; aksi hâlde "tümünü kaldır" onları da silerdi.
    const permissions = group.cells
      .filter((cell) => !cell.locked)
      .map((cell) => cell.permission);

    this.toggleGroup.emit({ permissions, checked: !group.allSelected });
  }
}
