// Tiny IndexedDB key/value store for on-device caches. Every call fails soft (private mode, blocked storage).
const DB = 'betterlift-cache', STORE = 'kv'
let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbp) dbp = new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  }).catch((e) => { dbp = null; throw e })
  return dbp
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return open().then((db) => new Promise<T | undefined>((res, rej) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => res(req ? (req.result as T) : undefined)
    tx.onerror = () => rej(tx.error)
  })).catch(() => undefined)
}

export const idbGet = <T>(key: string) => run<T>('readonly', (s) => s.get(key))
export const idbSet = (key: string, value: unknown) => run('readwrite', (s) => { s.put(value, key) })
export const idbDel = (key: string) => run('readwrite', (s) => { s.delete(key) })
export const idbClear = () => run('readwrite', (s) => { s.clear() })
