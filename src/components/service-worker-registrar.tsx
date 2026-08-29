"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/serviceWorker";

/**
 * Registers the service worker once on mount. Renders nothing.
 *
 * `registerServiceWorker` is a no-op unless NEXT_PUBLIC_ENABLE_SW=true and the
 * browser supports workers, and it never throws — a failed registration must
 * not break app boot. (#345)
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  return null;
}
