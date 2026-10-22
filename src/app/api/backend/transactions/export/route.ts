import { proxyToBackend } from "@/lib/backendProxy";

/** Proxies src/lib/api.ts's transaction export to the backend's transactions endpoint (#674, #897). */
export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return proxyToBackend(request, `/api/v1/transactions${search}`);
}
