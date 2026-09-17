"use client";

import { normalizeEmployeeCode } from "@/lib/employeeCode";
import { findPieceRateBusinessDuplicate } from "@/lib/pieceRateDuplicateGuard";

export const PIECE_RATE_OUTBOX_CHANGE_EVENT = "kpf:piece-rate-outbox-change";
export const PIECE_RATE_MASTER_CHANGE_EVENT = "kpf:piece-rate-master-change";

const DB_NAME = "kpf-piece-rate-offline";
const DB_VERSION = 2;
const OUTBOX_STORE = "pieceRateOutbox";
const PRODUCT_LOOKUP_CACHE_STORE = "pieceRateProductLookupCache";
const EMPLOYEE_LOOKUP_CACHE_STORE = "pieceRateEmployeeLookupCache";
const MASTER_META_STORE = "pieceRateMasterMeta";
const PIECE_RATE_ENDPOINT = "/api/attendance/piece-rate";
const MASTER_META_KEY = "pieceRateMaster";

let dbPromise = null;

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function createIndexedDbError() {
  return new Error("Offline storage is unavailable on this device.");
}

function notifyWindowEvent(eventName) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(eventName));
}

function normalizeProductBarcode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeRecordId(payload) {
  const requestId = String(payload?.requestId || "").trim();
  if (!requestId) {
    throw new Error("requestId is required for offline queueing.");
  }
  return requestId;
}

function defaultMasterMeta() {
  return {
    key: MASTER_META_KEY,
    ready: false,
    syncing: false,
    stale: true,
    hasSeedData: false,
    lastSuccessfulSyncAt: null,
    lastAttemptedSyncAt: null,
    syncStartedAt: null,
    lastError: null,
    productCount: 0,
    employeeCount: 0,
    productUpdatedAt: null,
    employeeUpdatedAt: null,
    updatedAt: new Date().toISOString(),
  };
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
          outboxStore.createIndex("productBarcode", "productBarcode", { unique: false });
        }

        if (!db.objectStoreNames.contains(PRODUCT_LOOKUP_CACHE_STORE)) {
          const productStore = db.createObjectStore(PRODUCT_LOOKUP_CACHE_STORE, { keyPath: "productBarcode" });
          productStore.createIndex("updatedAt", "updatedAt", { unique: false });
          productStore.createIndex("productCode", "productCode", { unique: false });
        }

        if (!db.objectStoreNames.contains(EMPLOYEE_LOOKUP_CACHE_STORE)) {
          const employeeStore = db.createObjectStore(EMPLOYEE_LOOKUP_CACHE_STORE, { keyPath: "employeeCode" });
          employeeStore.createIndex("updatedAt", "updatedAt", { unique: false });
          employeeStore.createIndex("departmentName", "departmentName", { unique: false });
        }

        if (!db.objectStoreNames.contains(MASTER_META_STORE)) {
          db.createObjectStore(MASTER_META_STORE, { keyPath: "key" });
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

async function countRecords(storeName) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  return runRequest(store.count(), transaction);
}

async function clearStore(storeName) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  return runRequest(store.clear(), transaction);
}

async function replaceStoreRecords(storeName, records = [], { keyTransform = (value) => value, reset = true } = {}) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);

  if (reset) {
    store.clear();
  }

  for (const record of records) {
    const normalized = keyTransform(record);
    if (normalized) {
      store.put(normalized);
    }
  }

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || createIndexedDbError());
    transaction.onabort = () => reject(transaction.error || createIndexedDbError());
  });
}

async function updateOutboxRecord(id, updater) {
  const existing = await getRecord(OUTBOX_STORE, id);
  if (!existing) return null;

  const nextRecord = updater(existing);
  await putRecord(OUTBOX_STORE, nextRecord);
  notifyWindowEvent(PIECE_RATE_OUTBOX_CHANGE_EVENT);
  return nextRecord;
}

async function updateMasterMeta(updater) {
  const existing = await getRecord(MASTER_META_STORE, MASTER_META_KEY).catch(() => null);
  const nextValue = {
    ...defaultMasterMeta(),
    ...(existing || {}),
    ...(typeof updater === "function" ? updater(existing || defaultMasterMeta()) : updater),
    key: MASTER_META_KEY,
    updatedAt: new Date().toISOString(),
  };
  await putRecord(MASTER_META_STORE, nextValue);
  notifyWindowEvent(PIECE_RATE_MASTER_CHANGE_EVENT);
  return nextValue;
}

export async function requestPersistentOfflineStorage() {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) {
    return false;
  }

  try {
    return Boolean(await navigator.storage.persist());
  } catch {
    return false;
  }
}

