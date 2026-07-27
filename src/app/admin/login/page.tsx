"use client";

import { FormEvent, useState } from "react";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const supabase = createClient();
    await supabase.auth.signOut();
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (signInError || !data.user) { setError("Invalid admin email or password."); setBusy(false); return; }
    const { data: admin } = await supabase.from("admin_profiles").select("is_active").eq("user_id", data.user.id).eq("is_active", true).maybeSingle();
    if (!admin) { await supabase.auth.signOut(); setError("This account is not an active administrator."); setBusy(false); return; }
    window.location.replace("/admin");
  }

  return <main className="auth-page">
    <section className="auth-visual"><Brand /><div><span>ADMIN WORKSPACE</span><h1>Run hiring assessments from one place.</h1><p>Create tests, invite candidates, review submissions and record decisions.</p></div></section>
    <section className="auth-panel"><form className="auth-card" onSubmit={submit}>
      <span className="eyebrow">Volopay Hiring Platform</span><h2>Admin sign in</h2><p>Only approved Volopay administrators can access this workspace.</p>
      {error && <div className="alert error">{error}</div>}
      <label>Email address<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
      <button className="button primary full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form></section>
  </main>;
}
