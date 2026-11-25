import { proxyToBackend } from "@/lib/backendProxy";

/** Proxies src/lib/api.ts's claimLock to the backend's timelock claim endpoint (#674, #897). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyToBackend(request, `/api/v1/fund/timelocked/${encodeURIComponent(id)}/claim`);
}
