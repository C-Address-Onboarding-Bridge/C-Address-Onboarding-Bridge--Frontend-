import { proxyToBackend } from "@/lib/backendProxy";

/**
 * Proxies src/lib/api.ts's submitSignedBatchFunding to the backend's
 * confirmed batch-submit endpoint POST /api/v1/fund/batch (#674, #900).
 */
export async function POST(request: Request) {
  return proxyToBackend(request, "/api/v1/fund/batch");
}
