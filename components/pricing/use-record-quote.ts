"use client";

import { useEffect, useRef } from "react";
import {
  getCabinetToken,
  saveQuoteHistory,
  type QuoteHistoryInput,
} from "@/lib/api/cabinet";

/** Записывает просчёт, когда цифры перестали меняться. */
export function useRecordQuote(input: QuoteHistoryInput | null) {
  const last = useRef("");
  const snap = useRef(input);
  snap.current = input;

  const fingerprint = input
    ? [
        input.kind,
        input.lot_url || "",
        input.location || "",
        input.bid ?? "",
        input.currency || "",
        input.total_usd ?? "",
        input.summary || "",
      ].join("|")
    : "";

  useEffect(() => {
    if (!fingerprint || !getCabinetToken()) return;
    if (fingerprint === last.current) return;
    const key = fingerprint;
    const timer = window.setTimeout(() => {
      const body = snap.current;
      if (!body || key === last.current) return;
      last.current = key;
      void saveQuoteHistory(body).catch(() => undefined);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [fingerprint]);
}
