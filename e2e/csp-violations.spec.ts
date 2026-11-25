import { test, expect } from '@playwright/test';

/**
 * Regression test for #1020: the proxy must forward the CSP on the request
 * headers so Next.js can nonce its own inline RSC/bootstrap scripts. Any
 * securitypolicyviolation means the policy and the emitted scripts disagree.
 */
for (const path of ['/', '/bridge']) {
  test(`no CSP violations on ${path}`, async ({ page }) => {
    const violations: string[] = [];
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (event) => {
        (window as unknown as { __cspViolations: string[] }).__cspViolations ??= [];
        (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
          `${event.violatedDirective} ${event.blockedURI}`,
        );
      });
    });

    await page.goto(path);
    await page.waitForLoadState('networkidle');

    violations.push(
      ...(await page.evaluate(
        () => (window as unknown as { __cspViolations?: string[] }).__cspViolations ?? [],
      )),
    );
    expect(violations).toEqual([]);
  });
}
