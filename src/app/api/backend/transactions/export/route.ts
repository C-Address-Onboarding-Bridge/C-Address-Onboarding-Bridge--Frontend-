import { proxyToBackend } from "@/lib/backendProxy";

/** Proxies src/lib/api.ts's transaction export to the real backend (#674). */
export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return proxyToBackend(request, `/transactions/export${search}`);
}
