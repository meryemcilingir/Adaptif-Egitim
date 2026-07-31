import { describe, expect, it } from 'vitest';

import {
  PrerequisiteMap,
  computeDepths,
  detectCycles,
  directDependents,
  findCyclePath,
  transitivePrerequisites,
} from './outcome-graph.rules';

/** `a: []`, `b: ['a']` → b'nin önkoşulu a'dır. */
function graph(entries: Record<string, string[]>): PrerequisiteMap {
  return new Map(Object.entries(entries));
}

describe('detectCycles', () => {
  it('döngüsüz grafikte döngü bulmaz', () => {
    const report = detectCycles(graph({ a: [], b: ['a'], c: ['b'] }));

    expect(report.hasCycle).toBe(false);
    expect(report.cycles).toHaveLength(0);
  });

  it('şartnamedeki üçlü döngüyü yakalar (Angular → TypeScript → Angular)', () => {
    const report = detectCycles(graph({ angular: ['typescript'], typescript: ['angular'] }));

    expect(report.hasCycle).toBe(true);
    expect(report.cycles[0]).toHaveLength(2);
  });

  it('uzun döngüyü yakalar', () => {
    const report = detectCycles(graph({ a: ['c'], b: ['a'], c: ['b'] }));

    expect(report.hasCycle).toBe(true);
    expect(report.cycles[0]).toHaveLength(3);
  });

  it('kendi kendine bağlı düğümü döngü sayar', () => {
    expect(detectCycles(graph({ a: ['a'] })).hasCycle).toBe(true);
  });

  it('aynı döngüyü tekrar tekrar raporlamaz', () => {
    const report = detectCycles(graph({ a: ['b'], b: ['a'], c: ['a'] }));

    expect(report.cycles).toHaveLength(1);
  });

  it('grafikte olmayan kimliklere yapılan atıfları yok sayar', () => {
    expect(detectCycles(graph({ a: ['ghost'] })).hasCycle).toBe(false);
  });
});

describe('findCyclePath', () => {
  it('kendi kendine önkoşul döngüdür', () => {
    expect(findCyclePath(graph({ a: [] }), 'a', 'a')).toEqual(['a', 'a']);
  });

  it('dolaylı döngüyü tespit eder ve kapalı yolu döndürür', () => {
    // b'nin önkoşulu a. Şimdi a'ya b önkoşulu eklenirse döngü oluşur.
    const path = findCyclePath(graph({ a: [], b: ['a'] }), 'a', 'b');

    // Yol kapalıdır: aynı düğümde başlar ve biter.
    expect(path).toEqual(['a', 'b', 'a']);
  });

  it('derin zincirdeki döngüyü bulur', () => {
    const path = findCyclePath(graph({ a: [], b: ['a'], c: ['b'], d: ['c'] }), 'a', 'd');

    expect(path).toEqual(['a', 'b', 'c', 'd', 'a']);
  });

  it('güvenli önkoşulda null döner', () => {
    expect(findCyclePath(graph({ a: [], b: [] }), 'b', 'a')).toBeNull();
  });

  it('paralel dallarda yanlış pozitif üretmez', () => {
    // a ve b bağımsız; c ikisine de bağlanabilir.
    expect(findCyclePath(graph({ a: [], b: [], c: ['a'] }), 'c', 'b')).toBeNull();
  });
});

describe('transitivePrerequisites', () => {
  it('dolaylı önkoşulları da toplar', () => {
    const result = transitivePrerequisites(graph({ a: [], b: ['a'], c: ['b'] }), 'c');

    expect([...result].sort()).toEqual(['a', 'b']);
  });

  it('önkoşulu olmayan kazanımda boş küme döner', () => {
    expect(transitivePrerequisites(graph({ a: [] }), 'a').size).toBe(0);
  });

  it('döngülü grafikte sonsuz döngüye girmez', () => {
    const result = transitivePrerequisites(graph({ a: ['b'], b: ['a'] }), 'a');

    expect(result.size).toBe(2);
  });
});

describe('computeDepths', () => {
  it('önkoşul zincirine göre katman hesaplar', () => {
    const depths = computeDepths(graph({ a: [], b: ['a'], c: ['b'] }));

    expect(depths.get('a')).toBe(0);
    expect(depths.get('b')).toBe(1);
    expect(depths.get('c')).toBe(2);
  });

  it('birden fazla önkoşulda en derin zinciri esas alır', () => {
    const depths = computeDepths(graph({ a: [], b: ['a'], c: [], d: ['b', 'c'] }));

    expect(depths.get('d')).toBe(2);
  });

  it('döngüde sonsuz özyinelemeye girmez', () => {
    const depths = computeDepths(graph({ a: ['b'], b: ['a'] }));

    expect(depths.size).toBe(2);
  });
});

describe('directDependents', () => {
  it('bu kazanımı önkoşul gösterenleri döndürür', () => {
    expect(directDependents(graph({ a: [], b: ['a'], c: ['a'], d: ['b'] }), 'a').sort()).toEqual([
      'b',
      'c',
    ]);
  });

  it('bağımlısı olmayan kazanımda boş dizi döner', () => {
    expect(directDependents(graph({ a: [], b: ['a'] }), 'b')).toEqual([]);
  });
});
