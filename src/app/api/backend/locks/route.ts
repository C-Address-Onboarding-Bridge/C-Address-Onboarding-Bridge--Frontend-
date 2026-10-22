import { proxyToBackend } from "@/lib/backendProxy";

/** Proxies src/lib/api.ts's createLock/listIncomingLocks to the backend's timelock endpoints (#674, #897). */
export async function POST(request: Request) {
  return proxyToBackend(request, "/api/v1/fund/timelocked");
}

export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return proxyToBackend(request, `/api/v1/fund/timelocked${search}`);
}
