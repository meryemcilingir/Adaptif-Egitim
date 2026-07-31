import { describe, expect, it } from 'vitest';

import { createPageRequest } from '../../page-request';
import {
  QueryConfig,
  booleanFlag,
  equals,
  inList,
  includesId,
  normalize,
  runQuery,
} from './query-engine';

interface Item {
  readonly id: string;
  readonly title: string;
  readonly state: string;
  readonly courseId: string;
  readonly tags: readonly string[];
  readonly score: number;
  readonly flagged: boolean;
}

const ITEMS: readonly Item[] = [
  {
    id: '1',
    title: 'Limit kavramı',
    state: 'PUBLISHED',
    courseId: 'c1',
    tags: ['temel'],
    score: 80,
    flagged: false,
  },
  {
    id: '2',
    title: 'Türev kuralları',
    state: 'DRAFT',
    courseId: 'c1',
    tags: ['uygulama'],
    score: 55,
    flagged: true,
  },
  {
    id: '3',
    title: 'İntegral teknikleri',
    state: 'PUBLISHED',
    courseId: 'c2',
    tags: ['temel', 'yorum'],
    score: 92,
    flagged: false,
  },
  {
    id: '4',
    title: 'Şekil ve çizim',
    state: 'REVIEW',
    courseId: 'c2',
    tags: ['grafik'],
    score: 41,
    flagged: true,
  },
];

const CONFIG: QueryConfig<Item> = {
  searchable: (item) => [item.title, ...item.tags],
  filters: {
    state: inList((item) => item.state),
    courseId: equals((item) => item.courseId),
    tags: includesId((item) => item.tags),
    flagged: booleanFlag((item) => item.flagged),
  },
  defaultSort: { field: 'title', direction: 'asc' },
};

describe('normalize', () => {
  it('Türkçe büyük/küçük harf ve aksanı normalleştirir', () => {
    expect(normalize('İNTEGRAL')).toBe(normalize('integral'));
    expect(normalize('  Şekil ')).toBe(normalize('şekil'));
  });
});

describe('runQuery', () => {
  it('arama terimini başlıkta ve etiketlerde arar', () => {
    const result = runQuery(ITEMS, createPageRequest({ search: 'türev' }), CONFIG);

    expect(result.items.map((item) => item.id)).toEqual(['2']);
  });

  it('aramada büyük/küçük harf ve Türkçe karakter farkını yok sayar', () => {
    const result = runQuery(ITEMS, createPageRequest({ search: 'İNTEGRAL' }), CONFIG);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe('3');
  });

  it('çoklu seçim filtresinde herhangi bir eşleşmeyi kabul eder', () => {
    const result = runQuery(
      ITEMS,
      createPageRequest({ filters: { state: ['PUBLISHED', 'REVIEW'] } }),
      CONFIG,
    );

    expect(result.items.map((item) => item.id).sort()).toEqual(['1', '3', '4']);
  });

  it('dizi alanında kesişim arar', () => {
    const result = runQuery(ITEMS, createPageRequest({ filters: { tags: ['temel'] } }), CONFIG);

    // Varsayılan sıralama başlığa göre ve Türkçe alfabede "İ" harfi "L"den önce gelir.
    expect(result.items.map((item) => item.id)).toEqual(['3', '1']);
  });

  it('boş filtre değerlerini yok sayar', () => {
    const result = runQuery(
      ITEMS,
      createPageRequest({ filters: { state: [], courseId: null } }),
      CONFIG,
    );

    expect(result.total).toBe(ITEMS.length);
  });

  it('tanımsız filtre anahtarını sessizce yok sayar', () => {
    const result = runQuery(ITEMS, createPageRequest({ filters: { bilinmeyen: 'x' } }), CONFIG);

    expect(result.total).toBe(ITEMS.length);
  });

  it('sıralamayı yön bilgisiyle uygular', () => {
    const ascending = runQuery(
      ITEMS,
      createPageRequest({ sort: { field: 'score', direction: 'asc' } }),
      CONFIG,
    );
    const descending = runQuery(
      ITEMS,
      createPageRequest({ sort: { field: 'score', direction: 'desc' } }),
      CONFIG,
    );

    expect(ascending.items[0]!.score).toBe(41);
    expect(descending.items[0]!.score).toBe(92);
  });

  it('sayfalar ve toplam sayıyı filtreden SONRA hesaplar', () => {
    const result = runQuery(
      ITEMS,
      createPageRequest({ page: 2, size: 2, filters: { state: ['PUBLISHED', 'REVIEW'] } }),
      CONFIG,
    );

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.page).toBe(2);
  });

  it('kaynak diziyi değiştirmez', () => {
    const snapshot = [...ITEMS];

    runQuery(ITEMS, createPageRequest({ sort: { field: 'score', direction: 'desc' } }), CONFIG);

    expect(ITEMS).toEqual(snapshot);
  });
});
