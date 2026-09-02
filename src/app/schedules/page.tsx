import dynamic from "next/dynamic";

const FundingSchedulesPage = dynamic(() => import("@/components/routes/funding-schedules-page"), {
  loading: () => <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-sm text-[var(--text-muted)]">Loading schedules…</div>,
});

export default function SchedulesRoutePage() {
  return <FundingSchedulesPage />;
}
