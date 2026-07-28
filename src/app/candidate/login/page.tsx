"use client";

import { FormEvent, useEffect, useState } from "react";
import { Brand } from "@/components/brand";

export default function CandidateLoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get("error");
    if (reason === "access_expired") setError("Your assessment access has expired. Please contact the hiring team.");
    else if (reason === "no_active_assignment") setError("No active assessment is available for this email.");
    else if (reason === "invalid_or_expired_link") setError("This secure sign-in link is invalid or has expired. Request a new link below.");
  }, []);

  async function requestMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) { setError("Enter your invitation email first."); return; }
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/auth/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? "Unable to send a secure sign-in link.");
    else setMessage("If this email has an active assessment, a secure sign-in link has been sent.");
    setBusy(false);
  }

  return <main className="auth-page">
    <section className="auth-visual candidate"><Brand /><div><span>CANDIDATE PORTAL</span><h1>Your next opportunity starts here.</h1><p>Access your assigned assessment and submit your work securely.</p></div></section>
    <section className="auth-panel"><form className="auth-card" onSubmit={requestMagicLink}>
      <span className="eyebrow">Candidate access</span><h2>Open your assessment</h2><p>Enter the email address used in your invitation.</p>
      {error && <div className="alert error">{error}</div>}{message && <div className="alert success">{message}</div>}
      <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
      <button className="button primary full" disabled={busy}>{busy ? "Sending secure link…" : "Email me a secure link"}</button>
    </form></section>
  </main>;
}
