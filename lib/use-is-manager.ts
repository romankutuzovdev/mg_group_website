"use client";

import { useEffect, useState } from "react";
import { fetchMe, getCabinetToken } from "@/lib/api/cabinet";

/**
 * True when the visitor is logged into the cabinet as an admin/manager.
 * Used to gate auction-source links and labels (Copart / IAAI / Bid.cars).
 */
export function useIsManager(): boolean {
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const token = getCabinetToken();
    if (!token) {
      setIsManager(false);
      return;
    }
    void fetchMe()
      .then((me) => {
        if (!cancelled) setIsManager(Boolean(me.is_admin));
      })
      .catch(() => {
        if (!cancelled) setIsManager(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return isManager;
}
