# Embedding the funding widget (#558)

A dApp that wants to accept funding for a C-address inside its own onboarding
flow doesn't have to send users away to this app or rebuild the flow against
the API — it can embed the funding widget directly.

There are two ways to do it. Both point at the same page
(`/widget`) and the same result contract; pick whichever fits your stack.

## Option A — plain `<iframe>`

No script required. Build the query string yourself and drop in an iframe:

```html
<iframe
  src="https://<this-app-origin>/widget?address=C...&asset=XLM&amount=10&theme=light&parentOrigin=https%3A%2F%2Fyour-dapp.com"
  style="width: 100%; min-height: 220px; border: 0"
  title="Fund with Aframp"
></iframe>

<script>
  window.addEventListener("message", (event) => {
    if (event.origin !== "https://<this-app-origin>") return; // required — see "Security" below
    const msg = event.data;
    if (!msg || msg.source !== "aframp-widget") return;
    if (msg.type === "success") {
      console.log("funded", msg.txHash, msg.amount, msg.asset);
    }
  });
</script>
```

## Option B — the loader script

[`/aframp-widget.js`](/aframp-widget.js) wraps the same iframe in a small,
dependency-free script and handles sizing and message validation for you:

```html
<div id="aframp-widget"></div>
<script src="https://<this-app-origin>/aframp-widget.js"></script>
<script>
  AframpWidget.mount(document.getElementById("aframp-widget"), {
    widgetOrigin: "https://<this-app-origin>",
    address: "C...", // required: destination C-address
    asset: "XLM", // optional, default "XLM" ("XLM" | "USDC")
    amount: "10", // optional preset amount; omit to let the payer choose
    theme: "light", // optional, "light" | "dark"
    network: "PUBLIC", // optional, default "TESTNET"
    onSuccess: (result) => console.log("funded", result.txHash, result.amount, result.asset),
    onError: (message) => console.error("funding failed", message),
    onCancel: () => console.log("payer cancelled"),
  });
</script>
```

## Config reference

| Param          | Required | Values                     | Notes                                          |
| -------------- | -------- | --------------------------- | ----------------------------------------------- |
| `address`      | yes      | a valid C-address            | Where the funds go.                             |
| `asset`        | no       | `XLM` \| `USDC`               | Defaults to `XLM`.                              |
| `amount`       | no       | a positive decimal string    | Preset amount; omitted lets the payer type one. |
| `theme`        | no       | `light` \| `dark`             | Defaults to `light`.                            |
| `network`      | no       | `TESTNET` \| `PUBLIC`         | Defaults to `TESTNET`.                          |
| `parentOrigin` | yes      | your page's own origin       | See "Security" — the loader sets this for you.  |

## Result messages

The widget posts one of these to the host page as the payer interacts with
it (`type: "resize"` is loader-internal — it's what auto-sizes the iframe,
and generally not something you need to handle yourself):

```ts
type WidgetMessage =
  | { source: "aframp-widget"; type: "ready" }
  | { source: "aframp-widget"; type: "resize"; height: number }
  | { source: "aframp-widget"; type: "success"; txHash: string; amount: string; asset: "XLM" | "USDC" }
  | { source: "aframp-widget"; type: "error"; message: string }
  | { source: "aframp-widget"; type: "cancel" };
```

The full, canonical shape lives in
[`src/lib/widget.ts`](../src/lib/widget.ts); the loader script
(`public/aframp-widget.js`) implements the same contract independently,
since it can't import from `src/` — the two are kept in sync by
`src/__tests__/widgetLoader.test.ts`.

## Security

**The widget only ever posts a result to the exact `parentOrigin` you
declared** — never to `"*"` — so a result can't be delivered to (or read by)
any origin other than the one that configured that widget instance. That's
why `parentOrigin` is required: the widget has no reliable way to infer your
origin on its own (`document.referrer` is spoofable and often absent
entirely).

**On your side, validate `event.origin` before trusting any `message`
event.** Any page can `postMessage` to any window it has a reference to, so
origin is the only thing that tells you a message genuinely came from this
widget rather than an unrelated script. If you use the loader script, this
is handled for you — it checks both the event's origin and that the message
came from the specific iframe it created before invoking your callbacks.

**The widget itself can be framed by any origin.** There's no way to
restrict embedding to an allowlist ahead of time for a widget meant to be
embeddable by any dApp, so `/widget` intentionally omits the
`X-Frame-Options: DENY` / `frame-ancestors 'none'` this app sends on every
other route (see `next.config.ts`). That's not a gap — the postMessage
origin check above is the actual security boundary, the same way Stripe
Elements or similar embedded-payment widgets work: "can be framed by anyone"
is fine as long as results are only ever delivered to the origin that asked
for them.

## Live example

[`/widget-example.html`](/widget-example.html) is a minimal static host page
using the loader script end to end — open it directly (it's served as a
static asset by this app) to see both the embed and the message log.
