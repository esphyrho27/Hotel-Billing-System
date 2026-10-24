"use client";

export default function Error({ reset }) {
  return (
    <main className="app-error">
      <h1>Unable to load the billing system</h1>
      <p>Refresh the page or confirm the PHP backend is available.</p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
