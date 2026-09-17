"use client";

import { fetchPieceRateOfflineMaster } from "@/features/attendance/services/pieceRateWorkClient";
import { refreshAuthSession } from "@/lib/auth/sessionRefreshClient";
import {
  PIECE_RATE_MASTER_CHANGE_EVENT,
  getPieceRateMasterSummary,
  markPieceRateMasterSyncFailure,
  markPieceRateMasterSyncStarted,
  markPieceRateMasterSyncSuccess,
  replacePieceRateEmployeeLookups,
  replacePieceRateProductLookups,
  requestPersistentOfflineStorage,
} from "@/lib/offline/pieceRateOffline";
import { isAppOnline } from "@/lib/offline/networkStatus";

const DEFAULT_EMPLOYEE_PAGE_SIZE = 200;
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

let activeSyncPromise = null;

function isMasterStale(summary) {
  if (!summary?.lastSuccessfulSyncAt) {
    return true;
  }

  const syncedAt = Date.parse(summary.lastSuccessfulSyncAt);
  if (Number.isNaN(syncedAt)) {
    return true;
  }

  return (Date.now() - syncedAt) > STALE_AFTER_MS;
}

export async function shouldSyncPieceRateMaster() {
  const summary = await getPieceRateMasterSummary();
  return !summary.ready || isMasterStale(summary) || summary.stale;
}

export async function syncPieceRateOfflineMaster(options = {}) {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = (async () => {
    if (!isAppOnline()) {
      return {
        ok: false,
        skipped: "offline",
        summary: await getPieceRateMasterSummary(),
      };
    }

    await refreshAuthSession().catch(() => ({ ok: false }));
    await requestPersistentOfflineStorage().catch(() => false);
    await markPieceRateMasterSyncStarted();

    try {
      let employeeCursor = null;
      let totalEmployeeCount = 0;
      let latestEmployeeUpdatedAt = null;
      let latestProductUpdatedAt = null;
      let didWriteStaticMaster = false;

      do {
        const result = await fetchPieceRateOfflineMaster({
          includeStaticMaster: didWriteStaticMaster ? "false" : "true",
          employeeCursor,
          employeePageSize: options.employeePageSize || DEFAULT_EMPLOYEE_PAGE_SIZE,
          machineCode: options.machineCode || null,
        });

        if (!result.ok) {
          throw new Error(result.error?.message || "Offline master sync failed.");
        }

        const payload = result.data?.data || result.data || {};

        if (payload.docCounter?.dateKey) {
          const counterKey = `piece_rate_offline_counter_${payload.docCounter.dateKey}`;
          try {
            const serverSeq = Number(payload.docCounter.lastSeq) || 0;
            const localCached = localStorage.getItem(counterKey);
            let updateLocal = true;
            if (localCached) {
              const localParsed = JSON.parse(localCached);
              const localSeq = Number(localParsed?.lastSeq) || 0;
              if (serverSeq <= localSeq) {
                updateLocal = false;
              }
            }
            if (updateLocal) {
              localStorage.setItem(counterKey, JSON.stringify({ lastRound: 1, lastSeq: serverSeq }));
            }
          } catch (e) {
            console.error("Failed to sync local counter", e);
          }
        }

        if (!didWriteStaticMaster) {
          const staticMaster = payload.staticMaster;
          if (!staticMaster?.productLookups?.length) {
            throw new Error("Offline product master is empty.");
          }

          await replacePieceRateProductLookups(staticMaster.productLookups, { reset: true });
          latestProductUpdatedAt = staticMaster.updatedAt || payload.generatedAt || latestProductUpdatedAt;
          didWriteStaticMaster = true;
        }

        const employeeRows = Array.isArray(payload.employees?.rows)
          ? payload.employees.rows.map((entry) => (entry?.employee ? entry : { employee: entry }))
          : [];

        if (employeeRows.length > 0) {
          await replacePieceRateEmployeeLookups(employeeRows, {
            reset: totalEmployeeCount === 0,
          });
          totalEmployeeCount += employeeRows.length;
        } else if (totalEmployeeCount === 0) {
          await replacePieceRateEmployeeLookups([], { reset: true });
        }

        latestEmployeeUpdatedAt = payload.employees?.updatedAt || latestEmployeeUpdatedAt;
        employeeCursor = payload.employees?.cursor?.hasMore
          ? payload.employees?.cursor?.next || null
          : null;
      } while (employeeCursor);

      if (totalEmployeeCount <= 0) {
        throw new Error("Offline employee master is empty.");
      }

      const summary = await getPieceRateMasterSummary();

      const finalSummary = await markPieceRateMasterSyncSuccess({
        productCount: summary.productCount,
        employeeCount: totalEmployeeCount || summary.employeeCount,
        productUpdatedAt: latestProductUpdatedAt || summary.productUpdatedAt || new Date().toISOString(),
        employeeUpdatedAt: latestEmployeeUpdatedAt || new Date().toISOString(),
      });

      return {
        ok: true,
        skipped: null,
        summary: finalSummary,
      };
    } catch (error) {
      const message = error?.message || "Offline master sync failed.";
      const summary = await markPieceRateMasterSyncFailure(message);
      return {
        ok: false,
        skipped: null,
        error: message,
        summary,
      };
    } finally {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(PIECE_RATE_MASTER_CHANGE_EVENT));
      }
    }
  })().finally(() => {
    activeSyncPromise = null;
  });

  return activeSyncPromise;
}
