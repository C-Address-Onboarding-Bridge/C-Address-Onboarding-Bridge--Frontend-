import React, { memo } from "react";
import Link from "next/link";
import { Wallet } from "lucide-react";

const protocolLinks = [
  { href: "/bridge", label: "G → C Bridge" },
  { href: "/onramp", label: "Fiat Onramp" },
  { href: "/cex", label: "CEX Withdrawal" },
];

const resourceLinks = [
  { href: "https://soroban.stellar.org", label: "Soroban Docs" },
  { href: "https://github.com", label: "GitHub" },
  { href: "https://stellar.org", label: "Stellar" },
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
            {/*
              Internal routes go through next/link, never a bare <a>. A raw
              anchor triggers a full document load, which tears down the client
              tree — the wallet session in WalletProvider is in-memory only, so
              a footer click would drop the connected address, the network
              status and any half-filled bridge/onramp form.
            */}
            <ul className="space-y-2">
              {protocolLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3">Resources</h3>
            {/* External destinations stay plain anchors: next/link has nothing
                to prefetch or client-navigate off-origin. */}
            <ul className="space-y-2">
              {resourceLinks.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)]"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
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
