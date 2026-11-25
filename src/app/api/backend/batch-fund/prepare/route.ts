import { proxyToBackend } from "@/lib/backendProxy";

/**
 * Proxies src/lib/api.ts's prepareBatchFunding to the real backend (#674, #900).
 * Forwards to POST /api/v1/fund/prepare (funding.ts:64), which is the backend
 * route that builds the unsigned batch XDR. The previously-used path
 * /api/v1/fund/batch/prepare does not exist on the backend.
 */
export async function POST(request: Request) {
  return proxyToBackend(request, "/api/v1/fund/prepare");
}
