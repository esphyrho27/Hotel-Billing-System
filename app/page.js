import dynamic from "next/dynamic";

const LegacyDashboard = dynamic(
  () => import("../components/legacy/LegacyDashboard"),
  {
    ssr: false,
    loading: () => (
      <main className="app-loading">Loading hotel billing system…</main>
    ),
  },
);

export default function HomePage() {
  return <LegacyDashboard />;
}
