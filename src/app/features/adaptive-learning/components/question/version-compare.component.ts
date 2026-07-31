import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppDialogComponent } from '../../../../shared/components/app-dialog/app-dialog.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { VersionComparison } from '../../models/question.model';

/**
 * Versiyon karşılaştırma diyaloğu.
 *
 * Yalnızca DEĞİŞEN alanlar listelenir; değişmeyenler gürültü yaratmasın diye
 * gösterilmez. Fark hesabı saf `compareVersions()` fonksiyonundan gelir.
 */
@Component({
  selector: 'app-version-compare',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppDialogComponent,
    AppEmptyStateComponent,
    AppIconComponent,
    RelativeTimePipe,
  ],
  template: `
    @let data = comparison();

    <app-dialog
      [open]="true"
      size="xl"
      title="Versiyon karşılaştırma"
      [description]="'v' + data.fromVersion + ' → v' + data.toVersion"
      (closed)="closed.emit()"
    >
      <div class="compare">
        <header class="compare__meta">
          <div class="compare__side">
            <span class="compare__tag">v{{ data.fromVersion }}</span>
            <span class="text-xs text-subtle">
              {{ data.fromUpdatedBy }} · {{ data.fromUpdatedAt | appRelativeTime }}
            </span>
          </div>
          <app-icon name="arrow-right" [size]="16" />
          <div class="compare__side">
            <span class="compare__tag compare__tag--new">v{{ data.toVersion }}</span>
            <span class="text-xs text-subtle">
              {{ data.toUpdatedBy }} · {{ data.toUpdatedAt | appRelativeTime }}
            </span>
          </div>
        </header>

        @if (data.changes.length === 0) {
          <app-empty-state
            icon="git-compare"
            title="Fark bulunamadı"
            description="Seçilen iki versiyon arasında karşılaştırılan alanlarda değişiklik yok."
          />
        } @else {
          <ul class="diffs">
            @for (change of data.changes; track change.field) {
              <li class="diff">
                <span class="diff__label text-sm">{{ change.label }}</span>

                <div class="diff__values">
                  <div class="diff__value diff__value--old">
                    @if (change.isRichText) {
                      <div [innerHTML]="change.before"></div>
                    } @else {
                      <span class="text-sm">{{ change.before || '—' }}</span>
                    }
                  </div>

                  <app-icon class="diff__arrow" name="arrow-right" [size]="14" />

                  <div class="diff__value diff__value--new">
                    @if (change.isRichText) {
                      <div [innerHTML]="change.after"></div>
                    } @else {
                      <span class="text-sm">{{ change.after || '—' }}</span>
                    }
                  </div>
                </div>
              </li>
            }
          </ul>
        }
      </div>

      <div dialog-footer>
        <app-button variant="secondary" (pressed)="closed.emit()">Kapat</app-button>
      </div>
    </app-dialog>
  `,
  styleUrl: './version-compare.component.scss',
})
export class VersionCompareComponent {
  readonly comparison = input.required<VersionComparison>();
  readonly closed = output<void>();
}
