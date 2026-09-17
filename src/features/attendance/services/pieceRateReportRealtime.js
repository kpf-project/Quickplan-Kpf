export const PIECE_RATE_REPORT_REALTIME_CHANNEL = "piece-rate-report-db-changes";
export const PIECE_RATE_REPORT_REALTIME_TABLE = "production_piece_rate_realtime_signals";

export function createPieceRateReportRefreshScheduler({
  onRefresh,
  delayMs = 400,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let timerId = null;

  return {
    schedule() {
      if (timerId !== null) {
        clearTimer(timerId);
      }
      timerId = setTimer(() => {
        timerId = null;
        onRefresh();
      }, delayMs);
    },
    cancel() {
      if (timerId !== null) {
        clearTimer(timerId);
        timerId = null;
      }
    },
  };
}

export function startPieceRateReportRealtimeSync({
  supabaseClient,
  onRefresh,
  onRealtimeStatus = () => {},
  onRealtimeError = () => {},
  onBroadcastError = () => {},
  createBroadcastChannel = (name) => new BroadcastChannel(name),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const refreshScheduler = createPieceRateReportRefreshScheduler({
    onRefresh,
    setTimer,
    clearTimer,
  });
  let realtimeChannel = null;
  let broadcastChannel = null;

  try {
    realtimeChannel = supabaseClient
      .channel(PIECE_RATE_REPORT_REALTIME_CHANNEL)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: PIECE_RATE_REPORT_REALTIME_TABLE,
        },
        () => {
          refreshScheduler.schedule();
        }
      )
      .subscribe(onRealtimeStatus);
  } catch (error) {
    onRealtimeError(error);
  }

  try {
    broadcastChannel = createBroadcastChannel("kpf_piece_rate_sync");
    broadcastChannel.onmessage = (event) => {
      if (event.data === "REFRESH_REPORT") {
        refreshScheduler.schedule();
      }
    };
  } catch (error) {
    onBroadcastError(error);
  }

  return {
    async dispose() {
      refreshScheduler.cancel();
      broadcastChannel?.close();
      if (realtimeChannel) {
        await supabaseClient.removeChannel(realtimeChannel);
      }
    },
  };
}
