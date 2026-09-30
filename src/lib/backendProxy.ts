/**
 * Server-side proxy to the C-Address Bridge backend (#674).
 *
 * Every backend route except /health requires an X-API-Key header. Sending
 * it from the browser — even via a NEXT_PUBLIC_* var — would publish it to
 * every visitor, since NEXT_PUBLIC_* vars are inlined into the client
 * bundle. The route handlers under src/app/api/backend/ call
 * `proxyToBackend` instead of the browser calling the backend directly: the
 * key is attached here, server-side only, from a var with no NEXT_PUBLIC_
 * prefix, so it's never bundled or sent to a client.
 *
 * /health itself has no such requirement and is unauthenticated on the
 * backend, so src/lib/api.ts still calls it directly rather than through
 * this proxy — nothing here would make that call any safer.
 */
import { NextResponse } from "next/server";
import { API_BASE_URL } from "./api";
import { checkRateLimit, getClientIp } from "./rateLimit";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;

/**
 * Forwards `request` to `${API_BASE_URL}${backendPath}` with the backend API
 * key attached, after a per-IP rate-limit check. `backendPath` must already
 * include any query string the backend call needs — callers build it from
 * the incoming request's own search params (see the route handlers under
 * src/app/api/backend/ for the pattern).
 *
 * Only ever called with a path this file's own callers hardcode (see the
 * "Getting started" note below) — never with a path derived from
 * unvalidated user input beyond the query string — so this can't be used to
 * reach arbitrary backend routes our own UI doesn't already call.
 */
export async function proxyToBackend(request: Request, backendPath: string): Promise<Response> {
  const ip = getClientIp(request);
  const { allowed, retryAfterSeconds } = checkRateLimit(`backend-proxy:${ip}`, {
    windowMs: RATE_LIMIT_WINDOW_MS,
    max: RATE_LIMIT_MAX_REQUESTS,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      {
        status: 429,
        headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined,
      }
    );
  }

  const apiKey = process.env.BACKEND_API_KEY;
  if (!apiKey) {
    console.error("BACKEND_API_KEY is not set — refusing to proxy to the backend without it.");
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  const method = request.method;
  const isBodyless = method === "GET" || method === "HEAD";
  const backendResponse = await fetch(`${API_BASE_URL}${backendPath}`, {
    method,
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: isBodyless ? undefined : await request.text(),
  });

  const body = await backendResponse.text();
  return new NextResponse(body, {
    status: backendResponse.status,
    headers: {
      "Content-Type": backendResponse.headers.get("Content-Type") ?? "application/json",
    },
  });
}
