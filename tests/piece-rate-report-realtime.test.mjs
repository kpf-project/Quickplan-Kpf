import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPieceRateReportRefreshScheduler,
  startPieceRateReportRealtimeSync,
} from "../src/features/attendance/services/pieceRateReportRealtime.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRealtimeMigration() {
  const migrationsDir = path.join(repoRoot, "supabase", "migrations");
  const filename = fs.readdirSync(migrationsDir)
    .find((name) => name.endsWith("_enable_piece_rate_report_realtime.sql"));
  assert.ok(filename, "Realtime migration must exist");
  return fs.readFileSync(path.join(migrationsDir, filename), "utf8");
}

test("publishes production_piece_rate_logs idempotently without replacing the publication", () => {
  const sql = readRealtimeMigration();

  assert.match(sql, /pg_publication_tables/i);
  assert.match(sql, /pubname\s*=\s*'supabase_realtime'/i);
  assert.match(sql, /schemaname\s*=\s*'public'/i);
  assert.match(sql, /tablename\s*=\s*'production_piece_rate_logs'/i);
  assert.match(
    sql,
    /alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.production_piece_rate_logs/i
  );
  assert.doesNotMatch(sql, /drop\s+publication/i);
});

test("coalesces a burst of report invalidations into one refresh", () => {
  const callbacks = new Map();
  const cleared = [];
  let nextTimerId = 0;
  let refreshCount = 0;
  const scheduler = createPieceRateReportRefreshScheduler({
    onRefresh: () => {
      refreshCount += 1;
    },
    setTimer: (callback, delay) => {
      nextTimerId += 1;
      assert.equal(delay, 400);
      const timerId = nextTimerId;
      callbacks.set(timerId, () => {
        callbacks.delete(timerId);
        callback();
      });
      return nextTimerId;
    },
    clearTimer: (timerId) => {
      cleared.push(timerId);
      callbacks.delete(timerId);
    },
  });

  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();

  assert.deepEqual(cleared, [1, 2]);
  callbacks.get(3)();
  assert.equal(refreshCount, 1);
});

test("cancel prevents a pending report refresh", () => {
  const callbacks = new Map();
  let nextTimerId = 0;
  let refreshCount = 0;
  const scheduler = createPieceRateReportRefreshScheduler({
    onRefresh: () => {
      refreshCount += 1;
    },
    setTimer: (callback) => {
      nextTimerId += 1;
      callbacks.set(nextTimerId, callback);
      return nextTimerId;
    },
    clearTimer: (timerId) => {
      callbacks.delete(timerId);
    },
  });

  scheduler.schedule();
  scheduler.cancel();

  assert.equal(callbacks.size, 0);
  assert.equal(refreshCount, 0);
});

test("subscribes to a public invalidation signal without exposing RLS-protected wage rows", async () => {
  const callbacks = new Map();
  let nextTimerId = 0;
  let realtimeHandler = null;
  let realtimeStatusHandler = null;
  let removedChannel = null;
  let refreshCount = 0;
  const statuses = [];
  const channel = {
    on(type, filter, handler) {
      assert.equal(type, "postgres_changes");
      assert.deepEqual(filter, {
        event: "*",
        schema: "public",
        table: "production_piece_rate_realtime_signals",
      });
      realtimeHandler = handler;
      return this;
    },
    subscribe(handler) {
      realtimeStatusHandler = handler;
      return this;
    },
  };
  const supabaseClient = {
    channel(name) {
      assert.equal(name, "piece-rate-report-db-changes");
      return channel;
    },
    async removeChannel(value) {
      removedChannel = value;
    },
  };
  const broadcastChannel = {
    onmessage: null,
    closed: false,
    close() {
      this.closed = true;
    },
  };

  const sync = startPieceRateReportRealtimeSync({
    supabaseClient,
    onRefresh: () => {
      refreshCount += 1;
    },
    onRealtimeStatus: (status) => {
      statuses.push(status);
    },
    createBroadcastChannel: (name) => {
      assert.equal(name, "kpf_piece_rate_sync");
      return broadcastChannel;
    },
    setTimer: (callback, delay) => {
      nextTimerId += 1;
      assert.equal(delay, 400);
      const timerId = nextTimerId;
      callbacks.set(timerId, () => {
        callbacks.delete(timerId);
        callback();
      });
      return nextTimerId;
    },
    clearTimer: (timerId) => {
      callbacks.delete(timerId);
    },
  });

  realtimeStatusHandler("SUBSCRIBED");
  realtimeHandler({ eventType: "INSERT" });
  broadcastChannel.onmessage({ data: "REFRESH_REPORT" });

  assert.deepEqual(statuses, ["SUBSCRIBED"]);
  assert.equal(callbacks.size, 1);
  callbacks.get(2)();
  assert.equal(refreshCount, 1);

  realtimeHandler({ eventType: "UPDATE" });
  assert.equal(callbacks.size, 1);
  await sync.dispose();

  assert.equal(callbacks.size, 0);
  assert.equal(broadcastChannel.closed, true);
  assert.equal(removedChannel, channel);
  assert.equal(refreshCount, 1);
});

test("keeps browser-tab refresh working when Realtime setup fails", async () => {
  const callbacks = [];
  const errors = [];
  let refreshCount = 0;
  const broadcastChannel = {
    onmessage: null,
    closed: false,
    close() {
      this.closed = true;
    },
  };
  const sync = startPieceRateReportRealtimeSync({
    supabaseClient: {
      channel() {
        throw new Error("websocket unavailable");
      },
      async removeChannel() {
        throw new Error("must not remove a channel that was never created");
      },
    },
    onRefresh: () => {
      refreshCount += 1;
    },
    onRealtimeError: (error) => {
      errors.push(error.message);
    },
    createBroadcastChannel: () => broadcastChannel,
    setTimer: (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    clearTimer: () => {},
  });

  broadcastChannel.onmessage({ data: "REFRESH_REPORT" });
  callbacks[0]();
  await sync.dispose();

  assert.deepEqual(errors, ["websocket unavailable"]);
  assert.equal(refreshCount, 1);
  assert.equal(broadcastChannel.closed, true);
});

test("keeps database refresh working when BroadcastChannel is unavailable", async () => {
  let realtimeHandler = null;
  let refreshCount = 0;
  let removed = false;
  const channel = {
    on(_type, _filter, handler) {
      realtimeHandler = handler;
      return this;
    },
    subscribe() {
      return this;
    },
  };
  const sync = startPieceRateReportRealtimeSync({
    supabaseClient: {
      channel() {
        return channel;
      },
      async removeChannel() {
        removed = true;
      },
    },
    onRefresh: () => {
      refreshCount += 1;
    },
    createBroadcastChannel: () => {
      throw new Error("BroadcastChannel unavailable");
    },
    onBroadcastError: () => {},
    setTimer: (callback) => {
      callback();
      return 1;
    },
    clearTimer: () => {},
  });

  realtimeHandler({ eventType: "UPDATE" });
  await sync.dispose();

  assert.equal(refreshCount, 1);
  assert.equal(removed, true);
});
