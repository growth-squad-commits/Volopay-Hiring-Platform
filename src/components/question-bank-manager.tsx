"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Copy, FileSpreadsheet, LogOut, Pencil, Plus, Trash2, X } from "lucide-react";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import { parseCsv } from "@/lib/csv";

type Item = {
  id: number; bank_id: number; title: string; prompt: string;
  response_type: "written" | "link" | "file_upload"; marks: number;
  difficulty: "easy" | "medium" | "hard"; is_required: boolean;
  written_answer_type: "short" | "long" | null; word_limit: number | null;
  allowed_file_types: string[] | null; maximum_file_size_mb: number | null;
  link_guidance: string | null;
};
type Bank = { id: number; title: string; subject: string; description: string; items: Item[] };
type Draft = {
  title: string; prompt: string; responseType: Item["response_type"]; marks: number;
  difficulty: Item["difficulty"]; isRequired: boolean; writtenAnswerType: "short" | "long";
  wordLimit: string; fileTypes: string; maxFileSize: string; linkGuidance: string;
};
type Modal = "bank" | "item" | "import" | null;

const blank = (): Draft => ({
  title: "", prompt: "", responseType: "written", marks: 10, difficulty: "medium",
  isRequired: true, writtenAnswerType: "long", wordLimit: "", fileTypes: "pdf,docx",
  maxFileSize: "10", linkGuidance: "",
});
const supabase = createClient();

