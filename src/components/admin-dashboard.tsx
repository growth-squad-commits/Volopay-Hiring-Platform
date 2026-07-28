"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, LogOut, Plus, Users, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import type { Assessment, Candidate } from "@/lib/types";

type Modal = "assessment" | "candidate" | "import" | "review" | "access" | null;
type DraftQuestion = {
  title: string;
  prompt: string;
  points: number;
  response_type: "written" | "link" | "file_upload";
  is_required: boolean;
  written_answer_type: "short" | "long";
  word_limit: number | null;
  allowed_file_types: string[];
  maximum_file_size_mb: number;
  link_guidance: string;
};

type CandidateImportRow = {
  assessment_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  source: string;
  access_expires_at: string | null;
};
type BankItem = {
  id: number; title: string; prompt: string; marks: number;
  response_type: DraftQuestion["response_type"];
};
type QuestionBank = { id: number; title: string; subject: string; items: BankItem[] };

const freshQuestion = (): DraftQuestion => ({
  title: "",
  prompt: "",
  points: 10,
  response_type: "written",
  is_required: true,
  written_answer_type: "long",
  word_limit: null,
  allowed_file_types: ["pdf", "docx"],
  maximum_file_size_mb: 10,
  link_guidance: "",
});

const supabase = createClient();

function toLocalDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function parseImportExpiry(value: string | number | boolean | Date | null) {
  if (value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function AdminDashboard({ email }: { email: string }) {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reviewCandidate, setReviewCandidate] = useState<Candidate | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [questions, setQuestions] = useState<DraftQuestion[]>([freshQuestion()]);
  const [questionBanks, setQuestionBanks] = useState<QuestionBank[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<number | null>(null);
  const [selectedBankItemIds, setSelectedBankItemIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("assessments")
      .select("id,title,description,instructions,status,duration_minutes,total_points,available_from,available_until,questions:assessment_questions(*),candidates:candidates(*,responses:candidate_responses(*))")
      .order("created_at", { ascending: false });

    if (loadError) setError(loadError.message);
    else {
      const next = (data ?? []) as unknown as Assessment[];
      setAssessments(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    }
    const bankResponse = await fetch("/api/admin/question-banks", { cache: "no-store" });
    const bankResult = await bankResponse.json() as { banks?: QuestionBank[]; error?: string };
    if (bankResponse.ok) {
      const banks = bankResult.banks ?? [];
      setQuestionBanks(banks);
      setSelectedBankId((current) => current && banks.some((bank) => bank.id === current) ? current : banks[0]?.id ?? null);
    } else if (!loadError) setError(bankResult.error ?? "Could not load question banks.");
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const selected = assessments.find((item) => item.id === selectedId) ?? null;
  const allCandidates = useMemo(
    () => assessments.flatMap((assessment) => assessment.candidates.map((candidate) => ({ ...candidate, assessmentTitle: assessment.title }))),
    [assessments],
  );
  const submitted = allCandidates.filter((candidate) => ["submitted", "reviewed"].includes(candidate.status)).length;
  const toReview = allCandidates.filter((candidate) => candidate.status === "submitted" && candidate.decision === "pending").length;

  function notify(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3500);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.replace("/admin/login");
  }

  async function createAssessment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const from = new Date(String(form.get("available_from")));
    const until = new Date(String(form.get("available_until")));

    const customQuestions = questions.filter((question) => question.title.trim() || question.prompt.trim());
    if (!(until > from) || customQuestions.some((question) => !question.title.trim() || !question.prompt.trim()) || (!customQuestions.length && !selectedBankItemIds.length)) {
      setError("Add valid dates and complete every task.");
      setBusy(false);
      return;
    }

    const response = await fetch("/api/admin/assessments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: form.get("title"),
        description: form.get("description"),
        instructions: form.get("instructions"),
        durationMinutes: Number(form.get("duration")),
        status: form.get("status"),
        availableFrom: from.toISOString(),
        availableUntil: until.toISOString(),
        questions: customQuestions,
        bankItemIds: selectedBankItemIds,
      }),
    });
    const result = await response.json() as { error?: string };

    if (!response.ok) setError(result.error ?? "Could not create assessment.");
    else {
      setModal(null);
      setQuestions([freshQuestion()]);
      setSelectedBankItemIds([]);
      notify("Assessment created.");
      await load();
    }
    setBusy(false);
  }

  async function addCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const rawExpiry = String(form.get("access_expires_at") ?? "").trim();

    const response = await fetch("/api/admin/candidates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidates: [{
          assessmentId: selected.id,
          fullName: String(form.get("name")).trim(),
          email: String(form.get("email")).trim().toLowerCase(),
          phone: String(form.get("phone")).trim() || null,
          source: "manual",
          accessExpiresAt: rawExpiry ? new Date(rawExpiry).toISOString() : null,
        }],
      }),
    });

    const result = await response.json() as { error?: string; results?: { error?: string }[] };
    if (!response.ok) setError(result.error ?? result.results?.[0]?.error ?? "Could not add candidate.");
    else { setModal(null); notify("Candidate added."); await load(); }
    setBusy(false);
  }

  async function importCandidates(file: File) {
    if (!selected) return;
    setBusy(true);
    setError("");
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheet = await readXlsxFile(file) as unknown as (string | number | boolean | Date | null)[][];
    const rows: CandidateImportRow[] = [];
    const invalidRows: number[] = [];

    sheet.forEach((row, index) => {
      if (index === 0) return;
      const name = String(row[0] ?? "").trim();
      const candidateEmail = String(row[1] ?? "").trim().toLowerCase();
      const expiry = parseImportExpiry(row[3] ?? null);
      if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidateEmail) || (row[3] && !expiry)) {
        invalidRows.push(index + 1);
        return;
      }
      rows.push({
        assessment_id: selected.id,
        full_name: name,
        email: candidateEmail,
        phone: String(row[2] ?? "").trim() || null,
        source: "excel",
        access_expires_at: expiry,
      });
    });

    if (!rows.length) setError("No valid rows found. Use columns: Name, Email, Phone, Access Expires At.");
    else {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidates: rows.map((row) => ({
            assessmentId: row.assessment_id,
            fullName: row.full_name,
            email: row.email,
            phone: row.phone,
            source: row.source,
            accessExpiresAt: row.access_expires_at,
          })),
        }),
      });
      const result = await response.json() as { error?: string; invited?: number };
      if (!response.ok) setError(result.error ?? "Candidates could not be imported.");
      else {
        setModal(null);
        notify(`${result.invited ?? rows.length} candidates imported.${invalidRows.length ? ` Skipped rows: ${invalidRows.join(", ")}.` : ""}`);
        await load();
      }
    }
    setBusy(false);
  }

  async function saveDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewCandidate) return;
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const { error: updateError } = await supabase.from("candidates").update({
      score: Number(form.get("score")),
      decision: String(form.get("decision")),
      status: "reviewed",
    }).eq("id", reviewCandidate.id);

    if (updateError) setError(updateError.message);
    else { setModal(null); notify("Review saved."); await load(); }
    setBusy(false);
  }

  async function openSubmissionFile(path: string) {
    setError("");
    const { data, error: signedUrlError } = await supabase.storage
      .from("candidate-submissions")
      .createSignedUrl(path, 300);
    if (signedUrlError || !data?.signedUrl) {
      setError(signedUrlError?.message ?? "Could not open the submitted file.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function saveAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reviewCandidate) return;
    const form = new FormData(event.currentTarget);
    const isActive = form.get("is_active") === "true";
    if (!isActive && reviewCandidate.is_active && !window.confirm(`Deactivate access for ${reviewCandidate.full_name}?`)) return;

    setBusy(true);
    setError("");
    const rawExpiry = String(form.get("access_expires_at") ?? "").trim();
    const response = await fetch("/api/admin/candidates", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        candidateId: reviewCandidate.id,
        isActive,
        accessExpiresAt: rawExpiry ? new Date(rawExpiry).toISOString() : null,
      }),
    });
    const result = await response.json() as { error?: string };

    if (!response.ok) setError(result.error ?? "Could not update candidate access.");
    else { setModal(null); notify("Candidate access updated."); await load(); }
    setBusy(false);
  }

  async function exportCandidates() {
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [
      ["Name", "Email", "Assessment", "Status", "Score", "Decision", "Submitted"],
      ...allCandidates.map((candidate) => [candidate.full_name, candidate.email, candidate.assessmentTitle, candidate.status, candidate.score ?? "", candidate.decision, candidate.submitted_at ?? ""]),
    ].map((row) => row.map(escape).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "volopay-candidates.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return <main className="app-shell">
    <aside className="sidebar"><Brand /><nav><span>WORKSPACE</span><a className="active" href="/admin">Assessments</a><a href="/admin/question-banks">Question Banks</a></nav><button className="signout" onClick={signOut}><LogOut size={15}/> Sign out</button></aside>
    <section className="workspace"><header className="topbar"><span>{email}</span><strong>{email.slice(0, 2).toUpperCase()}</strong></header>
      <div className="content"><div className="heading"><div><span className="eyebrow">Admin workspace</span><h1>Assessments</h1><p>Create assessments and review candidate submissions in one place.</p></div><div className="actions"><button className="button secondary" onClick={() => void exportCandidates()}><Download size={15}/> Export</button><button className="button primary" onClick={() => setModal("assessment")}><Plus size={15}/> Create assessment</button></div></div>
        {notice && <div className="toast">{notice}</div>}{error && <div className="alert error">{error}</div>}
        <div className="metrics"><Metric value={allCandidates.length} label="Total candidates"/><Metric value={submitted} label="Submitted"/><Metric value={toReview} label="New to review"/></div>
        <div className="admin-grid"><section><div className="section-title"><h2>All assessments</h2><span>{assessments.length} assessments</span></div>
          {loading ? <div className="empty">Loading assessments…</div> : <div className="assessment-list">{assessments.map((assessment) => <button key={assessment.id} className={`assessment-row ${selectedId === assessment.id ? "selected" : ""}`} onClick={() => setSelectedId(assessment.id)}><div><strong>{assessment.title}</strong><span>{assessment.description || "No description"}</span><small>{assessment.duration_minutes} min · {assessment.total_points} points</small></div><div className="counts"><span><b>{assessment.candidates.length}</b>Candidates</span><span><b>{assessment.candidates.filter((candidate) => ["submitted", "reviewed"].includes(candidate.status)).length}</b>Submitted</span></div><em className={`status ${assessment.status}`}>{assessment.status}</em></button>)}</div>}
          <div className="section-title candidate-title"><h2>Candidates {selected ? `· ${selected.title}` : ""}</h2><div><button className="button secondary small" disabled={!selected} onClick={() => setModal("import")}><FileSpreadsheet size={14}/> Import Excel</button><button className="button primary small" disabled={!selected} onClick={() => setModal("candidate")}><Users size={14}/> Add candidate</button></div></div>
          <div className="table-wrap"><table><thead><tr><th>Candidate</th><th>Status</th><th>Access</th><th>Score</th><th>Decision</th><th>Submission</th></tr></thead><tbody>
            {(selected?.candidates ?? []).map((candidate) => {
              // The current time is intentionally read here so access expiry is accurate on each render.
              // eslint-disable-next-line react-hooks/purity
              const active = candidate.is_active && (!candidate.access_expires_at || new Date(candidate.access_expires_at).getTime() > Date.now());
              return <tr key={candidate.id}><td><strong>{candidate.full_name}</strong><small>{candidate.email}</small></td><td><em className={`status ${candidate.status}`}>{candidate.status.replaceAll("_", " ")}</em></td><td><button className="text-button" onClick={() => { setReviewCandidate(candidate); setModal("access"); }}>{active ? "Active" : candidate.is_active ? "Expired" : "Inactive"}</button></td><td>{candidate.score ?? "—"}</td><td>{candidate.decision}</td><td><button className="text-button" disabled={!['submitted','reviewed'].includes(candidate.status)} onClick={() => { setReviewCandidate(candidate); setModal("review"); }}>View & review</button></td></tr>;
            })}
          </tbody></table>{selected && !selected.candidates.length && <div className="empty">No candidates yet.</div>}</div>
        </section>
        <aside className="detail">{selected ? <><em className={`status ${selected.status}`}>{selected.status}</em><h2>{selected.title}</h2><p>{selected.instructions || selected.description}</p><dl><div><dt>Tasks</dt><dd>{selected.questions.length}</dd></div><div><dt>Duration</dt><dd>{selected.duration_minutes} min</dd></div><div><dt>Points</dt><dd>{selected.total_points}</dd></div></dl><h3>Questions</h3>{selected.questions.sort((a,b)=>a.sort_order-b.sort_order).map((question) => <div className="question-mini" key={question.id}><strong>{question.title}</strong><span>{question.response_type.replace("_"," ")} · {question.points} pts</span></div>)}</> : <div className="empty">Select an assessment.</div>}</aside></div>
      </div>
    </section>
    {modal && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setModal(null)}><X/></button>
      {modal === "assessment" && <form onSubmit={createAssessment}><h2>Create assessment</h2><div className="form-grid"><Field name="title" label="Title" required/><Field name="duration" label="Duration (minutes)" type="number" defaultValue="45" required/><Field name="available_from" label="Available from" type="datetime-local" required/><Field name="available_until" label="Available until" type="datetime-local" required/></div><Field name="description" label="Description"/><label>Instructions<textarea name="instructions" required/></label><label>Status<select name="status" defaultValue="published"><option value="draft">Draft</option><option value="published">Published</option></select></label>
        <div className="question-head"><h3>Add from question bank</h3></div>
        {questionBanks.length ? <><label>Question bank<select value={selectedBankId ?? ""} onChange={(event) => setSelectedBankId(Number(event.target.value))}>{questionBanks.map((bank) => <option key={bank.id} value={bank.id}>{bank.title} · {bank.subject}</option>)}</select></label><div className="responses">{questionBanks.find((bank) => bank.id === selectedBankId)?.items.map((item) => <label key={item.id}><input type="checkbox" checked={selectedBankItemIds.includes(item.id)} onChange={(event) => setSelectedBankItemIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}/>{item.title} · {item.response_type.replace("_", " ")} · {item.marks} points</label>)}</div></> : <p>No question banks yet. You can add tasks below.</p>}
        <div className="question-head"><h3>Custom tasks</h3><button type="button" className="button secondary small" onClick={() => setQuestions((value) => [...value, freshQuestion()])}><Plus size={14}/> Add task</button></div>{questions.map((question,index)=><div className="question-editor" key={index}><div><strong>Task {index+1}</strong>{questions.length>1&&<button type="button" onClick={()=>setQuestions((value)=>value.filter((_,itemIndex)=>itemIndex!==index))}>Remove</button>}</div><input placeholder="Task title" value={question.title} onChange={(event)=>setQuestions((value)=>value.map((item,itemIndex)=>itemIndex===index?{...item,title:event.target.value}:item))}/><textarea placeholder="Question or task instructions" value={question.prompt} onChange={(event)=>setQuestions((value)=>value.map((item,itemIndex)=>itemIndex===index?{...item,prompt:event.target.value}:item))}/><div className="form-grid"><label>Answer type<select value={question.response_type} onChange={(event)=>setQuestions((value)=>value.map((item,itemIndex)=>itemIndex===index?{...item,response_type:event.target.value as DraftQuestion['response_type']}:item))}><option value="written">Written answer</option><option value="link">Link</option><option value="file_upload">File upload</option></select></label><label>Points<input type="number" min="1" value={question.points} onChange={(event)=>setQuestions((value)=>value.map((item,itemIndex)=>itemIndex===index?{...item,points:Number(event.target.value)}:item))}/></label></div></div>)}<button className="button primary full" disabled={busy}>Create assessment</button></form>}
      {modal === "candidate" && <form onSubmit={addCandidate}><h2>Add candidate</h2><Field name="name" label="Full name" required/><Field name="email" label="Email" type="email" required/><Field name="phone" label="Phone"/><Field name="access_expires_at" label="Access expires at" type="datetime-local" required/><button className="button primary full" disabled={busy}>Add candidate</button></form>}
      {modal === "import" && <div><h2>Import candidates</h2><p>Upload an XLSX file with columns: Name, Email, Phone, Access Expires At. Expiry is optional.</p><label className="upload"><FileSpreadsheet/><span>Choose Excel file</span><input type="file" accept=".xlsx" onChange={(event) => event.target.files?.[0] && void importCandidates(event.target.files[0])}/></label></div>}
      {modal === "access" && reviewCandidate && <form onSubmit={saveAccess}><h2>Candidate access</h2><p>{reviewCandidate.full_name} · {reviewCandidate.email}</p><label>Access status<select name="is_active" defaultValue={String(reviewCandidate.is_active)}><option value="true">Active</option><option value="false">Inactive</option></select></label><Field name="access_expires_at" label="Access expires at" type="datetime-local" defaultValue={toLocalDateTime(reviewCandidate.access_expires_at)}/><p>Leave the expiry empty for no candidate-specific expiry.</p><button className="button primary full" disabled={busy}>Save access</button></form>}
      {modal === "review" && reviewCandidate && <form onSubmit={saveDecision}><h2>{reviewCandidate.full_name}</h2><p>{reviewCandidate.email}</p><div className="responses">{selected?.questions.sort((a,b)=>a.sort_order-b.sort_order).map((question)=>{const response=reviewCandidate.responses?.find((item)=>item.question_id===question.id);return <div key={question.id}><strong>{question.title}</strong><p>{response?.response_text||response?.response_url||response?.file_name||"No answer"}</p>{response?.response_url&&<a href={response.response_url} target="_blank" rel="noreferrer">Open link</a>}{response?.file_path&&<button type="button" className="response-link" onClick={()=>void openSubmissionFile(response.file_path!)}>Open submitted file</button>}</div>;})}</div><div className="form-grid"><Field name="score" label={`Score / ${selected?.total_points??100}`} type="number" defaultValue={String(reviewCandidate.score??"")} required/><label>Decision<select name="decision" defaultValue={reviewCandidate.decision}><option value="pending">Pending</option><option value="shortlisted">Shortlisted</option><option value="on_hold">On hold</option><option value="rejected">Rejected</option></select></label></div><button className="button primary full" disabled={busy}>Save review</button></form>}
    </div></div>}
  </main>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const { label, ...input } = props;
  return <label>{label}<input {...input}/></label>;
}
