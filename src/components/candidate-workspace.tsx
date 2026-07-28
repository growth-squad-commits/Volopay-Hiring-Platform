"use client";

import { useCallback, useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";

type Assignment = {
  id: number; full_name: string; status: string; score: number | null; decision: string;
  submitted_at: string | null; started_at: string | null; expires_at: string | null;
  assessment: { id: number; title: string; description: string; duration_minutes: number; total_points: number; available_from: string; available_until: string; questions: { id: number }[] };
};
const supabase = createClient();

export function CandidateWorkspace({ email }: { email: string }) {
  const [items, setItems] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase.from("candidates")
      .select("id,full_name,status,score,decision,submitted_at,started_at,expires_at,assessment:assessments(id,title,description,duration_minutes,total_points,available_from,available_until,questions:assessment_questions(id))")
      .eq("email", email.toLowerCase())
      .order("created_at", { ascending: false });
    if (queryError) setError(queryError.message); else setItems((data ?? []) as unknown as Assignment[]);
    setNow(Date.now()); setLoading(false);
  }, [email]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);

  async function start(id: number) {
    setError("");
    const { error: updateError } = await supabase.from("candidates").update({ status: "in_progress" }).eq("id", id).eq("status", "not_started");
    if (updateError) setError(updateError.message); else window.location.assign(`/candidate/assessment/${id}`);
  }
  async function signOut() { await supabase.auth.signOut(); window.location.replace("/candidate/login"); }

  return <main className="candidate-shell"><header className="candidate-header"><Brand/><div><span>{email}</span><button onClick={signOut}>Sign out</button></div></header>
    <section className="candidate-content"><span className="eyebrow">Candidate workspace</span><h1>Your assessments</h1><p>Read the instructions before starting. The fixed timer starts when you begin.</p>
      {error && <div className="alert error">{error}</div>}
      {loading ? <div className="empty">Loading assessments…</div> : !items.length ? <div className="empty card">No published assessment is assigned to {email}.</div> :
      <div className="candidate-list">{items.map((item) => {
        const starts = new Date(item.assessment.available_from).getTime(); const ends = new Date(item.assessment.available_until).getTime();
        const open = now >= starts && now <= ends;
        return <article className="candidate-card" key={item.id}><div><em className={`status ${item.status}`}>{item.status.replaceAll("_"," ")}</em><h2>{item.assessment.title}</h2><p>{item.assessment.description}</p></div>
          <dl><div><dt>Duration</dt><dd>{item.assessment.duration_minutes} min</dd></div><div><dt>Tasks</dt><dd>{item.assessment.questions.length}</dd></div><div><dt>Total</dt><dd>{item.assessment.total_points} points</dd></div></dl>
          {["submitted","reviewed"].includes(item.status) ? <div className="submitted"><span>Submitted</span>{item.score !== null && <strong>{item.score}/{item.assessment.total_points}</strong>}<a href={`/candidate/submission/${item.id}`}>View submission</a></div> :
          item.status === "in_progress" ? <a className="button primary" href={`/candidate/assessment/${item.id}`}>Continue assessment</a> :
          <button className="button primary" disabled={!open} onClick={() => void start(item.id)}>{open ? "Start assessment" : now < starts ? "Not open yet" : "Window closed"}</button>}
        </article>;
      })}</div>}
    </section></main>;
}
