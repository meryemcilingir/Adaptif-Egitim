import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AppIconComponent } from '../app-icon/app-icon.component';

export interface BreadcrumbItem {
  readonly label: string;
  readonly link?: string;
}

/** Route `data.breadcrumb` bilgisinden beslenen kırılım çubuğu. */
@Component({
  selector: 'app-breadcrumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AppIconComponent, RouterLink],
  template: `
    <nav aria-label="Sayfa kırılımı">
      <ol class="breadcrumb">
        @for (item of items(); track item.label; let last = $last) {
          <li class="breadcrumb__item">
            @if (item.link && !last) {
              <a class="breadcrumb__link" [routerLink]="item.link">{{ item.label }}</a>
            } @else {
              <span class="breadcrumb__current" [attr.aria-current]="last ? 'page' : null">
                {{ item.label }}
              </span>
            }

            @if (!last) {
              <app-icon class="breadcrumb__separator" name="chevron-right" [size]="13" />
            }
          </li>
        }
      </ol>
    </nav>
  `,
  styles: `
    /* Dar ekranda kırılım, yanındaki aramayı taşırmak yerine kısalır. */
    :host {
      display: block;
      min-width: 0;
      overflow: hidden;
    }

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: var(--space-1);
      flex-wrap: nowrap;
      min-width: 0;
    }

    .breadcrumb__item {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      font-size: var(--fs-sm);
      min-width: 0;
    }

    .breadcrumb__link {
      color: var(--color-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      border-radius: var(--radius-sm);

      &:hover {
        color: var(--color-text);
        text-decoration: underline;
      }

      &:focus-visible {
        outline: 2px solid var(--color-border-focus);
        outline-offset: 2px;
      }
    }

    .breadcrumb__current {
      color: var(--color-text);
      font-weight: var(--fw-strong);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .breadcrumb__separator {
      color: var(--color-text-tertiary);
    }
  `,
})
export class AppBreadcrumbComponent {
  readonly items = input.required<readonly BreadcrumbItem[]>();
}
