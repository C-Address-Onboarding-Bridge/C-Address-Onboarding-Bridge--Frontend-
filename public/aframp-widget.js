/**
 * C-Address Bridge embeddable funding widget — host-page loader. (#558)
 *
 * A standalone, dependency-free script a third-party host page includes
 * directly (no build step, no framework): it creates the widget iframe,
 * sizes it to the widget's content, and relays results back to the host via
 * callbacks — validating every incoming postMessage's origin first.
 *
 * The message shape and the "source" tag below (WIDGET_MESSAGE_SOURCE) are
 * the same contract src/lib/widget.ts defines for the widget page itself;
 * src/__tests__/widgetLoader.test.ts asserts this file stays in sync with
 * that module so the two sides of the contract cannot silently drift apart.
 *
 * Usage:
 *   <div id="aframp-widget"></div>
 *   <script src="https://<this-app-origin>/aframp-widget.js"></script>
 *   <script>
 *     AframpWidget.mount(document.getElementById("aframp-widget"), {
 *       widgetOrigin: "https://<this-app-origin>",
 *       address: "C...",        // required: destination C-address
 *       asset: "XLM",           // optional, default "XLM"
 *       amount: "10",           // optional preset amount
 *       theme: "light",         // optional, "light" | "dark"
 *       network: "PUBLIC",      // optional, default "TESTNET"
 *       onSuccess: function (result) { ... },
 *       onError: function (error) { ... },
 *       onCancel: function () { ... },
 *     });
 *   </script>
 */
(function (global) {
  "use strict";

  var WIDGET_MESSAGE_SOURCE = "aframp-widget";

  /**
   * True when a `message` event genuinely came from this mount's iframe:
   * the event's origin matches the widget's own origin (not the host's),
   * the event's source window is that exact iframe's contentWindow, and the
   * payload carries the widget's own source tag. Every one of these has to
   * hold — a page can post to any window it has a reference to, so origin
   * alone isn't enough once other same-origin frames/scripts exist.
   */
  function isMessageFromWidget(event, widgetOrigin, iframeWindow) {
    if (event.origin !== widgetOrigin) return false;
    if (event.source !== iframeWindow) return false;
    var data = event.data;
    return !!data && typeof data === "object" && data.source === WIDGET_MESSAGE_SOURCE;
  }

  function buildWidgetUrl(config) {
    var url = new URL("/widget", config.widgetOrigin);
    url.searchParams.set("address", config.address);
    if (config.asset) url.searchParams.set("asset", config.asset);
    if (config.amount) url.searchParams.set("amount", config.amount);
    if (config.theme) url.searchParams.set("theme", config.theme);
    if (config.network) url.searchParams.set("network", config.network);
    // The widget only ever posts results back to this exact origin — see
    // isMessageFromWidget's counterpart, isAllowedParentOrigin, in
    // src/lib/widget.ts.
    url.searchParams.set("parentOrigin", global.location.origin);
    return url.toString();
  }

  /**
   * Mounts the funding widget into `container`. Returns a handle with
   * `unmount()` to remove the iframe and stop listening for messages.
   */
  function mount(container, config) {
    if (!config || !config.widgetOrigin) {
      throw new Error("AframpWidget.mount: config.widgetOrigin is required");
    }
    if (!config.address) {
      throw new Error("AframpWidget.mount: config.address is required");
    }

    var widgetOrigin = new URL(config.widgetOrigin).origin;
    var iframe = global.document.createElement("iframe");
    iframe.src = buildWidgetUrl(config);
    iframe.style.border = "0";
    iframe.style.width = "100%";
    iframe.style.minHeight = "200px";
    iframe.setAttribute("title", "Fund with Aframp");

    function handleMessage(event) {
      if (!isMessageFromWidget(event, widgetOrigin, iframe.contentWindow)) return;
      var message = event.data;
      switch (message.type) {
        case "resize":
          if (typeof message.height === "number") {
            iframe.style.height = message.height + "px";
          }
          break;
        case "success":
          if (config.onSuccess) {
            config.onSuccess({ txHash: message.txHash, amount: message.amount, asset: message.asset });
          }
          break;
        case "error":
          if (config.onError) config.onError(message.message);
          break;
        case "cancel":
          if (config.onCancel) config.onCancel();
          break;
        default:
          break;
      }
    }

    global.addEventListener("message", handleMessage);
    container.appendChild(iframe);

    return {
      unmount: function () {
        global.removeEventListener("message", handleMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      },
    };
  }

  global.AframpWidget = { mount: mount, isMessageFromWidget: isMessageFromWidget, buildWidgetUrl: buildWidgetUrl };
})(typeof window !== "undefined" ? window : globalThis);
