import { proxyToBackend } from "@/lib/backendProxy";

/** Proxies src/lib/api.ts's createLock/listIncomingLocks to the real backend (#674). */
export async function POST(request: Request) {
  return proxyToBackend(request, "/locks");
}

export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return proxyToBackend(request, `/locks${search}`);
}
