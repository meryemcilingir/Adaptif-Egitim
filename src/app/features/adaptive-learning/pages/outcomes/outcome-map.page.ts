import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';

import { createPageRequest } from '../../../../core/api/page-request';
import { AppButtonComponent } from '../../../../shared/components/app-button/app-button.component';
import { AppCardComponent } from '../../../../shared/components/app-card/app-card.component';
import { AppEmptyStateComponent } from '../../../../shared/components/app-empty-state/app-empty-state.component';
import { AppErrorStateComponent } from '../../../../shared/components/app-error-state/app-error-state.component';
import { AppIconComponent } from '../../../../shared/components/app-icon/app-icon.component';
import { AppLoadingStateComponent } from '../../../../shared/components/app-loading-state/app-loading-state.component';
import {
  AppSelectComponent,
  SelectOption,
} from '../../../../shared/components/app-select/app-select.component';
import { FormsModule } from '@angular/forms';
import { OutcomeGraphComponent } from '../../components/outcome-graph/outcome-graph.component';
import { CourseRepository } from '../../data-access/catalog.repository';
import { OutcomeFacade } from '../../data-access/outcome.facade';
import { OutcomeGraphNode } from '../../models/learning-outcome.model';

/**
 * Kazanım haritası.
 *
 * Ders seçimiyle kapsam daraltılır; döngü varsa üstte açıkça uyarılır ve döngüye
 * dâhil kazanımlar kodlarıyla listelenir (BR-01). Bir düğüme tıklamak odak modunu
 * açar, çift tık yerine "Detayı aç" düğmesi kullanılır.
 */
@Component({
  selector: 'app-outcome-map-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AppButtonComponent,
    AppCardComponent,
    AppEmptyStateComponent,
    AppErrorStateComponent,
    AppIconComponent,
    AppLoadingStateComponent,
    AppSelectComponent,
    FormsModule,
    OutcomeGraphComponent,
  ],
  templateUrl: './outcome-map.page.html',
  styleUrl: './outcome-map.page.scss',
})
export class OutcomeMapPage implements OnInit {
  protected readonly facade = inject(OutcomeFacade);
  private readonly courses = inject(CourseRepository);
  private readonly router = inject(Router);

  /** Route query parametreleri. */
  readonly courseId = input<string | null>(null);
  readonly focus = input<string | null>(null);

  private readonly courseOptionsState = signal<readonly SelectOption[]>([]);
  private readonly selectedCourseState = signal<string>('');
  private readonly selectedNodeState = signal<OutcomeGraphNode | null>(null);

  readonly courseOptions = computed<readonly SelectOption[]>(() => [
    { value: '', label: 'Tüm dersler' },
    ...this.courseOptionsState(),
  ]);
  readonly selectedCourse = this.selectedCourseState.asReadonly();
  readonly selectedNode = this.selectedNodeState.asReadonly();

  readonly cycleCodes = computed(() => {
    const graph = this.facade.graph();
    if (!graph) return [];

    const codeOf = new Map(graph.nodes.map((node) => [node.id, node.code] as const));
    return graph.cycles.map((cycle) =>
      [...cycle, cycle[0]].map((id) => codeOf.get(id) ?? id).join(' → '),
    );
  });

  readonly nodeCount = computed(() => this.facade.graph()?.nodes.length ?? 0);
  readonly edgeCount = computed(() => this.facade.graph()?.edges.length ?? 0);

  constructor() {
    // Route'tan gelen ders seçimi grafiği yükler; seçim değişince yeniden çekilir.
    effect(() => {
      const routeCourseId = this.courseId();
      if (routeCourseId !== null) this.selectedCourseState.set(routeCourseId);
    });

    effect(() => {
      const courseId = this.selectedCourseState();
      this.facade.loadGraph(courseId === '' ? null : courseId);
    });
  }

  ngOnInit(): void {
    this.courses.list(createPageRequest({ size: 200 })).subscribe({
      next: (page) =>
        this.courseOptionsState.set(
          page.items.map((course) => ({
            value: course.id,
            label: `${course.code} · ${course.name}`,
          })),
        ),
    });
  }

  onCourseChange(courseId: string): void {
    this.selectedCourseState.set(courseId);
    this.selectedNodeState.set(null);
  }

  onNodeSelect(node: OutcomeGraphNode): void {
    this.selectedNodeState.set(node);
  }

  openOutcome(node: OutcomeGraphNode): void {
    void this.router.navigate(['/outcomes', node.id]);
  }

  openList(): void {
    const courseId = this.selectedCourseState();
    void this.router.navigate(['/outcomes'], {
      queryParams: courseId ? { courseId } : undefined,
    });
  }

  reload(): void {
    const courseId = this.selectedCourseState();
    this.facade.loadGraph(courseId === '' ? null : courseId);
  }
}
