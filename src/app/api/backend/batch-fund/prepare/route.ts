import { proxyToBackend } from "@/lib/backendProxy";

/**
 * Proxies src/lib/api.ts's prepareBatchFunding to the backend's confirmed
 * prepare endpoint POST /api/v1/fund/prepare (#674, #900).
 *
 * The old api.ts called /api/v1/fund/batch/prepare directly from the browser,
 * which (a) bypassed the API key and (b) pointed at a path that does not
 * exist on the backend. This route corrects both.
 */
export async function POST(request: Request) {
  return proxyToBackend(request, "/api/v1/fund/prepare");
}
