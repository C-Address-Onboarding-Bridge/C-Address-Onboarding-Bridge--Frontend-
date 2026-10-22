"use client";

import { useMemo } from "react";
import { useWallet } from "@/components/wallet-provider";
import { OnboardingChecklist, type ChecklistStep } from "@/components/OnboardingChecklist";

/**
 * The landing page's "Getting Started" checklist, with the connect step
 * ticked from the wallet state. A client component so the landing page can
 * stay a server component: it cannot call the wallet hook itself. (#850)
 */
export function getLandingOnboardingSteps(isConnected: boolean): ChecklistStep[] {
  return [
    {
      id: "connect-wallet",
      title: "Connect Wallet",
      description: "Connect your wallet to get started.",
      href: "/dashboard",
      check: () => isConnected,
    },
    {
      id: "choose-funding-route",
      title: "Choose Funding Route",
      description: "Select G-to-C bridge, fiat onramp, or CEX withdrawal.",
      href: "/bridge",
      check: () => false,
    },
    {
      id: "complete-first-transfer",
      title: "Complete First Transfer",
      description: "Fund your first C-address and confirm the transaction.",
      href: "/bridge",
      check: () => false,
    },
  ];
}

export function LandingOnboardingChecklist() {
  const { isConnected } = useWallet();
  const steps = useMemo(() => getLandingOnboardingSteps(isConnected), [isConnected]);
  return <OnboardingChecklist steps={steps} />;
}

export default LandingOnboardingChecklist;
