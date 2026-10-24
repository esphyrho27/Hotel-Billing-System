import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-error">
      <h1>Page not found</h1>
      <p>This billing route does not exist.</p>
      <Link className="btn btn-primary" href="/">
        Return to dashboard
      </Link>
    </main>
  );
}
