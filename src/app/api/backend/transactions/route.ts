import { proxyToBackend } from "@/lib/backendProxy";

/**
 * Proxies src/lib/api.ts's submitTransaction to the real backend (#674, #900).
 *
 * The old api.ts called the backend's /transactions endpoint directly from
 * the browser, bypassing the API key. This route attaches BACKEND_API_KEY
 * server-side before forwarding.
 */
export async function POST(request: Request) {
  return proxyToBackend(request, "/transactions");
}
