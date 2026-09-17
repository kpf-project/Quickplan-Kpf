"use client";

export const DAILY_WORK_OUTBOX_CHANGE_EVENT = "kpf:daily-work-outbox-change";

const DB_NAME = "kpf-offline";
const DB_VERSION = 1;
const OUTBOX_STORE = "dailyWorkOutbox";
const LOOKUP_CACHE_STORE = "dailyWorkLookupCache";
const DAILY_WORK_ENDPOINT = "/api/attendance/daily-work";

let dbPromise = null;

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function createIndexedDbError() {
  return new Error("Offline storage is unavailable on this device.");
}

function openDatabase() {
  if (!canUseIndexedDb()) {
    return Promise.reject(createIndexedDbError());
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          const outboxStore = db.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
          outboxStore.createIndex("status", "status", { unique: false });
          outboxStore.createIndex("createdAt", "createdAt", { unique: false });
          outboxStore.createIndex("employeeCode", "employeeCode", { unique: false });
        }

        if (!db.objectStoreNames.contains(LOOKUP_CACHE_STORE)) {
          const lookupStore = db.createObjectStore(LOOKUP_CACHE_STORE, { keyPath: "employeeCode" });
          lookupStore.createIndex("updatedAt", "updatedAt", { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || createIndexedDbError());
    }).catch((error) => {
      dbPromise = null;
      throw error;
    });
  }

  return dbPromise;
}

function runRequest(request, transaction) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error || transaction?.error || createIndexedDbError());
    };

    request.onsuccess = () => {
      const result = request.result;
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
    };

    request.onerror = () => fail(request.error);
    transaction.onerror = () => fail(transaction.error);
    transaction.onabort = () => fail(transaction.error);
  });
}

async function getRecord(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  return runRequest(store.get(key), transaction);
}

async function getAllRecords(storeName) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  return runRequest(store.getAll(), transaction);
}

async function putRecord(storeName, value) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  return runRequest(store.put(value), transaction);
}

async function deleteRecord(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  return runRequest(store.delete(key), transaction);
}

function notifyOutboxChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DAILY_WORK_OUTBOX_CHANGE_EVENT));
}

function normalizeEmployeeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeRecordId(payload) {
  const requestId = String(payload?.requestId || "").trim();
  if (!requestId) {
    throw new Error("requestId is required for offline queueing.");
  }
  return requestId;
}

export async function queueDailyWorkSubmission(payload, options = {}) {
  const id = normalizeRecordId(payload);
  const existing = await getRecord(OUTBOX_STORE, id).catch(() => null);
  const now = new Date().toISOString();

  const nextRecord = {
    id,
    requestId: id,
    endpoint: DAILY_WORK_ENDPOINT,
    method: "POST",
    employeeCode: normalizeEmployeeCode(payload?.employeeCode || payload?.scanResult),
    status: "pending",
    attemptCount: Number(existing?.attemptCount || 0),
    nextRetryAt: now,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    lastError: options.lastError || null,
    queuedReason: options.queuedReason || existing?.queuedReason || null,
    payload,
  };

  await putRecord(OUTBOX_STORE, nextRecord);
  notifyOutboxChanged();

  return {
    id,
    existed: Boolean(existing),
    record: nextRecord,
  };
}

export async function getDueDailyWorkOutboxEntries(limit = 10) {
  const now = Date.now();
  const records = await getAllRecords(OUTBOX_STORE).catch(() => []);

  return records
    .filter((record) => record?.status === "pending")
    .filter((record) => {
      if (!record?.nextRetryAt) return true;
      const retryAt = Date.parse(record.nextRetryAt);
      return Number.isNaN(retryAt) || retryAt <= now;
    })
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0))
    .slice(0, Math.max(1, limit));
}

export async function markDailyWorkOutboxRetry(id, updates = {}) {
  const existing = await getRecord(OUTBOX_STORE, id);
  if (!existing) return null;

  const nextRecord = {
    ...existing,
    status: "pending",
    attemptCount: Number(updates.attemptCount ?? existing.attemptCount ?? 0),
    nextRetryAt: updates.nextRetryAt || existing.nextRetryAt || new Date().toISOString(),
    lastError: updates.lastError || existing.lastError || null,
    updatedAt: new Date().toISOString(),
  };

  await putRecord(OUTBOX_STORE, nextRecord);
  notifyOutboxChanged();
  return nextRecord;
}

