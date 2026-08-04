import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { ReportMeta } from '../../models/analytics.model';
import { ExportMenuComponent, ExportTable } from '../../../../shared/components/app-export-menu/app-export-menu.component';

/**
 * Rapor künyesi.
 *
 * Her analitik ekranın başında AYNI bilgiler durur: hangi dönem, kaç kayıt,
 * hangi kapsam. Bir rapordaki sayıya bakan kişi "bu neyin ortalaması?" diye
 * sormak zorunda kalmamalı.
 *
 * Örneklem sıfırsa uyarı gösterilir — boş bir grafiğe bakıp veri olmadığını
 * kendi çıkarmaya çalışmak, kullanıcıyı sistemin bozuk olduğu sanısına düşürür.
 */
@Component({
  selector: 'app-report-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, ExportMenuComponent],
  template: `
    <header class="report-header">
      <div class="report-header__meta">
        <span class="chip">
          <app-icon name="calendar" [size]="13" />
          {{ meta().rangeLabel }}
        </span>

        <span class="chip" [class.is-warning]="isEmpty()">
          <app-icon name="database" [size]="13" />
          {{ sampleLabel() }}
        </span>

        @if (meta().scopeNote) {
          <span class="chip is-info">
            <app-icon name="shield-check" [size]="13" />
            {{ meta().scopeNote }}
          </span>
        }
      </div>

      @if (exportTable(); as table) {
        <app-export-menu [table]="table" />
      }
    </header>
  `,
  styleUrl: './report-header.component.scss',
})
export class ReportHeaderComponent {
  readonly meta = input.required<ReportMeta>();
  /** Verilmezse dışa aktarım düğmesi gösterilmez. */
  readonly exportTable = input<ExportTable | null>(null);

  readonly isEmpty = computed(() => this.meta().sampleSize === 0);

  readonly sampleLabel = computed(() =>
    this.isEmpty() ? 'Bu filtrede kayıt yok' : `${this.meta().sampleSize} kayıt`,
  );
}
