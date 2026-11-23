import { proxyToBackend } from "@/lib/backendProxy";

/** Proxies src/lib/api.ts's getReferralStats to the backend's /api/v1 referral stats endpoint (#674, #1007). */
export async function GET(request: Request) {
  const { search } = new URL(request.url);
  return proxyToBackend(request, `/api/v1/referrals/stats${search}`);
}
