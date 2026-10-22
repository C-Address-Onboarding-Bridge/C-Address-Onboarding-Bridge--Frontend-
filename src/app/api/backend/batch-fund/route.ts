import { proxyToBackend } from "@/lib/backendProxy";

/** Proxies src/lib/api.ts's submitBatchFunding to the backend's batch fund endpoint (#674, #897). */
export async function POST(request: Request) {
  return proxyToBackend(request, "/api/v1/fund/batch");
}
