import { proxyToBackend } from "@/lib/backendProxy";

/** Proxies src/lib/api.ts's submitBatchFunding to the real backend (#674). */
export async function POST(request: Request) {
  return proxyToBackend(request, "/batch-fund");
}
