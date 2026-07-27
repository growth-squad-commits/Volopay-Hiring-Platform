"use client";

import { FormEvent, useState } from "react";
import { Brand } from "@/components/brand";

export default function CandidateLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function passwordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, portal: "candidate" }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setError(result.error ?? "Unable to sign in."); setBusy(false); return; }
    window.location.replace("/candidate");
  }

  async function magicLink() {
    if (!email.trim()) { setError("Enter your invitation email first."); return; }
    setBusy(true); setError(""); setMessage("");
    const response = await fetch("/api/auth/magic-link", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? "Unable to send a secure sign-in link.");
    else setMessage("A secure sign-in link has been sent to your email.");
    setBusy(false);
  }

  return <main className="auth-page">
    <section className="auth-visual candidate"><Brand /><div><span>CANDIDATE PORTAL</span><h1>Your next opportunity starts here.</h1><p>Access your assigned assessment and submit your work securely.</p></div></section>
    <section className="auth-panel"><form className="auth-card" onSubmit={passwordLogin}>
      <span className="eyebrow">Candidate access</span><h2>Sign in to your assessment</h2><p>Use the email from your invitation.</p>
      {error && <div className="alert error">{error}</div>}{message && <div className="alert success">{message}</div>}
      <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <button className="button primary full" disabled={busy}>{busy ? "Please wait…" : "Sign in"}</button>
      <div className="divider"><span>or continue passwordless</span></div>
      <button className="button secondary full" type="button" onClick={magicLink} disabled={busy}>Email me a secure link</button>
    </form></section>
  </main>;
}
