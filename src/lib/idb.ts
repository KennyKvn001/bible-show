import type { BibleData, Translation } from './bible.ts';

// Imported Bibles live in this browser's IndexedDB only; nothing is uploaded anywhere.
const DB = 'bible-show';
const STORE = 'imported';

interface Row {
  meta: Translation;
  data: BibleData;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'meta.id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const listImported = () => run<Row[]>('readonly', (s) => s.getAll()).then((rows) => rows.map((r) => r.meta));
export const getImported = (id: string) => run<Row | undefined>('readonly', (s) => s.get(id)).then((r) => r?.data);
export const saveImported = (meta: Translation, data: BibleData) => run('readwrite', (s) => s.put({ meta, data }));
export const deleteImported = (id: string) => run('readwrite', (s) => s.delete(id));
