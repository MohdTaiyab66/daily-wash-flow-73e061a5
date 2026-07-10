const DB_NAME = "urbanwash-photo-upload-queue";
const STORE_NAME = "photos";
const DB_VERSION = 1;

type StoredPhoto = {
  key: string;
  blob: Blob;
  name: string;
  type: string;
  lastModified: number;
  savedAt: number;
};

function openPhotoDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

function runStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openPhotoDb().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = action(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
      tx.onabort = () => db.close();
    });
  });
}

export async function saveQueuedPhoto(key: string, file: File) {
  await runStore("readwrite", (store) =>
    store.put({
      key,
      blob: file,
      name: file.name,
      type: file.type || "image/jpeg",
      lastModified: file.lastModified || Date.now(),
      savedAt: Date.now(),
    } satisfies StoredPhoto),
  );
}

export async function loadQueuedPhoto(key: string): Promise<File | null> {
  const stored = await runStore<StoredPhoto>("readonly", (store) => store.get(key));
  if (!stored?.blob) return null;
  return new File([stored.blob], stored.name || `queued-${Date.now()}.jpg`, {
    type: stored.type || stored.blob.type || "image/jpeg",
    lastModified: stored.lastModified || stored.savedAt || Date.now(),
  });
}

export async function deleteQueuedPhoto(key: string) {
  await runStore("readwrite", (store) => store.delete(key));
}