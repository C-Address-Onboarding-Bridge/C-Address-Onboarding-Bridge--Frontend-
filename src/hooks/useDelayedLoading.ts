import { useEffect, useState } from "react";

/**
 * Gates a loading skeleton behind a short delay so a fast response never
 * flashes it. Returns `true` only once `active` has been `true` continuously
 * for at least `delayMs` — if `active` flips back to `false` before the
 * delay elapses (a fast load), the returned value never becomes `true`.
 *
 * Callers that need to reserve layout space for the eventual skeleton should
 * do so unconditionally (e.g. via `aria-hidden` markup rendered the whole
 * time `active` is true), and use this hook only to gate the skeleton's
 * *visibility* — see dashboard-page.tsx and transaction-history.tsx. (#485)
 */
export function useDelayedLoading(active: boolean, delayMs = 200): boolean {
  const [show, setShow] = useState(false);

  // Adjusting state during render (react.dev/learn/you-might-not-need-an-effect)
  // so the reset lands in the same render as `active` going false, instead of
  // one tick later via an effect.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    if (!active) setShow(false);
  }

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return show;
}
