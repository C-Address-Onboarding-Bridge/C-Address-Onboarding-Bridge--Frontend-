"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, ArrowRightLeft, Sparkles } from "lucide-react";
import OnboardingModal, {
  type OnboardingOption,
  type OnboardingStep,
} from "@/components/OnboardingModal";

/**
 * localStorage key that gates the guided flow. A stored value of "completed"
 * suppresses the auto-open on next visit. (#472)
 */
export const ONBOARDING_STORAGE_KEY = "onboarding:guided:v1";

const INTRO_STEP: OnboardingStep = {
  title: "What is a C-address?",
  description:
    "A C-address is a smart contract account on Stellar (Soroban). It starts with “C”, is controlled by code instead of a single private key, and can hold programmatic rules like multisig, sessions and automatic payments — which is why an ordinary G-address wallet can’t send to it directly.",
  icon: <Sparkles className="w-6 h-6 text-[var(--primary-light)]" />,
  options: [
    {
      id: "new",
      label: "I'm new to Stellar",
      description: "I don't have a wallet yet — walk me through it.",
    },
    {
      id: "have-g",
      label: "I already have a G-address",
      description: "I have a classic Stellar wallet (e.g. Freighter).",
    },
  ],
};

const ROUTES_STEP: OnboardingStep = {
  title: "How do you want to fund your C-address?",
  description:
    "Pick the route that matches what you have today. Your C-address works the same no matter how it's funded.",
  icon: <ArrowRightLeft className="w-6 h-6 text-[var(--primary-light)]" />,
  options: [
    {
      id: "cex",
      label: "From an exchange",
      description: "Withdraw USDC or XLM from a CEX directly to your C-address.",
      nextStep: 2,
    },
    {
      id: "card",
      label: "With a credit card",
      description: "Buy crypto with a card (Moonpay / Transak) and send it to your C-address.",
      nextStep: 2,
    },
    {
      id: "g-address",
      label: "From my G-address",
      description: "Send XLM or USDC from my existing Stellar wallet.",
      nextStep: 2,
    },
  ],
};

const GENERIC_FINAL_STEP: OnboardingStep = {
  title: "Ready to fund your C-address?",
  description:
    "Head over to the funding route you picked, or explore the dashboard. This guide stays available from your profile page if you need it again.",
  icon: <Wallet className="w-6 h-6 text-[var(--primary-light)]" />,
  nextLabel: "Get started",
};

/** Static three-step guide, reused by the profile page's "reopen" control. */
export const GUIDED_STEPS: OnboardingStep[] = [
  INTRO_STEP,
  ROUTES_STEP,
  GENERIC_FINAL_STEP,
];

/** Route each funding option hands off to when the flow completes. */
const ROUTE_BY_OPTION: Record<string, { label: string; href: string }> = {
  cex: { label: "exchange", href: "/cex" },
  card: { label: "card", href: "/onramp" },
  "g-address": { label: "G-address", href: "/bridge" },
};

/**
 * First-visit guided onboarding (#472).
 *
 * Auto-opens on the landing page until the user completes (or explicitly
 * dismisses and later reopens) the flow. Progress is persisted in
 * localStorage, so skipping mid-way resumes where the user left off instead of
 * starting over, and finishing writes "completed" so the flow doesn't nag on
 * every visit. The chosen funding route hands off to its page on completion.
 */
export default function OnboardingFlow() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [chosenRoute, setChosenRoute] = useState<{
    label: string;
    href: string;
  } | null>(null);

  // Read storage only after mount so SSR and the first client render agree
  // ("closed"), then the effect flips the modal open for first-time visitors.
  // A stored "completed" value (written when the flow finishes) suppresses it.
  useEffect(() => {
    let completed = false;
    try {
      completed = localStorage.getItem(ONBOARDING_STORAGE_KEY) === "completed";
    } catch {
      // Storage unavailable — treat as first visit.
    }
    if (!completed) setIsOpen(true);
  }, []);

  const steps: OnboardingStep[] = useMemo(() => {
    if (!chosenRoute) return GUIDED_STEPS;
    return [
      INTRO_STEP,
      ROUTES_STEP,
      {
        title: `Great — ${chosenRoute.label} it is`,
        description: `Head over to the ${chosenRoute.label} flow to fund your C-address. This guide stays available from your profile page if you need it again.`,
        icon: <Wallet className="w-6 h-6 text-[var(--primary-light)]" />,
        nextLabel: `Go to ${chosenRoute.label}`,
      },
    ];
  }, [chosenRoute]);

  const handleOption = (option: OnboardingOption, stepIndex: number) => {
    // Only the funding-routes step records a choice.
    if (stepIndex === 1) {
      const route = ROUTE_BY_OPTION[option.id];
      if (route) setChosenRoute(route);
    }
  };

  const handleComplete = () => {
    if (chosenRoute) {
      router.push(chosenRoute.href);
    }
  };

  return (
    <OnboardingModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      onComplete={handleComplete}
      steps={steps}
      storageKey={ONBOARDING_STORAGE_KEY}
      onOption={handleOption}
    />
  );
}
