/* eslint-disable no-undef */
/**
 * Emergency Kill-Switch Service Worker (#1118).
 *
 * Deployment:
 * If an installed service worker in production is serving broken chunks or stale
 * assets and cannot be decommissioned by environment flags alone, deploy this
 * file to replace `/sw.js`.
 *
 * Mechanism:
 * 1. Takes over immediately on install via skipWaiting().
 * 2. On activate, iterates through all caches and deletes all entries starting
 *    with `c-address-bridge-`.
 * 3. Calls self.registration.unregister() to remove the registration from the browser.
 * 4. Iterates through all window clients and forces a clean reload from the network.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("c-address-bridge-"))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.registration.unregister())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => {
        for (const client of clients) {
          if (client.url && "navigate" in client) {
            client.navigate(client.url);
          }
        }
      }),
  );
});
