import { proxyToBackend } from "@/lib/backendProxy";

/**
 * Proxies src/lib/api.ts's submitBatchFunding / submitSignedBatchFunding to the
 * backend's batch fund endpoint POST /api/v1/fund/batch (#674, #897, #900).
 */
export async function POST(request: Request) {
  return proxyToBackend(request, "/api/v1/fund/batch");
}
