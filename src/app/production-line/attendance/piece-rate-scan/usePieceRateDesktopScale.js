"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { subscribePieceRateScaleStream } from "@/features/attendance/services/pieceRateLocalScaleAgentClient";
import {
  evaluateDesktopPieceRateReadiness,
  normalizeDesktopScaleReading,
  resolveDesktopScaleStableWeight,
} from "@/lib/piece-rate-desktop-scale";

const READING_STALE_AFTER_MS = 5000;

export default function usePieceRateDesktopScale({ hasProduct, hasEmployee, enabled }) {
  const [reading, setReading] = useState(null);
  const [agentConnected, setAgentConnected] = useState(false);
  const [portOpen, setPortOpen] = useState(null);
  const [portPath, setPortPath] = useState("");
  const [baudRate, setBaudRate] = useState(9600);
  const [isReadingFresh, setIsReadingFresh] = useState(false);
  const [isStable, setIsStable] = useState(false);
  const [error, setError] = useState("");
  const [reconnectVersion, setReconnectVersion] = useState(0);
  const staleTimerRef = useRef(null);
  const readingsRef = useRef([]);
  const stableWeightRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    console.log("[PieceRateScale] Attempting to connect to local scale agent WebSocket stream...");
    const unsubscribe = subscribePieceRateScaleStream({
      onOpen: () => {
        console.log("[PieceRateScale] Connected to Local Scale Agent WebSocket successfully.");
        setAgentConnected(true);
        setError("");
      },
      onClose: () => {
        console.log("[PieceRateScale] Local Scale Agent WebSocket connection closed.");
        setAgentConnected(false);
        setIsReadingFresh(false);
        setIsStable(false);
        readingsRef.current = [];
        stableWeightRef.current = null;
      },
      onError: (err) => {
        console.error("[PieceRateScale] Local Scale Agent WebSocket encountered an error:", err);
        setAgentConnected(false);
      },
      onStatus: (payload) => {
        console.log("[PieceRateScale] Status event received:", payload);
        setPortOpen(Boolean(payload?.portOpen));
        setPortPath(String(payload?.path || payload?.portPath || payload?.port || ""));
        setBaudRate(Number(payload?.baudRate) || 9600);
        setError(String(payload?.error || "").trim());
      },
      onReading: (payload) => {
        console.log("[PieceRateScale] Reading event received:", payload);
        const normalized = normalizeDesktopScaleReading(payload);
        if (!normalized) {
          setIsStable(false);
          stableWeightRef.current = null;
          return;
        }
        setReading(normalized);
        setIsReadingFresh(true);
        readingsRef.current = [...readingsRef.current, normalized]
          .filter((item) => normalized.atMs - item.atMs <= 6000);
        stableWeightRef.current = resolveDesktopScaleStableWeight({
          readings: readingsRef.current,
          deviceStable: normalized.stable,
          previousStableWeightKg: stableWeightRef.current,
          currentWeightKg: normalized.weightKg,
        });
        setIsStable(stableWeightRef.current !== null);
        if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
        staleTimerRef.current = setTimeout(() => {
          setIsReadingFresh(false);
          setIsStable(false);
          readingsRef.current = [];
          stableWeightRef.current = null;
        }, READING_STALE_AFTER_MS);
      },
    });

    return () => {
      unsubscribe();
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
    };
  }, [enabled, reconnectVersion]);

  const readiness = useMemo(() => evaluateDesktopPieceRateReadiness({
    hasProduct,
    hasEmployee,
    agentConnected,
    portOpen,
    isReadingFresh,
    isStable,
    weightKg: reading?.weightKg,
  }), [agentConnected, hasEmployee, hasProduct, isReadingFresh, isStable, portOpen, reading?.weightKg]);

  return {
    reading,
    weightKg: reading?.weightKg ?? null,
    agentConnected,
    portOpen,
    portPath,
    baudRate,
    isReadingFresh,
    isStable,
    error,
    reconnect: () => setReconnectVersion((value) => value + 1),
    ...readiness,
  };
}
