// @vitest-environment jsdom
import React from "react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const wallet = vi.hoisted(() => ({ isConnected: false }));

vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => wallet,
}));
vi.mock("@/components/onboarding-flow", () => ({
  default: () => null,
}));
vi.mock("@/components/RecentActivityFeed", () => ({
  RecentActivityFeed: () => null,
}));
vi.mock("@/components/prefetch-link", () => ({
  PrefetchLink: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import LandingPage from "@/app/page";
import { getLandingOnboardingSteps } from "@/components/landing-onboarding-checklist";

const pageSource = readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf8");

beforeEach(() => {
  window.localStorage.clear();
  wallet.isConnected = false;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("landing page (#850)", () => {
  it("renders with the wallet-aware getting-started checklist", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: /onboarding layer/i })).toBeInTheDocument();
    expect(screen.getByText("Getting Started")).toBeInTheDocument();
    expect(screen.getByText("Choose Funding Route")).toBeInTheDocument();
    expect(screen.getByText("Complete First Transfer")).toBeInTheDocument();
  });

  it("stays a server component that never calls the wallet hook itself", () => {
    expect(pageSource).not.toMatch(/^\s*["']use client["']/m);
    expect(pageSource).not.toMatch(/\buseWallet\b/);
    expect(pageSource).not.toMatch(/\buseOnboardingSteps\b/);
  });
});

describe("getLandingOnboardingSteps (#850)", () => {
  it("ticks the connect step only when a wallet is connected", () => {
    const [connect, ...rest] = getLandingOnboardingSteps(false);
    expect(connect.id).toBe("connect-wallet");
    expect(connect.check()).toBe(false);
    expect(getLandingOnboardingSteps(true)[0].check()).toBe(true);
    for (const step of rest) expect(step.check()).toBe(false);
  });

  it("has unique step ids and in-app links", () => {
    const steps = getLandingOnboardingSteps(false);
    expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
    for (const step of steps) expect(step.href.startsWith("/")).toBe(true);
  });
});
