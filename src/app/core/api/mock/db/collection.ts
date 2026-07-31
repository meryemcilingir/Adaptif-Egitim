import { PageRequest, PageResponse } from '../../page-request';
import { QueryConfig, runQuery } from './query-engine';

export interface Identified {
  readonly id: string;
}

/**
 * Bellek içi koleksiyon — tek bir "tablo".
 * Değişikliklerde `onChange` tetiklenir; `FakeDb` bunu kalıcılaştırma için kullanır.
 */
export class Collection<T extends Identified> {
  private records: T[];

  constructor(
    readonly name: string,
    seed: readonly T[],
    private readonly onChange: () => void,
  ) {
    this.records = [...seed];
  }

  all(): readonly T[] {
    return this.records;
  }

  findById(id: string): T | undefined {
    return this.records.find((record) => record.id === id);
  }

  findOne(predicate: (item: T) => boolean): T | undefined {
    return this.records.find(predicate);
  }

  filter(predicate: (item: T) => boolean): T[] {
    return this.records.filter(predicate);
  }

  count(predicate?: (item: T) => boolean): number {
    return predicate ? this.records.filter(predicate).length : this.records.length;
  }

  query(request: PageRequest, config: QueryConfig<T>): PageResponse<T> {
    return runQuery(this.records, request, config);
  }

  /** Önce belirli bir kapsama daralt, sonra sorgula (veri kapsamı kuralı). */
  queryWithin(
    scope: (item: T) => boolean,
    request: PageRequest,
    config: QueryConfig<T>,
  ): PageResponse<T> {
    return runQuery(this.records.filter(scope), request, config);
  }

  insert(record: T): T {
    this.records = [record, ...this.records];
    this.onChange();
    return record;
  }

  insertMany(records: readonly T[]): void {
    this.records = [...records, ...this.records];
    this.onChange();
  }

  /** Kısmi güncelleme; kayıt yoksa `undefined` döner (handler 404 üretir). */
  update(id: string, patch: Partial<T>): T | undefined {
    const index = this.records.findIndex((record) => record.id === id);
    if (index === -1) return undefined;

    const updated = { ...this.records[index]!, ...patch };
    this.records = this.records.map((record, i) => (i === index ? updated : record));
    this.onChange();
    return updated;
  }

  replace(record: T): T {
    const exists = this.records.some((current) => current.id === record.id);
    this.records = exists
      ? this.records.map((current) => (current.id === record.id ? record : current))
      : [record, ...this.records];
    this.onChange();
    return record;
  }

  remove(id: string): boolean {
    const next = this.records.filter((record) => record.id !== id);
    if (next.length === this.records.length) return false;

    this.records = next;
    this.onChange();
    return true;
  }

  removeWhere(predicate: (item: T) => boolean): number {
    const before = this.records.length;
    this.records = this.records.filter((record) => !predicate(record));
    if (this.records.length !== before) this.onChange();
    return before - this.records.length;
  }
}
