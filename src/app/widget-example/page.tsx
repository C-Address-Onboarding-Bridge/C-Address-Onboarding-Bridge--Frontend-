import { headers } from "next/headers";
import Link from "next/link";
import Script from "next/script";

export default async function WidgetExamplePage() {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <div className="mx-auto my-12 max-w-[480px] px-4 text-neutral-900 dark:text-neutral-100">
      <h1 className="text-xl font-semibold">C-Address Onboarding Bridge Widget — Live Example</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        This page embeds the funding widget the same way a third-party dApp would, via{" "}
        <code>/aframp-widget.js</code>. You can also test full bridging directly on the{" "}
        <Link href="/bridge" className="underline">
          Bridge page
        </Link>
        .
      </p>

      <div
        id="caddress-widget"
        className="my-6 overflow-hidden rounded-xl border border-neutral-300 dark:border-neutral-700"
      />

      <p className="text-sm text-neutral-600 dark:text-neutral-400">Messages received from the widget:</p>
      <pre
        id="log"
        className="mt-2 min-h-[60px] whitespace-pre-wrap rounded-lg bg-neutral-100 p-3 font-mono text-xs dark:bg-neutral-800"
      >
        (none yet)
      </pre>

      <Script id="aframp-widget-loader" src="/aframp-widget.js" strategy="afterInteractive" nonce={nonce} />
      <Script id="aframp-widget-mount" strategy="afterInteractive" nonce={nonce}>
        {`
          (function () {
            function initWidget() {
              var container = document.getElementById("caddress-widget");
              var log = document.getElementById("log");
              if (!container || !log || !window.AframpWidget) return;
              var entries = [];
              function append(entry) {
                entries.unshift(new Date().toLocaleTimeString() + "  " + entry);
                log.textContent = entries.join("\\n");
              }
              window.AframpWidget.mount(container, {
                widgetOrigin: window.location.origin,
                address: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
                asset: "XLM",
                theme: "light",
                network: "TESTNET",
                onSuccess: function (result) {
                  append("success: " + result.amount + " " + result.asset + " — " + result.txHash);
                },
                onError: function (message) {
                  append("error: " + message);
                },
                onCancel: function () {
                  append("cancelled");
                }
              });
            }
            if (document.readyState === "loading") {
              document.addEventListener("DOMContentLoaded", initWidget);
            } else {
              initWidget();
            }
          })();
        `}
      </Script>
    </div>
  );
}