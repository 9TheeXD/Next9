"use client";

import { useEffect, useState } from "react";
import { AppLink } from "@/components/AppLink";
import { PageTransition } from "@/components/PageTransition";

// Development check page: confirms the Next.js app is up and that both legacy origins behind it
// (server.js API and the static pages) answer through the rewrites.
type Check = { label: string; url: string; status: "pending" | "ok" | "fail"; detail?: string };

const INITIAL: Check[] = [
  { label: "API (server.js)", url: "/api/photos/albums", status: "pending" },
  { label: "Legacy home page", url: "/", status: "pending" },
  { label: "Legacy photos page", url: "/photos/", status: "pending" },
];

export default function DevStatus() {
  const [checks, setChecks] = useState(INITIAL);

  useEffect(() => {
    INITIAL.forEach((check, i) => {
      fetch(check.url, { cache: "no-store" })
        .then((r) => ({ ok: r.status < 500, detail: `HTTP ${r.status}` }))
        .catch((e: Error) => ({ ok: false, detail: e.message }))
        .then(({ ok, detail }) =>
          setChecks((prev) => prev.map((c, j) => (j === i ? { ...c, status: ok ? "ok" : "fail", detail } : c))),
        );
    });
  }, []);

  return (
    <PageTransition>
    <main style={{ maxWidth: 560, margin: "48px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: "1.4rem", marginBottom: 6 }}>NEXT9 · Next.js dev status</h1>
      <p style={{ color: "var(--text-light)", marginBottom: 20, fontSize: ".9rem" }}>
        Routes without a Next.js page fall through to the legacy site.
      </p>
      <ul style={{ listStyle: "none", display: "grid", gap: 8 }}>
        {checks.map((c) => (
          <li
            key={c.url}
            style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 14px", background: "#fff", borderRadius: 10 }}
          >
            <span>
              {c.label} <code style={{ color: "var(--text-light)" }}>{c.url}</code>
            </span>
            <strong style={{ color: c.status === "ok" ? "#15803d" : c.status === "fail" ? "var(--accent)" : "#6b7280" }}>
              {c.status === "pending" ? "…" : `${c.status.toUpperCase()} ${c.detail ?? ""}`}
            </strong>
          </li>
        ))}
      </ul>
      <p style={{ marginTop: 20 }}>
        <AppLink href="/preview/photos/">Open /preview/photos/ (Next.js)</AppLink>
        {" · "}
        <AppLink href="/photos/">Open /photos/ (legacy)</AppLink>
      </p>
    </main>
    </PageTransition>
  );
}
