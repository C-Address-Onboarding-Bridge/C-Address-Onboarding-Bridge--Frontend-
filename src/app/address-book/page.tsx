import dynamic from "next/dynamic";

const AddressBookPage = dynamic(() => import("@/components/routes/address-book-page"), {
  loading: () => <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-sm text-[var(--text-muted)]">Loading address book…</div>,
});

export default function AddressBookRoutePage() {
  return <AddressBookPage />;
}