export async function queuePieceRateSubmission(payload, options = {}) {
  const id = normalizeRecordId(payload);
  const existing = await getRecord(OUTBOX_STORE, id).catch(() => null);
  const duplicateRecord = await findPieceRateOutboxDuplicate(payload, {
    excludeIds: [id],
  });
  const now = new Date().toISOString();

  if (duplicateRecord) {
    return {
      id: duplicateRecord.id,
      existed: true,
      duplicate: true,
      record: duplicateRecord,
    };
  }

  const nextRecord = {
    id,
    requestId: id,
    endpoint: PIECE_RATE_ENDPOINT,
    method: "POST",
    employeeCode: normalizeEmployeeCode(payload?.employeeCode),
    productBarcode: normalizeProductBarcode(payload?.productBarcode),
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
  notifyWindowEvent(PIECE_RATE_OUTBOX_CHANGE_EVENT);

  return {
    id,
    existed: Boolean(existing),
    duplicate: false,
    record: nextRecord,
  };
}

export async function findPieceRateOutboxDuplicate(payload, options = {}) {
  const excludedIds = new Set(
    Array.isArray(options.excludeIds)
      ? options.excludeIds.filter(Boolean).map((value) => String(value))
      : []
  );
  const allowedStatuses = new Set(
    options.statuses || ["pending", "ready_to_print", "printed", "needs_review"]
  );
  const records = await getAllRecords(OUTBOX_STORE).catch(() => []);

  return findPieceRateBusinessDuplicate(
    payload,
    records.filter((record) => {
      if (!record || excludedIds.has(String(record.id || ""))) {
        return false;
      }
      return allowedStatuses.has(String(record.status || ""));
    }),
    options
  );
}

export async function getDuePieceRateOutboxEntries(limit = 10, options = {}) {
  const now = Date.now();
  const includeFailed = Boolean(options.includeFailed);
  const records = await getAllRecords(OUTBOX_STORE).catch(() => []);

  return records
    .filter((record) => {
      if (includeFailed) return record?.status === "failed";
      if (record?.status === "pending") return true;
      // Recover records created by older clients that replaced the sync state
      // with `printed` before the server had confirmed the save.
      return record?.status === "printed" && !record?.syncedAt;
    })
    .filter((record) => {
      if (!record?.nextRetryAt) return true;
      const retryAt = Date.parse(record.nextRetryAt);
      return Number.isNaN(retryAt) || retryAt <= now;
    })
    .sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0))
    .slice(0, Math.max(1, limit));
}

export async function markPieceRateOutboxRetry(id, updates = {}) {
  return updateOutboxRecord(id, (existing) => ({
    ...existing,
    status: "pending",
    attemptCount: Number(updates.attemptCount ?? existing.attemptCount ?? 0),
    nextRetryAt: updates.nextRetryAt || existing.nextRetryAt || new Date().toISOString(),
    lastError: updates.lastError || existing.lastError || null,
    updatedAt: new Date().toISOString(),
  }));
}

export async function markPieceRateOutboxFailed(id, updates = {}) {
  return updateOutboxRecord(id, (existing) => ({
    ...existing,
    status: "failed",
    attemptCount: Number(updates.attemptCount ?? existing.attemptCount ?? 0),
    nextRetryAt: null,
    lastError: updates.lastError || existing.lastError || null,
    updatedAt: new Date().toISOString(),
  }));
}

export async function markPieceRateOutboxNeedsReview(id, updates = {}) {
  return updateOutboxRecord(id, (existing) => ({
    ...existing,
    status: "needs_review",
    nextRetryAt: null,
    lastError: updates.lastError || existing.lastError || null,
    reviewReason: updates.reviewReason || existing.reviewReason || "needs_review",
    updatedAt: new Date().toISOString(),
  }));
}

export async function markPieceRateOutboxReadyToPrint(id, updates = {}) {
  return updateOutboxRecord(id, (existing) => ({
    ...existing,
    status: existing.printedAt || existing.printStatus === "printed"
      ? "printed"
      : "ready_to_print",
    nextRetryAt: null,
    lastError: null,
    syncedAt: updates.syncedAt || new Date().toISOString(),
    syncedData: updates.syncedData || existing.syncedData || null,
    duplicated: Boolean(updates.duplicated),
    updatedAt: new Date().toISOString(),
  }));
}

