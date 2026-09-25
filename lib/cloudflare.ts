/** Cloudflare Worker endpoint for leads / quiz submissions. */
export const CF_WORKER_URL =
  process.env.NEXT_PUBLIC_CF_WORKER_URL?.trim() ||
  "https://worker.multiglobalgroup.com";