export function QuestionBankManager({ email }: { email: string }) {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [editing, setEditing] = useState<Item | null>(null);
  const [editingBank, setEditingBank] = useState<Bank | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/question-banks", { cache: "no-store" });
    const result = await response.json() as { banks?: Bank[]; error?: string };
    if (!response.ok) { setError(result.error ?? "Could not load question banks."); return; }
    const next = result.banks ?? [];
    setBanks(next);
    setSelectedId((value) => value && next.some((bank) => bank.id === value) ? value : next[0]?.id ?? null);
  }, []);

  useEffect(() => { void load(); }, [load]);
  const selected = banks.find((bank) => bank.id === selectedId) ?? null;
  function flash(message: string) { setNotice(message); window.setTimeout(() => setNotice(""), 3000); }
  async function signOut() { await supabase.auth.signOut(); window.location.replace("/admin/login"); }

  async function saveBank(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = { title: form.get("title"), subject: form.get("subject"), description: form.get("description") };
    const response = await fetch("/api/admin/question-banks", {
      method: editingBank ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(editingBank ? { bankId: editingBank.id, ...body } : body),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? "Could not save question bank.");
    else { setModal(null); setEditingBank(null); flash(editingBank ? "Question bank updated." : "Question bank created."); await load(); }
    setBusy(false);
  }

  function payload(value: Draft) {
    return {
      title: value.title, prompt: value.prompt, responseType: value.responseType,
      marks: value.marks, difficulty: value.difficulty, isRequired: value.isRequired,
      writtenAnswerType: value.responseType === "written" ? value.writtenAnswerType : null,
      wordLimit: value.responseType === "written" && value.wordLimit ? Number(value.wordLimit) : null,
      allowedFileTypes: value.responseType === "file_upload" ? value.fileTypes.split(",").map((item) => item.trim()).filter(Boolean) : null,
      maximumFileSizeMb: value.responseType === "file_upload" ? Number(value.maxFileSize) : null,
      linkGuidance: value.responseType === "link" ? value.linkGuidance : null,
    };
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setBusy(true); setError("");
    const response = await fetch("/api/admin/question-bank-items", {
      method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(editing ? { questionId: editing.id, question: payload(draft) } : { bankId: selected.id, question: payload(draft) }),
    });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? "Could not save question.");
    else { setModal(null); setEditing(null); setDraft(blank()); flash("Question saved."); await load(); }
    setBusy(false);
  }

  async function duplicateItem(item: Item) {
    if (!selected) return;
    const duplicate = { ...toDraft(item), title: `${item.title} copy` };
    const response = await fetch("/api/admin/question-bank-items", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ bankId: selected.id, question: payload(duplicate) }),
    });
    if (!response.ok) { const result = await response.json() as { error?: string }; setError(result.error ?? "Could not duplicate question."); return; }
    flash("Question duplicated."); await load();
  }

  async function removeItem(id: number) {
    if (!window.confirm("Delete this question?")) return;
    const response = await fetch(`/api/admin/question-bank-items?questionId=${id}`, { method: "DELETE" });
    if (!response.ok) { const result = await response.json() as { error?: string }; setError(result.error ?? "Could not delete question."); return; }
    flash("Question deleted."); await load();
  }

  async function removeBank() {
    if (!selected || !window.confirm(`Delete ${selected.title} and all its questions?`)) return;
    const response = await fetch(`/api/admin/question-banks?bankId=${selected.id}`, { method: "DELETE" });
    if (!response.ok) { const result = await response.json() as { error?: string }; setError(result.error ?? "Could not delete bank."); return; }
    flash("Question bank deleted."); await load();
  }

  async function importFile(file: File) {
    if (!selected) return; setBusy(true); setError("");
    let rows: (string | number | boolean | Date | null)[][];
    if (file.name.toLowerCase().endsWith(".xlsx")) {
      const { default: read } = await import("read-excel-file/browser");
      rows = await read(file) as unknown as typeof rows;
    } else rows = parseCsv(await file.text());

    const questions = rows.slice(1).map((row) => ({
      title: String(row[0] ?? "").trim(), prompt: String(row[1] ?? "").trim(),
      responseType: String(row[2] ?? "written").trim().toLowerCase(), marks: Number(row[3] ?? 0),
      difficulty: String(row[4] ?? "medium").trim().toLowerCase(),
      writtenAnswerType: String(row[5] ?? "long").trim().toLowerCase(),
      wordLimit: row[6] ? Number(row[6]) : null,
      isRequired: String(row[7] ?? "true").trim().toLowerCase() !== "false",
      allowedFileTypes: row[8] ? String(row[8]).split("|").map((value) => value.trim()).filter(Boolean) : null,
      maximumFileSizeMb: row[9] ? Number(row[9]) : null,
      linkGuidance: row[10] ? String(row[10]) : null,
    }));
    const response = await fetch("/api/admin/question-bank-import", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ bankId: selected.id, questions }),
    });
    const result = await response.json() as { imported?: number; failed?: number; errors?: { row: number; error: string }[]; error?: string };
    setBusy(false);
    if (!response.ok) { setError(result.error ?? "Import failed."); return; }
    await load();
    if (result.failed) setError(`${result.imported ?? 0} imported. ${(result.errors ?? []).slice(0, 8).map((item) => `Row ${item.row}: ${item.error}`).join(" ")}`);
    else { setModal(null); flash(`${result.imported ?? 0} questions imported.`); }
  }

  function toDraft(item: Item): Draft {
    return {
      title: item.title, prompt: item.prompt, responseType: item.response_type, marks: item.marks,
      difficulty: item.difficulty, isRequired: item.is_required,
      writtenAnswerType: item.written_answer_type ?? "long", wordLimit: String(item.word_limit ?? ""),
      fileTypes: (item.allowed_file_types ?? []).join(","), maxFileSize: String(item.maximum_file_size_mb ?? 10),
      linkGuidance: item.link_guidance ?? "",
    };
  }

  function edit(item: Item) { setEditing(item); setDraft(toDraft(item)); setModal("item"); }

  return <main className="app-shell">
    <aside className="sidebar"><Brand/><nav><span>WORKSPACE</span><a href="/admin">Assessments</a><a className="active" href="/admin/question-banks">Question Banks</a></nav><button className="signout" onClick={signOut}><LogOut size={15}/> Sign out</button></aside>
    <section className="workspace"><header className="topbar"><span>{email}</span><strong>{email.slice(0,2).toUpperCase()}</strong></header><div className="content">
      <div className="heading"><div><span className="eyebrow">Admin workspace</span><h1>Question Banks</h1><p>Create reusable written, link and file-upload tasks.</p></div><div className="actions"><button className="button secondary" disabled={!selected} onClick={() => setModal("import")}><FileSpreadsheet size={15}/> Import</button><button className="button primary" onClick={() => { setEditingBank(null); setModal("bank"); }}><Plus size={15}/> New bank</button></div></div>
      {notice && <div className="toast">{notice}</div>}{error && <div className="alert error">{error}</div>}
      <div className="admin-grid"><section><div className="assessment-list">{banks.map((bank) => <button key={bank.id} className={`assessment-row ${selectedId === bank.id ? "selected" : ""}`} onClick={() => setSelectedId(bank.id)}><div><strong>{bank.title}</strong><span>{bank.subject}</span><small>{bank.items.length} questions</small></div></button>)}</div>{!banks.length && <div className="empty">No question banks yet.</div>}
        <div className="section-title candidate-title"><h2>{selected?.title ?? "Questions"}</h2><div><button className="button secondary small" disabled={!selected} onClick={() => { if (selected) { setEditingBank(selected); setModal("bank"); } }}><Pencil size={14}/> Edit bank</button><button className="button secondary small" disabled={!selected} onClick={removeBank}><Trash2 size={14}/> Delete bank</button><button className="button primary small" disabled={!selected} onClick={() => { setEditing(null); setDraft(blank()); setModal("item"); }}><Plus size={14}/> Add question</button></div></div>
        <div className="table-wrap"><table><thead><tr><th>Question</th><th>Type</th><th>Marks</th><th>Difficulty</th><th>Required</th><th>Actions</th></tr></thead><tbody>{selected?.items.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.prompt}</small></td><td>{item.response_type.replace("_", " ")}</td><td>{item.marks}</td><td>{item.difficulty}</td><td>{item.is_required ? "Yes" : "No"}</td><td><button className="text-button" onClick={() => edit(item)}>Edit</button> <button className="text-button" onClick={() => void duplicateItem(item)}><Copy size={13}/> Duplicate</button> <button className="text-button" onClick={() => void removeItem(item.id)}>Delete</button></td></tr>)}</tbody></table></div>
      </section><aside className="detail">{selected ? <><h2>{selected.title}</h2><p>{selected.description || "No description"}</p><dl><div><dt>Subject</dt><dd>{selected.subject}</dd></div><div><dt>Questions</dt><dd>{selected.items.length}</dd></div></dl></> : <div className="empty">Select a question bank.</div>}</aside></div>
    </div></section>
    {modal && <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={() => setModal(null)}><X/></button>
      {modal === "bank" && <form onSubmit={saveBank}><h2>{editingBank ? "Edit question bank" : "Create question bank"}</h2><label>Title<input name="title" defaultValue={editingBank?.title ?? ""} required/></label><label>Subject<input name="subject" defaultValue={editingBank?.subject ?? ""} required/></label><label>Description<textarea name="description" defaultValue={editingBank?.description ?? ""}/></label><button className="button primary full" disabled={busy}>Save bank</button></form>}
      {modal === "item" && <form onSubmit={saveItem}><h2>{editing ? "Edit question" : "Add question"}</h2><label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required/></label><label>Prompt<textarea value={draft.prompt} onChange={(event) => setDraft({ ...draft, prompt: event.target.value })} required/></label><div className="form-grid"><label>Answer type<select value={draft.responseType} onChange={(event) => setDraft({ ...draft, responseType: event.target.value as Draft["responseType"] })}><option value="written">Written</option><option value="link">Link</option><option value="file_upload">File upload</option></select></label><label>Marks<input type="number" min="1" value={draft.marks} onChange={(event) => setDraft({ ...draft, marks: Number(event.target.value) })}/></label><label>Difficulty<select value={draft.difficulty} onChange={(event) => setDraft({ ...draft, difficulty: event.target.value as Draft["difficulty"] })}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label><label>Required<select value={String(draft.isRequired)} onChange={(event) => setDraft({ ...draft, isRequired: event.target.value === "true" })}><option value="true">Required</option><option value="false">Optional</option></select></label>{draft.responseType === "written" && <><label>Written answer type<select value={draft.writtenAnswerType} onChange={(event) => setDraft({ ...draft, writtenAnswerType: event.target.value as "short" | "long" })}><option value="short">Short</option><option value="long">Long</option></select></label><label>Word limit<input type="number" min="1" value={draft.wordLimit} onChange={(event) => setDraft({ ...draft, wordLimit: event.target.value })}/></label></>}{draft.responseType === "file_upload" && <><label>File types<input value={draft.fileTypes} onChange={(event) => setDraft({ ...draft, fileTypes: event.target.value })}/></label><label>Maximum MB<input type="number" min="1" value={draft.maxFileSize} onChange={(event) => setDraft({ ...draft, maxFileSize: event.target.value })}/></label></>}{draft.responseType === "link" && <label>Link guidance<input value={draft.linkGuidance} onChange={(event) => setDraft({ ...draft, linkGuidance: event.target.value })}/></label>}</div><button className="button primary full" disabled={busy}>Save question</button></form>}
      {modal === "import" && <div><h2>Import questions</h2><p>Columns: Title, Prompt, Response Type, Marks, Difficulty, Written Answer Type, Word Limit, Required, File Types, Maximum MB, Link Guidance.</p><label className="upload"><FileSpreadsheet/><span>Choose CSV or XLSX</span><input type="file" accept=".csv,.xlsx" onChange={(event) => event.target.files?.[0] && void importFile(event.target.files[0])}/></label></div>}
    </div></div>}
  </main>;
}