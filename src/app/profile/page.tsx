import dynamic from "next/dynamic";

const ProfilePage = dynamic(() => import("@/components/routes/profile-page"), {
  loading: () => <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-sm text-[var(--text-muted)]">Loading profile…</div>,
});

export default function ProfileRoutePage() {
  return <ProfilePage />;
}
