/**
 * Kazanım önkoşul grafiği kuralları (BR-01).
 *
 * SAF fonksiyonlar: yalnızca kimlik listeleriyle çalışır, domain modeline bağımlı
 * değildir. Hem istemci (form doğrulaması) hem mock backend (kayıt reddi) aynı
 * fonksiyonları kullanır — iki taraf farklı davranamaz.
 */

/** Düğüm kimliği → önkoşul kimlikleri. */
export type PrerequisiteMap = ReadonlyMap<string, readonly string[]>;

export interface CycleReport {
  /** Döngüye dâhil düğüm kimlikleri, döngü sırasıyla. */
  readonly cycles: readonly (readonly string[])[];
  readonly hasCycle: boolean;
}

/**
 * Tüm döngüleri bulur (DFS renklendirme).
 * Aynı döngü birden çok kez raporlanmaz; başlangıç düğümü normalize edilir.
 */
export function detectCycles(graph: PrerequisiteMap): CycleReport {
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const found = new Map<string, readonly string[]>();

  const visit = (id: string): void => {
    const current = state.get(id);
    if (current === 'done') return;

    if (current === 'visiting') {
      const start = stack.indexOf(id);
      if (start !== -1) {
        const cycle = stack.slice(start);
        found.set(cycleKey(cycle), cycle);
      }
      return;
    }

    state.set(id, 'visiting');
    stack.push(id);
    for (const next of graph.get(id) ?? []) {
      if (graph.has(next)) visit(next);
    }
    stack.pop();
    state.set(id, 'done');
  };

  for (const id of graph.keys()) visit(id);

  const cycles = [...found.values()];
  return { cycles, hasCycle: cycles.length > 0 };
}

/**
 * `candidate`, `outcomeId`'ye önkoşul olarak eklenirse döngü oluşur mu?
 *
 * Kenar yönü: önkoşul → bağımlı. Yeni kenar `candidate → outcomeId` olur.
 * Döngü ancak `outcomeId` zaten `candidate`'in önkoşul zincirinde geçiyorsa oluşur.
 *
 * Dönen değer okunabilir döngü yoludur ve **kapalı** biçimdedir:
 * `[outcomeId, …, candidate, outcomeId]` — kullanıcı zinciri baştan sona okur.
 * Döngü yoksa `null`.
 */
export function findCyclePath(
  graph: PrerequisiteMap,
  outcomeId: string,
  candidate: string,
): readonly string[] | null {
  if (outcomeId === candidate) return [outcomeId, outcomeId];

  // `candidate`'ten `outcomeId`'ye önkoşul zinciri varsa döngü kaçınılmazdır.
  const path = searchPath(graph, candidate, outcomeId, new Set());
  if (!path) return null;

  // `path` = [candidate, …, outcomeId]. Okunabilirlik için akış yönüne çevrilir.
  return [...[...path].reverse(), outcomeId];
}

/** `from` düğümünden `target` düğümüne önkoşul zinciri üzerinden yol arar. */
function searchPath(
  graph: PrerequisiteMap,
  from: string,
  target: string,
  visited: Set<string>,
): readonly string[] | null {
  if (from === target) return [from];
  if (visited.has(from)) return null;

  visited.add(from);
  for (const next of graph.get(from) ?? []) {
    const path = searchPath(graph, next, target, visited);
    if (path) return [from, ...path];
  }
  return null;
}

/**
 * Bir kazanımın TÜM önkoşullarını (dolaylı olanlar dâhil) döndürür.
 * Öğrenme yolu ve kilit gerekçesi hesaplarında kullanılır.
 */
export function transitivePrerequisites(graph: PrerequisiteMap, outcomeId: string): Set<string> {
  const result = new Set<string>();
  const queue = [...(graph.get(outcomeId) ?? [])];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (result.has(current)) continue;
    result.add(current);
    queue.push(...(graph.get(current) ?? []));
  }

  return result;
}

/**
 * Topolojik katman (derinlik) hesaplar — grafiğin dikey yerleşimini belirler.
 * Döngüdeki düğümler 0 katmanında bırakılır (sonsuz özyineleme engellenir).
 */
export function computeDepths(graph: PrerequisiteMap): ReadonlyMap<string, number> {
  const depths = new Map<string, number>();

  const resolve = (id: string, seen: ReadonlySet<string>): number => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;

    const prerequisites = (graph.get(id) ?? []).filter((prerequisiteId) =>
      graph.has(prerequisiteId),
    );
    const value =
      prerequisites.length === 0
        ? 0
        : 1 + Math.max(...prerequisites.map((pid) => resolve(pid, new Set([...seen, id]))));

    depths.set(id, value);
    return value;
  };

  for (const id of graph.keys()) resolve(id, new Set());
  return depths;
}

/** Bir düğümün doğrudan bağımlıları (bu kazanımı önkoşul olarak gösterenler). */
export function directDependents(graph: PrerequisiteMap, outcomeId: string): string[] {
  const dependents: string[] = [];
  for (const [id, prerequisites] of graph) {
    if (prerequisites.includes(outcomeId)) dependents.push(id);
  }
  return dependents;
}

/** Döngüyü kimlik sırasından bağımsız olarak tekilleştirmek için anahtar üretir. */
function cycleKey(cycle: readonly string[]): string {
  const sorted = [...cycle].sort();
  return sorted.join('|');
}
