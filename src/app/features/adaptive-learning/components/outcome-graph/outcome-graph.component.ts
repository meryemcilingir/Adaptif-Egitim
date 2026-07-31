import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

import { OutcomeGraph, OutcomeGraphNode } from '../../models/learning-outcome.model';
import { NODE_HEIGHT, NODE_WIDTH, PositionedNode, layoutGraph } from './graph-layout';

/**
 * Kazanım önkoşul grafiği.
 *
 * · Düğüm tabanlı, katmanlı yerleşim (soldan sağa önkoşul akışı).
 * · Önkoşul (parent) → bağımlı (child) kenarları ok ile gösterilir.
 * · Döngüye dâhil kenarlar kırmızı ve kesikli çizilir (BR-01).
 * · Odak modu: bir düğüm seçildiğinde yalnızca komşuları vurgulanır — yüzlerce
 *   düğümde bile grafik okunabilir kalır.
 *
 * Yerleşim hesabı ayrı bir saf modüldedir (`graph-layout.ts`); bu bileşen
 * yalnızca çizim ve etkileşimden sorumludur (SRP).
 */
@Component({
  selector: 'app-outcome-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './outcome-graph.component.html',
  styleUrl: './outcome-graph.component.scss',
})
export class OutcomeGraphComponent {
  readonly graph = input.required<OutcomeGraph>();
  /** Dışarıdan (ör. route query) gelen odak düğümü. */
  readonly focusId = input<string | null>(null);
  readonly highlightCycles = input(true);

  readonly nodeSelect = output<OutcomeGraphNode>();

  readonly nodeWidth = NODE_WIDTH;
  readonly nodeHeight = NODE_HEIGHT;

  private readonly hoveredState = signal<string | null>(null);
  private readonly selectedState = signal<string | null>(null);

  readonly layout = computed(() => layoutGraph(this.graph()));

  /** Odak: seçili düğüm > üzerine gelinen düğüm > route'tan gelen düğüm. */
  readonly activeId = computed(() => this.selectedState() ?? this.hoveredState() ?? this.focusId());

  /** Odaktaki düğüm ve doğrudan komşuları — diğerleri soluklaşır. */
  readonly neighbourIds = computed(() => {
    const active = this.activeId();
    if (!active) return null;

    const ids = new Set<string>([active]);
    for (const edge of this.graph().edges) {
      if (edge.from === active) ids.add(edge.to);
      if (edge.to === active) ids.add(edge.from);
    }
    return ids;
  });

  readonly cycleNodeIds = computed(() => new Set(this.graph().cycles.flat()));

  isDimmed(nodeId: string): boolean {
    const neighbours = this.neighbourIds();
    return neighbours !== null && !neighbours.has(nodeId);
  }

  isEdgeDimmed(from: string, to: string): boolean {
    const active = this.activeId();
    if (active === null) return false;
    return from !== active && to !== active;
  }

  /** SVG metni kırpılmaz; başlık düğüm kutusuna sığacak uzunlukta kesilir. */
  shortTitle(title: string): string {
    return title.length > 26 ? `${title.slice(0, 25)}…` : title;
  }

  isInCycle(nodeId: string): boolean {
    return this.highlightCycles() && this.cycleNodeIds().has(nodeId);
  }

  isSelected(nodeId: string): boolean {
    return this.selectedState() === nodeId;
  }

  onHover(nodeId: string | null): void {
    this.hoveredState.set(nodeId);
  }

  onSelect(node: PositionedNode): void {
    // Aynı düğüme tekrar tıklamak odağı kaldırır.
    this.selectedState.update((current) => (current === node.id ? null : node.id));
    this.nodeSelect.emit(node);
  }

  onKeydown(event: KeyboardEvent, node: PositionedNode): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.onSelect(node);
  }

  clearFocus(): void {
    this.selectedState.set(null);
    this.hoveredState.set(null);
  }
}
