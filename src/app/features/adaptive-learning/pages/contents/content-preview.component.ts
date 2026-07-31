import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppDialogComponent } from '../../../../shared/components/app-dialog/app-dialog.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppStatusBadgeComponent } from '../../../../shared/components/app-status-badge/app-status-badge.component';
import { AppIconName } from '../../../../shared/icons/app-icons';
import { statusPresentation } from '../../../../shared/utils/status-tone';
import { COGNITIVE_LEVEL_LABELS, DIFFICULTY_LABELS } from '../../models/common.model';
import {
  CONTENT_TYPE_ICONS,
  CONTENT_TYPE_LABELS,
  ContentItem,
} from '../../models/content-item.model';

/**
 * Hızlı önizleme.
 *
 * Listeden çıkmadan içeriğin ne olduğunu göstermek içindir; tam bilgi ve
 * ilerleme takibi detay sayfasındadır. Bu yüzden burada yazma işlemi yoktur.
 */
@Component({
  selector: 'app-content-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppButtonComponent, AppDialogComponent, AppIconComponent, AppStatusBadgeComponent],
  template: `
    <app-dialog
      [open]="true"
      size="lg"
      [title]="content().title"
      description="Hızlı önizleme"
      (closed)="closed.emit()"
    >
      <div class="preview">
        @if (content().thumbnailUrl; as thumbnail) {
          <img class="preview__image" [src]="thumbnail" [alt]="content().title" />
        } @else {
          <div class="preview__placeholder">
            <app-icon [name]="typeIcon()" [size]="32" />
            <span class="text-sm text-subtle">{{ typeLabel() }}</span>
          </div>
        }

        <div class="preview__badges">
          <app-status-badge
            [label]="status().label"
            [tone]="status().tone"
            [icon]="status().icon"
          />
          <span class="preview__chip">
            <app-icon [name]="typeIcon()" [size]="13" />
            {{ typeLabel() }}
          </span>
          <span class="preview__chip">{{ content().estimatedDurationMinutes }} dk</span>
          <span class="preview__chip">{{ difficultyLabel() }}</span>
        </div>

        @if (content().description) {
          <p class="text-sm text-muted">{{ content().description }}</p>
        } @else {
          <p class="text-sm text-subtle">Bu içerik için açıklama girilmemiş.</p>
        }

        <dl class="preview__meta">
          <div>
            <dt>Ders</dt>
            <dd>{{ courseLabel() || '—' }}</dd>
          </div>
          <div>
            <dt>Kazanım</dt>
            <dd>{{ outcomeCode() }}</dd>
          </div>
          <div>
            <dt>Bilişsel seviye</dt>
            <dd>{{ levelLabel() }}</dd>
          </div>
          <div>
            <dt>Yazar</dt>
            <dd>{{ content().authorName }}</dd>
          </div>
        </dl>

        @if (content().tags.length > 0) {
          <div class="preview__tags">
            @for (tag of content().tags; track tag) {
              <span class="preview__chip">{{ tag }}</span>
            }
          </div>
        }

        @if (content().resourceUrl; as url) {
          <a class="preview__link text-sm" [href]="url" target="_blank" rel="noopener noreferrer">
            <app-icon name="link" [size]="14" />
            Kaynağı yeni sekmede aç
          </a>
        }
      </div>

      <div dialog-footer>
        <app-button variant="ghost" (pressed)="closed.emit()">Kapat</app-button>
        <app-button variant="primary" icon="external-link" (pressed)="openDetail.emit()">
          Detayı aç
        </app-button>
      </div>
    </app-dialog>
  `,
  styleUrl: './content-preview.component.scss',
})
export class ContentPreviewComponent {
  readonly content = input.required<ContentItem>();
  readonly courseLabel = input('');
  readonly outcomeCode = input('—');

  readonly openDetail = output<void>();
  readonly closed = output<void>();

  readonly typeLabel = computed(() => CONTENT_TYPE_LABELS[this.content().type]);
  readonly typeIcon = computed(() => CONTENT_TYPE_ICONS[this.content().type] as AppIconName);
  readonly difficultyLabel = computed(() => DIFFICULTY_LABELS[this.content().difficulty]);
  readonly levelLabel = computed(() => COGNITIVE_LEVEL_LABELS[this.content().level]);
  readonly status = computed(() => statusPresentation(this.content().state));
}
