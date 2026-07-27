"use client";

import { FormEvent, useState } from "react";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";

const demoEmail = process.env.NEXT_PUBLIC_DEMO_CANDIDATE_EMAIL ?? "candidate.demo@volopay.co";
const demoPassword = process.env.NEXT_PUBLIC_DEMO_CANDIDATE_PASSWORD ?? "VolopayTest2026!";

export default function CandidateLoginPage() {
  const [email, setEmail] = useState(demoEmail);
  const [password, setPassword] = useState(demoPassword);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function passwordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const { data, error: signInError } = await createClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (signInError || !data.user) { setError(signInError?.message ?? "Unable to sign in."); setBusy(false); return; }
    window.location.replace("/candidate");
  }

  async function magicLink() {
    if (!email.trim()) { setError("Enter your invitation email first."); return; }
    setBusy(true); setError(""); setMessage("");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error: otpError } = await createClient().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false, emailRedirectTo: `${siteUrl}/auth/callback?next=/candidate` },
    });
    if (otpError) setError(otpError.message); else setMessage("A secure sign-in link has been sent to your email.");
    setBusy(false);
  }

  return <main className="auth-page">
    <section className="auth-visual candidate"><Brand /><div><span>CANDIDATE PORTAL</span><h1>Your next opportunity starts here.</h1><p>Access your assigned assessment and submit your work securely.</p></div></section>
    <section className="auth-panel"><form className="auth-card" onSubmit={passwordLogin}>
      <span className="eyebrow">Candidate access</span><h2>Sign in to your assessment</h2><p>Use the email from your invitation. The sample account is filled in for testing.</p>
      <div className="sample-box"><strong>Sample test account</strong><span>{demoEmail}</span><span>{demoPassword}</span></div>
      {error && <div className="alert error">{error}</div>}{message && <div className="alert success">{message}</div>}
      <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <button className="button primary full" disabled={busy}>{busy ? "Please wait…" : "Sign in with sample account"}</button>
      <div className="divider"><span>future candidate access</span></div>
      <button className="button secondary full" type="button" onClick={magicLink} disabled={busy}>Email me a magic link</button>
    </form></section>
  </main>;
}
