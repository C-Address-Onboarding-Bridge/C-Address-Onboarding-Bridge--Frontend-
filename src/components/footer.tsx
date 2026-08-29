/**
 * Site-wide footer.
 *
 * Structure:
 * - Brand/summary column describing the C-Address Bridge protocol.
 * - "Protocol" column: internal links to the three funding routes
 *   (`/bridge`, `/onramp`, `/cex`) that also appear in the navbar.
 * - "Resources" column: external links (Soroban docs, GitHub, Stellar.org),
 *   all opened via `target="_blank"` with `rel="noopener noreferrer"`.
 * - A bottom bar with a disclaimer and the protocol name.
 *
 * Purely presentational — no state, no props. Memoized since it never
 * changes across route navigations.
 */
import React, { memo } from "react";
import { Wallet } from "lucide-react";
import { PrefetchLink } from "./prefetch-link";

// Internal destinations must go through the router, not a raw <a>. A bare
// anchor triggers a full document load, which remounts WalletProvider and
// wipes its in-memory session refs — most visibly re-connecting a wallet the
// user had explicitly disconnected (#288) and re-showing a dismissed
// network-mismatch banner (#289). External links below stay plain anchors.
const protocolLinks = [
  { href: "/bridge", label: "G → C Bridge" },
  { href: "/onramp", label: "Fiat Onramp" },
  { href: "/cex", label: "CEX Withdrawal" },
];

const Footer = () => {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--primary)] to-[var(--secondary)] flex items-center justify-center">
                <Wallet className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-lg">C-Address Bridge</span>
            </div>
            <p className="text-sm text-[var(--text-muted)] max-w-md">
              The onboarding layer for Soroban dApps. Fund any C-address directly
              from a CEX, fiat onramp, or existing G-address.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Protocol</h3>
            <ul className="space-y-2">
              {protocolLinks.map((link) => (
                <li key={link.href}>
                  <PrefetchLink
                    href={link.href}
                    className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]"
                  >
                    {link.label}
                  </PrefetchLink>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Resources</h3>
            <ul className="space-y-2">
              <li><a href="https://soroban.stellar.org" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]">Soroban Docs</a></li>
              <li><a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]">GitHub</a></li>
              <li><a href="https://stellar.org" target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]">Stellar</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-[var(--text-muted)]">
            Built for the Stellar Soroban ecosystem. Not financial advice.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-[var(--text-muted)]">C-Address Bridge Protocol</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default memo(Footer);
