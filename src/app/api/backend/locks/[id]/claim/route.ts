import { proxyToBackend } from "@/lib/backendProxy";

/** Proxies src/lib/api.ts's claimLock to the real backend (#674). */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyToBackend(request, `/locks/${encodeURIComponent(id)}/claim`);
}