export async function markDailyWorkOutboxFailed(id, updates = {}) {
  const existing = await getRecord(OUTBOX_STORE, id);
  if (!existing) return null;

  const nextRecord = {
    ...existing,
    status: "failed",
    attemptCount: Number(updates.attemptCount ?? existing.attemptCount ?? 0),
    nextRetryAt: null,
    lastError: updates.lastError || existing.lastError || null,
    updatedAt: new Date().toISOString(),
  };

  await putRecord(OUTBOX_STORE, nextRecord);
  notifyOutboxChanged();
  return nextRecord;
}

export async function markDailyWorkOutboxReadyToPrint(id, updates = {}) {
  const existing = await getRecord(OUTBOX_STORE, id);
  if (!existing) return null;

  const nextRecord = {
    ...existing,
    status: "ready_to_print",
    nextRetryAt: null,
    lastError: null,
    syncedAt: updates.syncedAt || new Date().toISOString(),
    syncedData: updates.syncedData || existing.syncedData || null,
    duplicated: Boolean(updates.duplicated),
    updatedAt: new Date().toISOString(),
  };

  await putRecord(OUTBOX_STORE, nextRecord);
  notifyOutboxChanged();
  return nextRecord;
}

export async function markDailyWorkOutboxPrinted(id, updates = {}) {
  const existing = await getRecord(OUTBOX_STORE, id);
  if (!existing) return null;

  const nextRecord = {
    ...existing,
    status: "printed",
    printedAt: updates.printedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await putRecord(OUTBOX_STORE, nextRecord);
  notifyOutboxChanged();
  return nextRecord;
}

export async function removeDailyWorkOutboxEntry(id) {
  await deleteRecord(OUTBOX_STORE, id);
  notifyOutboxChanged();
}

export async function getNextDailyWorkReadyToPrintEntry() {
  const records = await getAllRecords(OUTBOX_STORE).catch(() => []);

  const nextRecord = records
    .filter((record) => record?.status === "ready_to_print")
    .sort((a, b) => {
      const left = Date.parse(a.syncedAt || a.createdAt || 0);
      const right = Date.parse(b.syncedAt || b.createdAt || 0);
      return left - right;
    })[0];

  return nextRecord || null;
}

export async function getDailyWorkReadyToPrintEntries(limit = 20) {
  const records = await getAllRecords(OUTBOX_STORE).catch(() => []);

  return records
    .filter((record) => record?.status === "ready_to_print")
    .sort((a, b) => {
      const left = Date.parse(a.syncedAt || a.createdAt || 0);
      const right = Date.parse(b.syncedAt || b.createdAt || 0);
      return left - right;
    })
    .slice(0, Math.max(1, limit));
}

export async function getDailyWorkOutboxSummary() {
  const records = await getAllRecords(OUTBOX_STORE).catch(() => []);
  const pendingCount = records.filter((record) => record?.status === "pending").length;
  const failedCount = records.filter((record) => record?.status === "failed").length;
  const readyToPrintCount = records.filter((record) => record?.status === "ready_to_print").length;
  const printedCount = records.filter((record) => record?.status === "printed").length;

  return {
    pendingCount,
    failedCount,
    readyToPrintCount,
    printedCount,
    totalCount: records.length,
  };
}

export async function cacheDailyWorkEmployeeLookup(employeeCode, payload) {
  const normalizedEmployeeCode = normalizeEmployeeCode(employeeCode);
  if (!normalizedEmployeeCode || !payload) return;

  await putRecord(LOOKUP_CACHE_STORE, {
    employeeCode: normalizedEmployeeCode,
    payload,
    updatedAt: new Date().toISOString(),
  });
}

export async function getCachedDailyWorkEmployeeLookup(employeeCode) {
  const normalizedEmployeeCode = normalizeEmployeeCode(employeeCode);
  if (!normalizedEmployeeCode) return null;

  const record = await getRecord(LOOKUP_CACHE_STORE, normalizedEmployeeCode).catch(() => null);
  return record?.payload || null;
}
