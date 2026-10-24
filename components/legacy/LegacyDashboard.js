"use client";

import { useEffect, useRef, useState } from "react";
import api from "../../lib/axios";
const scripts = [
  "/legacy/js/qrcode.min.js?v=20261022_24",
  "/legacy/js/hotel_billing_dialogs.js?v=20261022_24",
  "/legacy/js/hotel_billing_master_files.js?v=20261022_24",
  "/legacy/js/hotel_billing_walkin.js?v=20261022_24",
  "/legacy/js/hotel_billing_users.js?v=20261022_24",
  "/legacy/js/hotel_billing_approvals.js?v=20261022_24",
  "/legacy/js/hotel_billing_department.js?v=20261022_24",
  "/legacy/js/hotel_billing_restaurant.js?v=20261022_24",
  "/legacy/js/hotel_billing_auth.js?v=20261022_24",
  "/legacy/js/hotel_billing_realtime.js?v=20261022_24",
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = src;
    tag.onload = resolve;
    tag.onerror = () => reject(new Error(`Could not load ${src}`));
    document.body.appendChild(tag);
  });
}

export default function LegacyDashboard() {
  const mount = useRef(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function boot() {
      try {
        window.bootstrap = await import(
          "bootstrap/dist/js/bootstrap.bundle.min.js"
        );
        window.Swal = (await import("sweetalert2")).default;
        await import("sweetalert2/dist/sweetalert2.min.css");
        window.HotelApi = api;

        // Inject the LAN base URL so the QR code works when scanned from
        // a mobile device. Falls back to the current page origin if not set.
        window.__HOTEL_PORTAL_BASE =
          (window.location.hostname &&
          !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname))
            ? window.location.origin
            : (process.env.NEXT_PUBLIC_PORTAL_BASE_URL || "http://192.168.1.3:3000");

        const response = await fetch("/legacy/dashboard.html", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Dashboard template could not be loaded.");
        }

        const template = new DOMParser().parseFromString(
          await response.text(),
          "text/html",
        );
        const style = template.querySelector("style");

        if (style && !document.getElementById("hotel-dashboard-theme")) {
          style.id = "hotel-dashboard-theme";
          document.head.appendChild(style);
        }

        if (!active || !mount.current) return;

        mount.current.innerHTML = template.body.innerHTML;
        mount.current
          .querySelectorAll("script")
          .forEach((node) => node.remove());

        for (const source of scripts) {
          await loadScript(source);
        }
      } catch (cause) {
        if (active) {
          setError(cause.message || "The dashboard could not be started.");
        }
      }
    }

    boot();
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <main className="app-error">
        <h1>Dashboard unavailable</h1>
        <p>{error}</p>
        <p>Verify Apache, MySQL, and the PHP backend URL, then refresh.</p>
      </main>
    );
  }

  return <div ref={mount} aria-busy="true" />;
}
