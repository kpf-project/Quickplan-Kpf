"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeScaleAgentStream } from "@/features/production-line/services/localScaleAgentClient";

const READING_STALE_AFTER_MS = 5000;

export default function useWeightScaleSerialInput(enabled) {
  const [reading, setReading] = useState(null);
  const [agentConnected, setAgentConnected] = useState(false);
  const [portOpen, setPortOpen] = useState(null);
  const [error, setError] = useState("");
  const [isReadingFresh, setIsReadingFresh] = useState(false);
  const staleTimerRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      // Reset the external-device snapshot when the serial mode is turned off.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReading(null);
      setAgentConnected(false);
      setPortOpen(null);
      setError("");
      setIsReadingFresh(false);
      return undefined;
    }

    const unsubscribe = subscribeScaleAgentStream({
      onOpen: () => {
        setAgentConnected(true);
        setError("");
      },
      onClose: () => {
        setAgentConnected(false);
        setIsReadingFresh(false);
      },
      onError: (nextError) => {
        setAgentConnected(false);
        setError(nextError?.message || "ไม่สามารถเชื่อมต่อ Local Scale Agent ได้");
      },
      onStatus: (payload) => {
        setPortOpen(Boolean(payload?.portOpen));
        setError(String(payload?.error || "").trim());
      },
      onReading: (payload) => {
        const weightKg = Number(payload?.weightKg);
        if (!Number.isFinite(weightKg)) return;

        setReading({
          weightKg,
          unit: payload?.unit || "kg",
          raw: String(payload?.raw || ""),
          at: payload?.at || new Date().toISOString(),
        });
        setIsReadingFresh(true);
        if (staleTimerRef.current) window.clearTimeout(staleTimerRef.current);
        staleTimerRef.current = window.setTimeout(() => {
          setIsReadingFresh(false);
          staleTimerRef.current = null;
        }, READING_STALE_AFTER_MS);
      },
    });

    return () => {
      unsubscribe();
      if (staleTimerRef.current) {
        window.clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
    };
  }, [enabled]);

  return {
    reading,
    agentConnected,
    portOpen,
    error,
    isReadingFresh,
  };
}
