"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, LogOut, Plus, Users, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import type { Assessment, Candidate } from "@/lib/types";

type Modal = "assessment" | "candidate" | "import" | "review" | "access" | null;
type DraftQuestion = {
  title: string; prompt: string; points: number; response_type: "written" | "link" | "file_upload";
  is_required: boolean; written_answer_type: "short" | "long"; word_limit: number | null;
  allowed_file_types: string[]; maximum_file_size_mb: number; link_guidance: string;
};
const freshQuestion = (): DraftQuestion => ({ title: "", prompt: "", points: 10, response_type: "written", is_required: true, written_answer_type: "long", word_limit: null, allowed_file_types: ["pdf", "docx"], maximum_file_size_mb: 10, link_guidance: "" });
const supabase = createClient();

export function AdminDashboard({ email }: { email: string }) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reviewCandidate, setReviewCandidate] = useState<Candidate | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [questions, setQuestions] = useState<DraftQuestion[]>([freshQuestion()]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: loadError } = await supabase.from("assessments")
      .select("id,title,description,instructions,status,duration_minutes,total_points,available_from,available_until,questions:assessment_questions(*),candidates:candidates(*,responses:candidate_responses(*))")
      .order("created_at", { ascending: false });
    if (loadError) setError(loadError.message);
    else {
      const next = (data ?? []) as unknown as Assessment[];
      setAssessments(next);
      setSelectedId((current) => current && next.some((a) => a.id === current) ? current : next[0]?.id ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  const selected = assessments.find((item) => item.id === selectedId) ?? null;
  const allCandidates = useMemo(() => assessments.flatMap((a) => a.candidates.map((c) => ({ ...c, assessmentTitle: a.title }))), [assessments]);
  const submitted = allCandidates.filter((c) => ["submitted", "reviewed"].includes(c.status)).length;
  const toReview = allCandidates.filter((c) => c.status === "submitted" && c.decision === "pending").length;

  function notify(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 3500); }
  async function signOut() { await supabase.auth.signOut(); window.location.replace("/admin/login"); }

  async function createAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const from = new Date(String(form.get("available_from")));
    const until = new Date(String(form.get("available_until")));
    if (!(until > from) || questions.some((q) => !q.title.trim() || !q.prompt.trim())) { setError("Add valid dates and complete every task."); setBusy(false); return; }
    const total = questions.reduce((sum, q) => sum + Number(q.points), 0);
    const { data: assessment, error: assessmentError } = await supabase.from("assessments").insert({
      title: String(form.get("title")).trim(), description: String(form.get("description")).trim(),
      instructions: String(form.get("instructions")).trim(), duration_minutes: Number(form.get("duration")),
      total_points: total, status: String(form.get("status")), available_from: from.toISOString(), available_until: until.toISOString(),
    }).select("id").single();
    if (assessmentError || !assessment) { setError(assessmentError?.message ?? "Could not create assessment."); setBusy(false); return; }
    const { error: questionError } = await supabase.from("assessment_questions").insert(questions.map((q, index) => ({
      assessment_id: assessment.id, title: q.title.trim(), prompt: q.prompt.trim(), points: Number(q.points), sort_order: index,
      response_type: q.response_type, is_required: q.is_required,
      written_answer_type: q.response_type === "written" ? q.written_answer_type : null,
      word_limit: q.response_type === "written" ? q.word_limit : null,
      allowed_file_types: q.response_type === "file_upload" ? q.allowed_file_types : null,
      maximum_file_size_mb: q.response_type === "file_upload" ? q.maximum_file_size_mb : null,
      link_guidance: q.response_type === "link" ? q.link_guidance : null,
    })));
    if (questionError) setError(questionError.message); else { setModal(null); setQuestions([freshQuestion()]); notify("Assessment created."); await load(); }
    setBusy(false);
  }

  async function addCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); setError(""); const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/candidates", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ candidates: [{
        assessmentId: selected.id, fullName: String(form.get("name")).trim(),
        email: String(form.get("email")).trim().toLowerCase(),
        phone: String(form.get("phone")).trim() || null, source: "manual",
      }] }),
    });
    const result = await response.json() as { error?: string; results?: { error?: string }[] };
    if (!response.ok) setError(result.error ?? result.results?.[0]?.error ?? "Could not add candidate.");
    else { setModal(null); notify("Candidate added."); await load(); }
    setBusy(false);
  }

  async function importCandidates(file: File) {
    if (!selected) return;
    setBusy(true); setError("");
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheet = await readXlsxFile(file) as unknown as (string | number | boolean | Date | null)[][];
    const rows: { assessment_id: number; full_name: string; email: string; phone: string | null; source: string }[] = [];
    sheet.forEach((row, index) => {
      if (index === 0) return;
      const name = String(row[0] ?? "").trim(); const candidateEmail = String(row[1] ?? "").trim().toLowerCase();
      if (name && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail)) rows.push({ assessment_id: selected.id, full_name: name, email: candidateEmail, phone: String(row[2] ?? "").trim() || null, source: "excel" });
    });
    if (!rows.length) setError("No valid rows found. Use columns: Name, Email, Phone.");
    else {
      const response = await fetch("/api/admin/candidates", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidates: rows.map((row) => ({
          assessmentId: row.assessment_id, fullName: row.full_name, email: row.email,
          phone: row.phone, source: row.source,
        })) }),
      });
      const result = await response.json() as { error?: string; invited?: number; failed?: number };
      if (!response.ok) setError(result.error ?? "Candidates could not be imported.");
      else { setModal(null); notify(`${result.invited ?? rows.length} candidates imported.`); await load(); }
    }
    setBusy(false);
  }

  async function saveDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!reviewCandidate) return;
    setBusy(true); const form = new FormData(event.currentTarget);
    const { error: updateError } = await supabase.from("candidates").update({ score: Number(form.get("score")), decision: String(form.get("decision")), status: "reviewed" }).eq("id", reviewCandidate.id);
    if (updateError) setError(updateError.message); else { setModal(null); notify("Review saved."); await load(); }
    setBusy(false);
  }

  async function saveAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!reviewCandidate) return;
    setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const rawExpiry = String(form.get("access_expires_at") ?? "").trim();
    const { error: updateError } = await supabase.from("candidates").update({
      is_active: form.get("is_active") === "true",
      access_expires_at: rawExpiry ? new Date(rawExpiry).toISOString() : null,
    }).eq("id", reviewCandidate.id);
    if (updateError) setError(updateError.message); else { setModal(null); notify("Candidate access updated."); await load(); }
    setBusy(false);
  }

  async function exportCandidates() {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      ["Name","Email","Assessment","Status","Score","Decision","Submitted"],
      ...allCandidates.map((c) => [c.full_name,c.email,c.assessmentTitle,c.status,c.score ?? "",c.decision,c.submitted_at ?? ""]),
    ].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "volopay-candidates.csv"; link.click(); URL.revokeObjectURL(url);
  }

  return <main className="app-shell">
    <aside className="sidebar"><Brand /><nav><span>WORKSPACE</span><button className="active">Assessments</button></nav><button className="signout" onClick={signOut}><LogOut size={15}/> Sign out</button></aside>
    <section className="workspace"><header className="topbar"><span>{email}</span><strong>{email.slice(0, 2).toUpperCase()}</strong></header>
      <div className="content"><div className="heading"><div><span className="eyebrow">Admin workspace</span><h1>Assessments</h1><p>Create assessments and review candidate submissions in one place.</p></div><div className="actions"><button className="button secondary" onClick={() => void exportCandidates()}><Download size={15}/> Export</button><button className="button primary" onClick={() => setModal("assessment")}><Plus size={15}/> Create assessment</button></div></div>
        {notice && <div className="toast">{notice}</div>}{error && <div className="alert error">{error}</div>}
        <div className="metrics"><Metric value={allCandidates.length} label="Total candidates"/><Metric value={submitted} label="Submitted"/><Metric value={toReview} label="New to review"/></div>
        <div className="admin-grid"><section><div className="section-title"><h2>All assessments</h2><span>{assessments.length} assessments</span></div>
          {loading ? <div className="empty">Loading assessments…</div> : <div className="assessment-list">{assessments.map((a) => <button key={a.id} className={`assessment-row ${selectedId === a.id ? "selected" : ""}`} onClick={() => setSelectedId(a.id)}>
            <div><strong>{a.title}</strong><span>{a.description || "No description"}</span><small>{a.duration_minutes} min · {a.total_points} points</small></div>
            <div className="counts"><span><b>{a.candidates.length}</b>Candidates</span><span><b>{a.candidates.filter((c) => ["submitted","reviewed"].includes(c.status)).length}</b>Submitted</span></div><em className={`status ${a.status}`}>{a.status}</em>
          </button>)}</div>}
          <div className="section-title candidate-title"><h2>Candidates {selected ? `· ${selected.title}` : ""}</h2><div><button className="button secondary small" disabled={!selected} onClick={() => setModal("import")}><FileSpreadsheet size={14}/> Import Excel</button><button className="button primary small" disabled={!selected} onClick={() => setModal("candidate")}><Users size={14}/> Add candidate</button></div></div>
          <div className="table-wrap"><table><thead><tr><th>Candidate</th><th>Status</th><th>Access</th><th>Score</th><th>Decision</th><th>Submission</th></tr></thead><tbody>
            {(selected?.candidates ?? []).map((c) => <tr key={c.id}><td><strong>{c.full_name}</strong><small>{c.email}</small></td><td><em className={`status ${c.status}`}>{c.status.replaceAll("_"," ")}</em></td><td><button className="text-button" onClick={() => { setReviewCandidate(c); setModal("access"); }}>{c.is_active && (!c.access_expires_at || new Date(c.access_expires_at).getTime() > Date.now()) ? "Active" : "Inactive"}</button></td><td>{c.score ?? "—"}</td><td>{c.decision}</td><td><button className="text-button" disabled={!['submitted','reviewed'].includes(c.status)} onClick={() => { setReviewCandidate(c); setModal("review"); }}>View & review</button></td></tr>)}
          </tbody></table>{selected && !selected.candidates.length && <div className="empty">No candidates yet.</div>}</div>
        </section>
        <aside className="detail">{selected ? <><em className={`status ${selected.status}`}>{selected.status}</em><h2>{selected.title}</h2><p>{selected.instructions || selected.description}</p><dl><div><dt>Tasks</dt><dd>{selected.questions.length}</dd></div><div><dt>Duration</dt><dd>{selected.duration_minutes} min</dd></div><div><dt>Points</dt><dd>{selected.total_points}</dd></div></dl><h3>Questions</h3>{selected.questions.sort((a,b)=>a.sort_order-b.sort_order).map((q) => <div className="question-mini" key={q.id}><strong>{q.title}</strong><span>{q.response_type.replace("_"," ")} · {q.points} pts</span></div>)}</> : <div className="empty">Select an assessment.</div>}</aside></div>
      </div>
    </section>
    {modal && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setModal(null)}><X/></button>
      {modal === "assessment" && <form onSubmit={createAssessment}><h2>Create assessment</h2><div className="form-grid"><Field name="title" label="Title" required/><Field name="duration" label="Duration (minutes)" type="number" defaultValue="45" required/><Field name="available_from" label="Available from" type="datetime-local" required/><Field name="available_until" label="Available until" type="datetime-local" required/></div><Field name="description" label="Description"/><label>Instructions<textarea name="instructions" required/></label><label>Status<select name="status" defaultValue="published"><option value="draft">Draft</option><option value="published">Published</option></select></label>
        <div className="question-head"><h3>Tasks</h3><button type="button" className="button secondary small" onClick={() => setQuestions((v) => [...v, freshQuestion()])}><Plus size={14}/> Add task</button></div>
        {questions.map((q, index) => <div className="question-editor" key={index}><div><strong>Task {index + 1}</strong>{questions.length > 1 && <button type="button" onClick={() => setQuestions((v) => v.filter((_,i)=>i!==index))}>Remove</button>}</div><input placeholder="Task title" value={q.title} onChange={(e)=>setQuestions((v)=>v.map((x,i)=>i===index?{...x,title:e.target.value}:x))}/><textarea placeholder="Question or task instructions" value={q.prompt} onChange={(e)=>setQuestions((v)=>v.map((x,i)=>i===index?{...x,prompt:e.target.value}:x))}/><div className="form-grid"><label>Answer type<select value={q.response_type} onChange={(e)=>setQuestions((v)=>v.map((x,i)=>i===index?{...x,response_type:e.target.value as DraftQuestion["response_type"]}:x))}><option value="written">Written answer</option><option value="link">Link</option><option value="file_upload">File upload</option></select></label><label>Points<input type="number" min="1" value={q.points} onChange={(e)=>setQuestions((v)=>v.map((x,i)=>i===index?{...x,points:Number(e.target.value)}:x))}/></label></div></div>)}
        <button className="button primary full" disabled={busy}>Create assessment</button></form>}
      {modal === "candidate" && <form onSubmit={addCandidate}><h2>Add candidate</h2><Field name="name" label="Full name" required/><Field name="email" label="Email" type="email" required/><Field name="phone" label="Phone"/><button className="button primary full" disabled={busy}>Add candidate</button></form>}
      {modal === "import" && <div><h2>Import candidates</h2><p>Upload an XLSX file with Name, Email and Phone in the first three columns.</p><label className="upload"><FileSpreadsheet/><span>Choose Excel file</span><input type="file" accept=".xlsx" onChange={(e)=>e.target.files?.[0]&&void importCandidates(e.target.files[0])}/></label></div>}
      {modal === "access" && reviewCandidate && <form onSubmit={saveAccess}><h2>Candidate access</h2><p>{reviewCandidate.full_name} · {reviewCandidate.email}</p><label>Access status<select name="is_active" defaultValue={String(reviewCandidate.is_active)}><option value="true">Active</option><option value="false">Inactive</option></select></label><Field name="access_expires_at" label="Access expires at" type="datetime-local" defaultValue={reviewCandidate.access_expires_at ? new Date(new Date(reviewCandidate.access_expires_at).getTime() - new Date(reviewCandidate.access_expires_at).getTimezoneOffset() * 60000).toISOString().slice(0,16) : ""}/><p>Leave the expiry empty for no additional candidate-specific expiry.</p><button className="button primary full" disabled={busy}>Save access</button></form>}
      {modal === "review" && reviewCandidate && <form onSubmit={saveDecision}><h2>{reviewCandidate.full_name}</h2><p>{reviewCandidate.email}</p><div className="responses">{selected?.questions.sort((a,b)=>a.sort_order-b.sort_order).map((q) => { const r = reviewCandidate.responses?.find((x)=>x.question_id===q.id); return <div key={q.id}><strong>{q.title}</strong><p>{r?.response_text || r?.response_url || r?.file_name || "No answer"}</p>{r?.response_url && <a href={r.response_url} target="_blank" rel="noreferrer">Open link</a>}</div>; })}</div><div className="form-grid"><Field name="score" label={`Score / ${selected?.total_points ?? 100}`} type="number" defaultValue={String(reviewCandidate.score ?? "")} required/><label>Decision<select name="decision" defaultValue={reviewCandidate.decision}><option value="pending">Pending</option><option value="shortlisted">Shortlisted</option><option value="on_hold">On hold</option><option value="rejected">Rejected</option></select></label></div><button className="button primary full" disabled={busy}>Save review</button></form>}
    </div></div>}
  </main>;
}

function Metric({ value, label }: { value: number; label: string }) { return <div className="metric"><strong>{value}</strong><span>{label}</span></div>; }
function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { const { label, ...input } = props; return <label>{label}<input {...input}/></label>; }