"use client";

import { refreshAuthSession } from "@/lib/auth/sessionRefreshClient";
import { fetchJson } from "@/lib/clientFetch";
import {
  getDuePieceRateOutboxEntries,
  getPieceRateOutboxSummary,
  markPieceRateOutboxFailed,
  markPieceRateOutboxNeedsReview,
  markPieceRateOutboxReadyToPrint,
  markPieceRateOutboxRetry,
  requeueFailedPieceRateOutboxEntries,
  requeuePieceRateNeedsReviewEntries,
} from "@/lib/offline/pieceRateOffline";
import { isAppOnline } from "@/lib/offline/networkStatus";

const RETRYABLE_HTTP_STATUSES = new Set([0, 408, 425, 429]);
const MAX_RETRY_ATTEMPTS = 20;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

let activeSyncPromise = null;

function isRetryableFailure(result) {
  if (!result || result.ok) return false;
  if (RETRYABLE_HTTP_STATUSES.has(result.status)) return true;
  return result.status >= 500;
}

function extractFailureMessage(result) {
  return (
    result?.error?.message
    || result?.data?.error
    || result?.data?.message
    || "Failed to sync queued Piece Rate item."
  );
}

function isNeedsReviewFailure(result) {
  if (!result || result.ok) return false;
  return result.status === 400 || result.status === 401 || result.status === 403 || result.status === 409;
}

function computeNextRetryAt(attemptCount) {
  const cappedAttempt = Math.min(Math.max(1, attemptCount), 6);
  const baseDelay = Math.min(MAX_RETRY_DELAY_MS, 5000 * (2 ** cappedAttempt));
  const jitter = Math.round(baseDelay * 0.15);
  const delay = baseDelay + jitter;
  return new Date(Date.now() + delay).toISOString();
}

async function runSync(limit = 10, options = {}) {
  if (!isAppOnline()) {
    return {
      ok: true,
      synced: 0,
      retried: 0,
      failed: 0,
      skipped: "offline",
      summary: await getPieceRateOutboxSummary(),
    };
  }

  if (options.includeFailed) {
    await requeueFailedPieceRateOutboxEntries().catch(() => 0);
    await requeuePieceRateNeedsReviewEntries().catch(() => 0);
  }

  await refreshAuthSession().catch(() => ({ ok: false }));

  const entries = await getDuePieceRateOutboxEntries(limit);
  if (!entries.length) {
    return {
      ok: true,
      synced: 0,
      retried: 0,
      failed: 0,
      skipped: "empty",
      summary: await getPieceRateOutboxSummary(),
    };
  }

  let synced = 0;
  let retried = 0;
  let failed = 0;

  for (const entry of entries) {
    const result = await fetchJson(entry.endpoint, {
      method: entry.method || "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(entry.payload),
      cacheStrategy: "realtime",
    });

    if (result.ok) {
      await markPieceRateOutboxReadyToPrint(entry.id, {
        syncedAt: new Date().toISOString(),
        syncedData: result.data?.data || null,
        duplicated: Boolean(result.data?.duplicated),
      });
      synced += 1;
      continue;
    }

    const attemptCount = Number(entry.attemptCount || 0) + 1;
    const lastError = extractFailureMessage(result);

    if (isNeedsReviewFailure(result)) {
      await markPieceRateOutboxNeedsReview(entry.id, {
        lastError,
        reviewReason: result.status === 401 || result.status === 403 ? "auth_or_permission" : "data_conflict",
      });
      failed += 1;
      continue;
    }

    if (isRetryableFailure(result) && attemptCount < MAX_RETRY_ATTEMPTS) {
      await markPieceRateOutboxRetry(entry.id, {
        attemptCount,
        nextRetryAt: computeNextRetryAt(attemptCount),
        lastError,
      });
      retried += 1;
      continue;
    }

    await markPieceRateOutboxFailed(entry.id, {
      attemptCount,
      lastError,
    });
    failed += 1;
  }

  return {
    ok: true,
    synced,
    retried,
    failed,
    skipped: null,
    summary: await getPieceRateOutboxSummary(),
  };
}

export async function syncPendingPieceRateOutbox(options = {}) {
  if (activeSyncPromise) {
    return activeSyncPromise;
  }

  activeSyncPromise = runSync(options.limit, options).finally(() => {
    activeSyncPromise = null;
  });

  return activeSyncPromise;
}