export async function markPieceRateOutboxPrinted(id, updates = {}) {
  return updateOutboxRecord(id, (existing) => ({
    ...existing,
    // Printing and server synchronization are independent. Keep an unsynced
    // record pending so it remains eligible for automatic synchronization.
    status: existing.syncedAt ? "printed" : existing.status,
    printStatus: "printed",
    printedAt: updates.printedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

export async function requeueFailedPieceRateOutboxEntries() {
  const failedEntries = await getDuePieceRateOutboxEntries(500, { includeFailed: true });

  await Promise.all(
    failedEntries.map((entry) => markPieceRateOutboxRetry(entry.id, {
      attemptCount: Number(entry.attemptCount || 0),
      nextRetryAt: new Date().toISOString(),
      lastError: entry.lastError || null,
    }))
  );

  notifyWindowEvent(PIECE_RATE_OUTBOX_CHANGE_EVENT);
  return failedEntries.length;
}

export async function requeuePieceRateNeedsReviewEntries() {
  const reviewEntries = await getPieceRateNeedsReviewEntries(500);

  await Promise.all(
    reviewEntries.map((entry) => markPieceRateOutboxRetry(entry.id, {
      attemptCount: Number(entry.attemptCount || 0),
      nextRetryAt: new Date().toISOString(),
      lastError: entry.lastError || null,
    }))
  );

  notifyWindowEvent(PIECE_RATE_OUTBOX_CHANGE_EVENT);
  return reviewEntries.length;
}

export async function getPieceRateReadyToPrintEntries(limit = 20) {
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

export async function getPieceRateNeedsReviewEntries(limit = 20) {
  const records = await getAllRecords(OUTBOX_STORE).catch(() => []);

  return records
    .filter((record) => record?.status === "needs_review")
    .sort((a, b) => Date.parse(a.updatedAt || a.createdAt || 0) - Date.parse(b.updatedAt || b.createdAt || 0))
    .slice(0, Math.max(1, limit));
}

export async function getRecentPieceRateOutboxEntries(limit = 50) {
  const records = await getAllRecords(OUTBOX_STORE).catch(() => []);

  return records
    .filter((record) => record?.payload)
    .sort((a, b) => {
      const left = Date.parse(a.updatedAt || a.createdAt || 0);
      const right = Date.parse(b.updatedAt || b.createdAt || 0);
      return right - left;
    })
    .slice(0, Math.max(1, limit));
}

export async function getPieceRateOutboxSummary() {
  const records = await getAllRecords(OUTBOX_STORE).catch(() => []);
  const pendingCount = records.filter((record) => (
    record?.status === "pending"
    || (record?.status === "printed" && !record?.syncedAt)
  )).length;
  const failedCount = records.filter((record) => record?.status === "failed").length;
  const needsReviewCount = records.filter((record) => record?.status === "needs_review").length;
  const readyToPrintCount = records.filter((record) => record?.status === "ready_to_print").length;
  const printedCount = records.filter((record) => record?.status === "printed" && record?.syncedAt).length;

  return {
    pendingCount,
    failedCount,
    needsReviewCount,
    readyToPrintCount,
    printedCount,
    totalCount: records.length,
  };
}

export async function cachePieceRateProductLookup(productBarcode, payload) {
  const normalizedProductBarcode = normalizeProductBarcode(productBarcode);
  if (!normalizedProductBarcode || !payload) return;

  await putRecord(PRODUCT_LOOKUP_CACHE_STORE, {
    productBarcode: normalizedProductBarcode,
    productCode: payload?.product?.code || null,
    payload,
    updatedAt: payload?.updatedAt || new Date().toISOString(),
  });
  notifyWindowEvent(PIECE_RATE_MASTER_CHANGE_EVENT);
}

export async function getCachedPieceRateProductLookup(productBarcode) {
  const normalizedProductBarcode = normalizeProductBarcode(productBarcode);
  if (!normalizedProductBarcode) return null;

  const record = await getRecord(PRODUCT_LOOKUP_CACHE_STORE, normalizedProductBarcode).catch(() => null);
  return record?.payload || null;
}

export async function cachePieceRateEmployeeLookup(employeeCode, payload) {
  const normalizedEmployeeCode = normalizeEmployeeCode(employeeCode);
  if (!normalizedEmployeeCode || !payload) return;

  await putRecord(EMPLOYEE_LOOKUP_CACHE_STORE, {
    employeeCode: normalizedEmployeeCode,
    departmentName: payload?.employee?.departmentName || null,
    payload,
    updatedAt: payload?.updatedAt || new Date().toISOString(),
  });
  notifyWindowEvent(PIECE_RATE_MASTER_CHANGE_EVENT);
}

export async function getCachedPieceRateEmployeeLookup(employeeCode) {
  const normalizedEmployeeCode = normalizeEmployeeCode(employeeCode);
  if (!normalizedEmployeeCode) return null;

  const record = await getRecord(EMPLOYEE_LOOKUP_CACHE_STORE, normalizedEmployeeCode).catch(() => null);
  return record?.payload || null;
}

export async function replacePieceRateProductLookups(productLookups = [], options = {}) {
  await replaceStoreRecords(
    PRODUCT_LOOKUP_CACHE_STORE,
    productLookups,
    {
      reset: options.reset !== false,
      keyTransform: (payload) => {
        const productBarcode = normalizeProductBarcode(payload?.productBarcode);
        if (!productBarcode) return null;
        return {
          productBarcode,
          productCode: payload?.product?.code || null,
          payload,
          updatedAt: payload?.updatedAt || new Date().toISOString(),
        };
      },
    }
  );
}

export async function replacePieceRateEmployeeLookups(employeePayloads = [], options = {}) {
  await replaceStoreRecords(
    EMPLOYEE_LOOKUP_CACHE_STORE,
    employeePayloads,
    {
      reset: options.reset !== false,
      keyTransform: (payload) => {
        const employeeCode = normalizeEmployeeCode(payload?.employee?.employeeCode || payload?.employeeCode);
        if (!employeeCode) return null;
        return {
          employeeCode,
          departmentName: payload?.employee?.departmentName || null,
          payload: payload.employee ? payload : { employee: payload },
          updatedAt: payload?.updatedAt || new Date().toISOString(),
        };
      },
    }
  );
}

export async function markPieceRateMasterSyncStarted() {
  return updateMasterMeta((existing) => ({
    ...existing,
    syncing: true,
    lastAttemptedSyncAt: new Date().toISOString(),
    syncStartedAt: new Date().toISOString(),
    lastError: null,
  }));
}

export async function markPieceRateMasterSyncSuccess({
  productCount = null,
  employeeCount = null,
  productUpdatedAt = null,
  employeeUpdatedAt = null,
} = {}) {
  const now = new Date().toISOString();
  return updateMasterMeta((existing) => ({
    ...existing,
    syncing: false,
    ready: true,
    stale: false,
    hasSeedData: true,
    lastSuccessfulSyncAt: now,
    lastAttemptedSyncAt: existing?.lastAttemptedSyncAt || now,
    syncStartedAt: null,
    lastError: null,
    productCount: Number.isFinite(productCount) ? productCount : existing?.productCount || 0,
    employeeCount: Number.isFinite(employeeCount) ? employeeCount : existing?.employeeCount || 0,
    productUpdatedAt: productUpdatedAt || existing?.productUpdatedAt || null,
    employeeUpdatedAt: employeeUpdatedAt || existing?.employeeUpdatedAt || null,
  }));
}

export async function markPieceRateMasterSyncFailure(errorMessage) {
  return updateMasterMeta((existing) => ({
    ...existing,
    syncing: false,
    stale: Boolean(existing?.hasSeedData),
    ready: Boolean(existing?.hasSeedData),
    syncStartedAt: null,
    lastAttemptedSyncAt: new Date().toISOString(),
    lastError: errorMessage || "Offline master sync failed.",
  }));
}

export async function getPieceRateMasterSummary() {
  const meta = await getRecord(MASTER_META_STORE, MASTER_META_KEY).catch(() => null);
  const [productCount, employeeCount] = await Promise.all([
    countRecords(PRODUCT_LOOKUP_CACHE_STORE).catch(() => 0),
    countRecords(EMPLOYEE_LOOKUP_CACHE_STORE).catch(() => 0),
  ]);

  const resolved = {
    ...defaultMasterMeta(),
    ...(meta || {}),
    productCount,
    employeeCount,
  };

  return {
    ready: Boolean(resolved.ready && productCount > 0 && employeeCount > 0),
    syncing: Boolean(resolved.syncing),
    stale: Boolean(resolved.stale),
    hasSeedData: Boolean(resolved.hasSeedData || productCount > 0 || employeeCount > 0),
    lastSuccessfulSyncAt: resolved.lastSuccessfulSyncAt || null,
    lastAttemptedSyncAt: resolved.lastAttemptedSyncAt || null,
    lastError: resolved.lastError || null,
    productCount,
    employeeCount,
    productUpdatedAt: resolved.productUpdatedAt || null,
    employeeUpdatedAt: resolved.employeeUpdatedAt || null,
  };
}

export async function resetPieceRateOfflineMaster() {
  await Promise.all([
    clearStore(PRODUCT_LOOKUP_CACHE_STORE),
    clearStore(EMPLOYEE_LOOKUP_CACHE_STORE),
  ]);
  await updateMasterMeta({
    ...defaultMasterMeta(),
    key: MASTER_META_KEY,
    updatedAt: new Date().toISOString(),
  });
}

export async function getAllCachedPieceRateProducts() {
  return getAllRecords(PRODUCT_LOOKUP_CACHE_STORE).catch(() => []);
}

export async function getAllCachedPieceRateEmployees() {
  return getAllRecords(EMPLOYEE_LOOKUP_CACHE_STORE).catch(() => []);
}
