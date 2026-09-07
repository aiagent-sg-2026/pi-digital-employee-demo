export const DEMO_LEDGER_DB_NAME = "digital-employee-dashboard-v1";
export const DEMO_LEDGER_DB_VERSION = 1;
export const DEMO_LEDGER_STORE = "dashboard-state";
export const DEMO_LEDGER_KEY = "ledger";
export const LEGACY_LOCAL_STORAGE_KEY = "digital-employee-dashboard-v1-ledger";

interface StoredRecord<T> {
  id: string;
  value: T;
  updatedAt: string;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DEMO_LEDGER_DB_NAME, DEMO_LEDGER_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEMO_LEDGER_STORE)) {
        db.createObjectStore(DEMO_LEDGER_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open demo ledger database."));
    request.onblocked = () => reject(new Error("Demo ledger database upgrade is blocked by another tab."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export async function readDemoLedger<T>(): Promise<T | null> {
  const db = await openDatabase();
  try {
    const transaction = db.transaction(DEMO_LEDGER_STORE, "readonly");
    const record = await requestResult(transaction.objectStore(DEMO_LEDGER_STORE).get(DEMO_LEDGER_KEY)) as StoredRecord<T> | undefined;
    return record?.value ?? null;
  } finally {
    db.close();
  }
}

export async function writeDemoLedger<T>(value: T): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DEMO_LEDGER_STORE, "readwrite");
      transaction.objectStore(DEMO_LEDGER_STORE).put({
        id: DEMO_LEDGER_KEY,
        value,
        updatedAt: new Date().toISOString(),
      } satisfies StoredRecord<T>);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save demo ledger."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Demo ledger save was aborted."));
    });
  } finally {
    db.close();
  }
}

export async function clearDemoLedger(): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(DEMO_LEDGER_STORE, "readwrite");
      transaction.objectStore(DEMO_LEDGER_STORE).delete(DEMO_LEDGER_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Unable to clear demo ledger."));
      transaction.onabort = () => reject(transaction.error ?? new Error("Demo ledger clear was aborted."));
    });
  } finally {
    db.close();
  }
}

export async function migrateLegacyLocalStorageLedger<T>(): Promise<boolean> {
  const existing = await readDemoLedger<T>();
  if (existing !== null) {
    localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
    return false;
  }

  const legacyRaw = localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
  if (!legacyRaw) return false;

  let parsed: T;
  try {
    parsed = JSON.parse(legacyRaw) as T;
  } catch {
    localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
    return false;
  }

  await writeDemoLedger(parsed);
  localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
  return true;
}
