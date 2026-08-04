import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import {
  AUDIT_ACTION_LABELS,
  AuditAction,
  AuditEvent,
  auditModuleOf,
} from '../../../core/observability/audit.model';
import { AppIconComponent } from '../../../shared/components/app-icon/app-icon.component';
import { AppIconName } from '../../../shared/icons/app-icons';
import { TimelineDay } from '../data-access/audit.facade';

/**
 * Denetim kayıtlarının zaman çizelgesi görünümü (Sprint 9 §11).
 *
 * Tablo "ne oldu" sorusuna, çizelge "ne sırayla oldu" sorusuna cevap verir.
 * Aynı veriyi iki biçimde göstermek tekrar değildir: bir kullanıcının bir
 * saat içinde yaptığı işlemler zinciri tabloda satırlara dağılır, çizelgede
 * ise tek bir akış olarak okunur.
 *
 * İkon, eylem adının MODÜL ÖNEKİNDEN türetilir; her yeni eylem için ayrı bir
 * eşleme yazmak gerekmez (Open/Closed).
 */

const MODULE_ICONS: Readonly<Record<string, AppIconName>> = {
  program: 'library',
  course: 'book-open',
  outcome: 'target',
  content: 'file-text',
  question: 'circle-help',
  blueprint: 'grid-2x2',
  exam: 'file-check',
  session: 'timer',
  attempt: 'clipboard-list',
  permission: 'shield-check',
  auth: 'lock',
  user: 'user-round',
  role: 'shield-check',
  term: 'calendar',
  settings: 'settings',
  notification: 'bell',
};

interface TimelineEntry {
  readonly id: string;
  readonly time: string;
  readonly icon: AppIconName;
  readonly title: string;
  readonly actor: string;
  readonly target: string;
  readonly module: string;
  readonly success: boolean;
  readonly ipAddress: string;
  readonly reason: string | null;
}

interface TimelineGroup {
  readonly date: string;
  readonly entries: readonly TimelineEntry[];
}

@Component({
  selector: 'app-activity-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, DatePipe, NgTemplateOutlet],
  templateUrl: './activity-timeline.component.html',
  styleUrl: './activity-timeline.component.scss',
})
export class ActivityTimelineComponent {
  readonly days = input.required<readonly TimelineDay[]>();
  /** Satır tıklanabilir olsun mu — denetim ekranında detay açar. */
  readonly selectable = input(false);

  readonly select = output<string>();

  readonly groups = computed<readonly TimelineGroup[]>(() =>
    this.days().map((day) => ({
      date: day.date,
      entries: day.events.map((event) => toEntry(event)),
    })),
  );

  readonly isEmpty = computed(() => this.groups().every((group) => group.entries.length === 0));

  onSelect(id: string): void {
    if (this.selectable()) this.select.emit(id);
  }
}

function toEntry(event: AuditEvent): TimelineEntry {
  const prefix = event.action.split('.')[0] ?? '';

  return {
    id: event.id,
    time: event.createdAt,
    icon: MODULE_ICONS[prefix] ?? 'activity',
    title: AUDIT_ACTION_LABELS[event.action as AuditAction] ?? event.action,
    actor: event.actorName,
    target: event.targetLabel,
    module: auditModuleOf(event.action),
    success: event.success,
    ipAddress: event.ipAddress,
    reason: event.reason,
  };
}
