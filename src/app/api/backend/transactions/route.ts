import { proxyToBackend } from "@/lib/backendProxy";

/** Proxies src/lib/api.ts's submitTransaction to the real backend (#674, #900). */
export async function POST(request: Request) {
  return proxyToBackend(request, "/transactions");
}
