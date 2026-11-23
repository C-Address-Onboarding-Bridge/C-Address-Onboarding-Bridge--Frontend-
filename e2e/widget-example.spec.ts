import { test, expect } from "@playwright/test";

test.describe("Widget Example Page (#1001)", () => {
  test("renders the widget iframe without CSP violations", async ({ page }) => {
    const cspViolations: string[] = [];

    await page.addInitScript(() => {
      window.addEventListener("securitypolicyviolation", (event) => {
        console.error(
          `[CSP_VIOLATION] violatedDirective=${event.violatedDirective} blockedURI=${event.blockedURI}`,
        );
      });
    });

    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[CSP_VIOLATION]") || /Content Security Policy|Refused to (execute|load|frame)/i.test(text)) {
        cspViolations.push(text);
      }
    });

    await page.goto("/widget-example");

    const iframe = page.locator('#caddress-widget iframe[title="Fund with C-Address Bridge"]');
    await expect(iframe).toBeVisible({ timeout: 10000 });
    expect(await iframe.getAttribute("src")).toContain("/widget?");
    expect(cspViolations).toEqual([]);
  });
});