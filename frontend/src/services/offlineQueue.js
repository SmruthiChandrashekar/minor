/**
 * Offline Queue — IndexedDB-backed complaint queue for offline submissions.
 *
 * When the user is offline:
 *   1. saveToQueue(payload) stores the complaint in IndexedDB.
 *   2. A "Saved offline" notification is shown.
 *
 * When the user comes back online:
 *   flushQueue() replays every queued complaint against the real API,
 *   deletes the entry on success, and notifies the user.
 */

const DB_NAME = "puravankara_offline";
const DB_VERSION = 1;
const STORE_NAME = "pending_complaints";

// ── Open / create IndexedDB ──
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Save a complaint payload to the queue ──
export async function saveToQueue(payload) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.add({
      payload,
      timestamp: new Date().toISOString(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Get all queued complaints ──
export async function getQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ── Delete a single entry by id ──
async function deleteFromQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Flush every queued complaint to the real API ──
export async function flushQueue() {
  const items = await getQueue();
  if (items.length === 0) return 0;

  let synced = 0;

  for (const item of items) {
    try {
      // Dynamically import to avoid circular deps
      const { apiClient } = await import("./api.js");
      const res = await apiClient("/submit-complaint", {
        method: "POST",
        body: JSON.stringify(item.payload),
      });

      if (res.ok) {
        await deleteFromQueue(item.id);
        synced++;
      }
    } catch (err) {
      // Still offline or server error — leave in queue for next attempt
      console.warn("[OfflineQueue] Failed to sync item", item.id, err);
    }
  }

  return synced;
}

// ── Get count of pending items ──
export async function getQueueCount() {
  const items = await getQueue();
  return items.length;
}
