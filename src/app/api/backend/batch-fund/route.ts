import { proxyToBackend } from "@/lib/backendProxy";

/**
 * Proxies src/lib/api.ts's submitSignedBatchFunding to the real backend (#674, #900).
 * Forwards to POST /api/v1/fund/batch (funding.ts:173).
 */
export async function POST(request: Request) {
  return proxyToBackend(request, "/api/v1/fund/batch");
}
