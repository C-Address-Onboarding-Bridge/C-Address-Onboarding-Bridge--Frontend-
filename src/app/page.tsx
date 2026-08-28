import { ArrowRight, Shield, Zap, CreditCard, Building2, Globe, Code } from "lucide-react";
import { PrefetchLink } from "@/components/prefetch-link";
import { RecentActivityFeed } from "@/components/RecentActivityFeed";
import OnboardingFlow from "@/components/onboarding-flow";

const features = [
  {
    icon: Zap,
    title: "G → C Bridge",
    description: "Instantly fund C-addresses from existing G-addresses with a single transaction.",
    href: "/bridge",
  },
  {
    icon: CreditCard,
    title: "Fiat Onramp",
    description: "Buy crypto with credit card via Moonpay or Transak and send directly to a C-address.",
    href: "/onramp",
  },
  {
    icon: Building2,
    title: "CEX Withdrawal",
    description: "Route exchange withdrawals directly to your Soroban smart account.",
    href: "/cex",
  },
  {
    icon: Shield,
    title: "Soroban Native",
    description: "Built on Soroban smart contracts for trustless G-to-C address routing.",
    href: "/bridge",
  },
];

const steps = [
  {
    step: "01",
    title: "Connect Wallet",
    // The connected Freighter account is the only possible source: Freighter
    // signs with its active account, so any other "from" address could only
    // fail at submission with tx_bad_auth. (#287)
    description: "Connect your Freighter wallet — the connected account funds the transfer.",
  },
  {
    step: "02",
    title: "Choose Funding Source",
    description: "Select from G-address, fiat onramp, or CEX withdrawal.",
  },
  {
    step: "03",
    title: "Enter C-Address",
    description: "Paste the Soroban smart account address you want to fund.",
  },
  {
    step: "04",
    title: "Confirm & Fund",
    description: "Review the details and confirm the transaction.",
  },
];

export default function LandingPage() {
  return (
    <div>
      {/* First-visit guided onboarding. Persists progress and suppresses itself
          once completed — see src/components/onboarding-flow.tsx. (#472) */}
      <OnboardingFlow />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--primary)]/5 via-transparent to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-32">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/20 text-sm text-[var(--primary-light)] mb-6">
              <Globe className="w-4 h-4" />
              Stellar Soroban Onboarding Protocol
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6">
              The Onboarding Layer for{" "}
              <span className="gradient-text">Soroban dApps</span>
            </h1>
            <p className="text-lg text-[var(--text-muted)] max-w-2xl mx-auto mb-10">
              Fund any Soroban smart account (C-address) directly — from a CEX withdrawal,
              a credit card, or an existing G-address. No account model knowledge required.
            </p>
            <div className="flex items-center justify-center gap-4">
              <PrefetchLink
                href="/bridge"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors glow"
              >
                Start Bridging
                <ArrowRight className="w-4 h-4" />
              </PrefetchLink>
              <PrefetchLink
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[var(--border)] text-[var(--foreground)] font-medium hover:bg-[var(--surface-2)] transition-colors"
              >
                <Code className="w-4 h-4" />
                Dashboard
              </PrefetchLink>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">
            One Protocol,{" "}
            <span className="gradient-text">Three Funding Methods</span>
          </h2>
          <p className="text-[var(--text-muted)] max-w-xl mx-auto">
            Choose how you want to fund your Soroban smart account.
            No technical knowledge required.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <PrefetchLink
                key={feature.title}
                href={feature.href}
                className="group relative p-6 rounded-xl border border-[var(--border)] bg-[var(--surface)] card-hover"
              >
                <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center mb-4 group-hover:bg-[var(--primary)]/20 transition-colors">
                  <Icon className="w-5 h-5 text-[var(--primary-light)]" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-[var(--text-muted)]">{feature.description}</p>
              </PrefetchLink>
            );
          })}
        </div>
      </section>

      <section className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-[var(--text-muted)] max-w-xl mx-auto">
              Four simple steps to fund any C-address
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <div key={step.step} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-6 left-[60%] w-[80%] h-px bg-gradient-to-r from-[var(--primary)]/40 to-transparent" />
                )}
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-[var(--primary)]/10 border border-[var(--primary)]/20 flex items-center justify-center mb-4">
                    <span className="text-sm font-bold text-[var(--primary-light)]">{step.step}</span>
                  </div>
                  <h3 className="font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-[var(--text-muted)]">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <RecentActivityFeed />

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="relative p-12 rounded-2xl border border-[var(--border)] bg-gradient-to-br from-[var(--primary)]/5 via-[var(--secondary)]/5 to-transparent overflow-hidden text-center">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--primary)]/5 rounded-full blur-3xl" />
          <h2 className="text-3xl font-bold mb-4 relative">
            Ready to Bridge?
          </h2>
          <p className="text-[var(--text-muted)] max-w-lg mx-auto mb-8 relative">
            Start funding Soroban smart accounts directly. No G-address required for new users.
          </p>
          <PrefetchLink
            href="/bridge"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-medium hover:bg-[var(--primary)]/90 transition-colors glow relative"
          >
            Launch Bridge
            <ArrowRight className="w-4 h-4" />
          </PrefetchLink>
        </div>
      </section>
    </div>
  );
}
