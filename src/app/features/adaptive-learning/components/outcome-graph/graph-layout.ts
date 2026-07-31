import {
  OutcomeGraph,
  OutcomeGraphEdge,
  OutcomeGraphNode,
} from '../../models/learning-outcome.model';

/**
 * Kazanım grafiğinin yerleşim hesabı.
 *
 * SAF fonksiyon: SVG boyutları ve düğüm koordinatları burada üretilir, çizim
 * bileşeni yalnızca sonucu render eder. Böylece yerleşim algoritması bağımsız
 * olarak değiştirilebilir (ör. ileride kuvvet tabanlı yerleşime geçilebilir)
 * ve test edilebilir kalır.
 *
 * Yerleşim KATMANLIDIR: yatay eksen topolojik derinlik (önkoşul zinciri),
 * dikey eksen aynı derinlikteki düğümlerin sırasıdır. Bu, önkoşul akışını
 * soldan sağa okunabilir kılar.
 */

export const NODE_WIDTH = 190;
export const NODE_HEIGHT = 64;
export const COLUMN_GAP = 90;
export const ROW_GAP = 26;
export const PADDING = 32;

export interface PositionedNode extends OutcomeGraphNode {
  readonly x: number;
  readonly y: number;
}

export interface PositionedEdge extends OutcomeGraphEdge {
  /** Kenar yolu (SVG `path` d niteliği). */
  readonly path: string;
  readonly fromLabel: string;
  readonly toLabel: string;
}

export interface GraphLayout {
  readonly nodes: readonly PositionedNode[];
  readonly edges: readonly PositionedEdge[];
  readonly width: number;
  readonly height: number;
  readonly columns: number;
}

export function layoutGraph(graph: OutcomeGraph): GraphLayout {
  if (graph.nodes.length === 0) {
    return { nodes: [], edges: [], width: 0, height: 0, columns: 0 };
  }

  // Düğümleri derinliğe göre kolonlara ayır; kolon içinde koda göre sırala.
  const columns = new Map<number, OutcomeGraphNode[]>();
  for (const node of graph.nodes) {
    const list = columns.get(node.depth) ?? [];
    list.push(node);
    columns.set(node.depth, list);
  }

  for (const list of columns.values()) {
    list.sort((a, b) => a.code.localeCompare(b.code, 'tr-TR'));
  }

  const columnIndexes = [...columns.keys()].sort((a, b) => a - b);
  const tallestColumn = Math.max(...[...columns.values()].map((list) => list.length));

  const positioned: PositionedNode[] = [];
  columnIndexes.forEach((depth, columnIndex) => {
    const list = columns.get(depth)!;
    // Kolonlar dikeyde ortalanır — grafik dengeli görünür.
    const offset = ((tallestColumn - list.length) * (NODE_HEIGHT + ROW_GAP)) / 2;

    list.forEach((node, rowIndex) => {
      positioned.push({
        ...node,
        x: PADDING + columnIndex * (NODE_WIDTH + COLUMN_GAP),
        y: PADDING + offset + rowIndex * (NODE_HEIGHT + ROW_GAP),
      });
    });
  });

  const byId = new Map(positioned.map((node) => [node.id, node] as const));

  const edges: PositionedEdge[] = graph.edges.flatMap((edge) => {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) return [];

    return [
      {
        ...edge,
        path: buildPath(from, to),
        fromLabel: from.code,
        toLabel: to.code,
      },
    ];
  });

  return {
    nodes: positioned,
    edges,
    width:
      PADDING * 2 + columnIndexes.length * NODE_WIDTH + (columnIndexes.length - 1) * COLUMN_GAP,
    height: PADDING * 2 + tallestColumn * NODE_HEIGHT + (tallestColumn - 1) * ROW_GAP,
    columns: columnIndexes.length,
  };
}

/**
 * İki düğüm arasında kübik Bézier eğrisi üretir.
 * Aynı kolondaki düğümler arasında (döngü durumunda) düz çizgi yerine yay çizilir
 * ki kenar düğümlerin arkasında kaybolmasın.
 */
function buildPath(from: PositionedNode, to: PositionedNode): string {
  const startX = from.x + NODE_WIDTH;
  const startY = from.y + NODE_HEIGHT / 2;
  const endX = to.x;
  const endY = to.y + NODE_HEIGHT / 2;

  // Geriye doğru kenar (döngü): düğümlerin altından dolanan bir yay.
  if (endX <= startX) {
    const midY = Math.max(startY, endY) + NODE_HEIGHT;
    return `M${startX},${startY} C${startX + 60},${midY} ${endX - 60},${midY} ${endX},${endY}`;
  }

  const controlOffset = Math.max(40, (endX - startX) / 2);
  return `M${startX},${startY} C${startX + controlOffset},${startY} ${endX - controlOffset},${endY} ${endX},${endY}`;
}
