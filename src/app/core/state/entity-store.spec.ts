import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/api-error';
import { EntityStore } from './entity-store';

interface Row {
  readonly id: string;
  readonly name: string;
  readonly score: number;
}

function row(id: string, name = `Kayıt ${id}`, score = 10): Row {
  return { id, name, score };
}

function createStore(): EntityStore<Row> {
  return new EntityStore<Row>();
}

describe('EntityStore', () => {
  it('başlangıçta boş ve idle durumdadır', () => {
    const store = createStore();

    expect(store.items()).toEqual([]);
    expect(store.status()).toBe('idle');
    expect(store.isEmpty()).toBe(false);
  });

  it('ilk yüklemede loading, veri varken tazelemede refreshing olur', () => {
    const store = createStore();

    store.setLoading();
    expect(store.status()).toBe('loading');

    store.setPage({ items: [row('1')], total: 1, page: 1, size: 20 });
    store.setLoading();
    expect(store.status()).toBe('refreshing');
    // Tazelenirken mevcut veri korunur — ekran boşalmaz.
    expect(store.items()).toHaveLength(1);
  });

  it('sonuç boş dönerse isEmpty işaretlenir', () => {
    const store = createStore();

    store.setPage({ items: [], total: 0, page: 1, size: 20 });

    expect(store.isEmpty()).toBe(true);
    expect(store.hasError()).toBe(false);
  });

  it('hata durumunu saklar', () => {
    const store = createStore();
    const error = ApiError.of('NETWORK');

    store.setError(error);

    expect(store.hasError()).toBe(true);
    expect(store.error()).toBe(error);
  });

  it('filtre değişince sayfayı 1e döndürür', () => {
    const store = createStore();

    store.patchQuery({ page: 4 });
    expect(store.query().page).toBe(4);

    store.setFilter('state', ['PUBLISHED']);
    expect(store.query().page).toBe(1);
    expect(store.query().filters['state']).toEqual(['PUBLISHED']);
  });

  it('sayfa değişiminde sayfayı sıfırlamaz', () => {
    const store = createStore();
    store.setPage({ items: [row('1')], total: 100, page: 1, size: 20 });

    store.patchQuery({ page: 3 });

    expect(store.query().page).toBe(3);
  });

  it('sıralamayı yok → asc → desc → yok döngüsünde değiştirir', () => {
    const store = createStore();

    store.toggleSort('name');
    expect(store.query().sort).toEqual({ field: 'name', direction: 'asc' });

    store.toggleSort('name');
    expect(store.query().sort).toEqual({ field: 'name', direction: 'desc' });

    store.toggleSort('name');
    expect(store.query().sort).toBeNull();
  });

  it('aktif filtre sayısını ve filtreli olma durumunu hesaplar', () => {
    const store = createStore();

    store.patchQuery({ filters: { state: ['DRAFT'], courseId: null, search: '' } });

    expect(store.activeFilterCount()).toBe(1);
    expect(store.isFiltered()).toBe(true);

    store.clearFilters();
    expect(store.activeFilterCount()).toBe(0);
    expect(store.isFiltered()).toBe(false);
  });

  it('sayfa sayısını toplam ve boyuta göre hesaplar', () => {
    const store = createStore();

    // Sayfa sayısı SORGUDAKİ boyuta göre hesaplanır; yanıt boyutu bilgilendirmedir.
    store.patchQuery({ size: 20 });
    store.setPage({ items: [row('1')], total: 45, page: 1, size: 20 });

    expect(store.pageCount()).toBe(3);
  });

  it('sayfa numarasını geçerli aralığa sıkıştırır', () => {
    const store = createStore();
    store.patchQuery({ size: 20 });
    store.setPage({ items: [row('1')], total: 45, page: 1, size: 20 });

    store.goToPage(99);
    expect(store.query().page).toBe(3);

    store.goToPage(-5);
    expect(store.query().page).toBe(1);
  });

  it('upsert var olan kaydı günceller, yeni kaydı başa ekler', () => {
    const store = createStore();
    store.setPage({ items: [row('1'), row('2')], total: 2, page: 1, size: 20 });

    store.upsert({ id: '2', name: 'Güncellendi', score: 99 });
    expect(store.items()[1]!.name).toBe('Güncellendi');
    expect(store.total()).toBe(2);

    store.upsert(row('3'));
    expect(store.items()[0]!.id).toBe('3');
    expect(store.total()).toBe(3);
  });

  it('optimistic güncellemeyi uygular ve satırı mutating işaretler', () => {
    const store = createStore();
    store.setPage({ items: [row('1', 'İlk', 10)], total: 1, page: 1, size: 20 });

    store.applyOptimistic('1', { name: 'İyimser' });

    expect(store.items()[0]!.name).toBe('İyimser');
    expect(store.isMutating('1')).toBe(true);
  });

  it('başarısız optimistic işlemde önceki duruma geri döner', () => {
    const store = createStore();
    store.setPage({ items: [row('1', 'İlk', 10)], total: 1, page: 1, size: 20 });

    const snapshot = store.snapshot();
    store.applyOptimistic('1', { name: 'İyimser' });
    store.restore(snapshot);

    expect(store.items()[0]!.name).toBe('İlk');
    expect(store.isMutating('1')).toBe(false);
    expect(store.status()).toBe('success');
  });

  it('commit sonrası mutating işareti kalkar', () => {
    const store = createStore();
    store.setPage({ items: [row('1')], total: 1, page: 1, size: 20 });

    store.applyOptimistic('1', { name: 'İyimser' });
    store.commit({ id: '1', name: 'Sunucudan', score: 50 });

    expect(store.isMutating('1')).toBe(false);
    expect(store.items()[0]!.name).toBe('Sunucudan');
  });

  it('seçili kaydı listeden çözer', () => {
    const store = createStore();
    store.setPage({ items: [row('1'), row('2')], total: 2, page: 1, size: 20 });

    store.select('2');

    expect(store.selected()?.id).toBe('2');
  });
});
