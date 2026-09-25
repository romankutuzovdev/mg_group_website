"use client";

import { useEffect } from "react";
import { useRouter } from "next/router";

/**
 * `output: 'export'` has no `/_next/data/{buildId}/*.json`.
 * Next still prefetches them on Link hover → noisy 404s in the console.
 */
export function DisableStaticExportPrefetch() {
  const router = useRouter();
  useEffect(() => {
    router.prefetch = async () => {};
  }, [router]);
  return null;
}
