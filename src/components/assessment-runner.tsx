"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import {
  queueAnswer,
  queuedAnswers,
  removeQueuedAnswer,
  type QueuedAnswer,
} from "@/lib/client/answer-queue";
import type { Question, ResponseRecord } from "@/lib/types";

type Attempt = {
  id: string;
  candidate_id: number;
  assessment_id: number;
  status: "in_progress" | "submitted" | "auto_submitted";
  started_at: string;
  ends_at: string;
  submitted_at: string | null;
};
type RunnerPayload = {
  attempt: Attempt;
  candidate: { id: number; status: string };
  assessment: { title: string; instructions: string; total_points: number; questions: Question[] };
  responses: ResponseRecord[];
  serverTime: string;
};
type StartPayload = { attempt?: { attempt_id: string; attempt_status: string }; redirect?: string; error?: string };
type Answer = Pick<ResponseRecord, "question_id"|"response_text"|"response_url"|"file_path"|"file_name"|"file_size">;
type SavePayload = {
  saved?: boolean;
  attempt_status?: Attempt["status"];
  ends_at?: string;
  server_time?: string;
  error?: string;
};

const blank = (id: number): Answer => ({
  question_id: id,
  response_text: null,
  response_url: null,
  file_path: null,
  file_name: null,
  file_size: null,
});
const supabase = createClient();

function fromQueued(answer: QueuedAnswer): Answer {
  return {
    question_id: answer.questionId,
    response_text: answer.responseText,
    response_url: answer.responseUrl,
    file_path: answer.filePath,
    file_name: answer.fileName,
    file_size: answer.fileSize,
  };
}

function toQueued(attemptId: string, answer: Answer, revision: number): QueuedAnswer {
  return {
    attemptId,
    questionId: answer.question_id,
    responseText: answer.response_text,
    responseUrl: answer.response_url,
    filePath: answer.file_path,
    fileName: answer.file_name,
    fileSize: answer.file_size,
    queuedAt: revision,
  };
}

export function AssessmentRunner({ candidateId }: { candidateId: number }) {
  const timers = useRef<Record<number, number>>({});
  const autoSubmitted = useRef(false);
  const attemptRef = useRef<string | null>(null);
  const revisions = useRef<Record<number, number>>({});
  const revisionSeed = useRef(0);
  const [payload, setPayload] = useState<RunnerPayload | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [remaining, setRemaining] = useState(0);
  const [serverOffset, setServerOffset] = useState(0);
  const [saveState, setSaveState] = useState<Record<number,string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const syncClock = useCallback((serverTime: string, endsAt: string) => {
    const offset = new Date(serverTime).getTime() - Date.now();
    setServerOffset(offset);
    setRemaining(Math.max(0, Math.floor((new Date(endsAt).getTime() - (Date.now() + offset)) / 1000)));
  }, []);

  const persist = useCallback(async (attemptId: string, answer: Answer, pending?: QueuedAnswer) => {
    const revision = Math.max(revisionSeed.current + 1, (revisions.current[answer.question_id] ?? 0) + 1);
    revisionSeed.current = revision;
    revisions.current[answer.question_id] = Math.max(revisions.current[answer.question_id] ?? 0, revision);
    const queued = pending ?? toQueued(attemptId, answer, revision);
    await queueAnswer(queued);
    setSaveState((state) => ({ ...state, [answer.question_id]: navigator.onLine ? "Saving…" : "Saved offline" }));

    if (!navigator.onLine) return false;
    try {
      const response = await fetch(`/api/candidate/attempts/${attemptId}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId: answer.question_id,
          responseText: answer.response_text,
          responseUrl: answer.response_url,
          filePath: answer.file_path,
          fileName: answer.file_name,
          fileSize: answer.file_size,
          clientRevision: queued.queuedAt,
        }),
      });
      const result = await response.json() as SavePayload;
      if (!response.ok) throw new Error(result.error ?? "Save failed.");
      if (result.server_time && result.ends_at) syncClock(result.server_time, result.ends_at);
      if (!result.saved || result.attempt_status !== "in_progress") {
        window.location.replace(`/candidate/submission/${candidateId}`);
        return false;
      }
      await removeQueuedAnswer(attemptId, answer.question_id, queued.queuedAt);
      setSaveState((state) => ({ ...state, [answer.question_id]: "Saved" }));
      return true;
    } catch (saveError) {
      setSaveState((state) => ({ ...state, [answer.question_id]: "Saved offline" }));
      setError(saveError instanceof Error ? saveError.message : "Answer saved locally. Reconnecting…");
      return false;
    }
  }, [candidateId, syncClock]);

  const flushQueue = useCallback(async (attemptId: string) => {
    const pending = await queuedAnswers(attemptId);
    let saved = true;
    for (const answer of pending.sort((a, b) => a.queuedAt - b.queuedAt)) {
      if (!await persist(attemptId, fromQueued(answer), answer)) saved = false;
    }
    return saved;
  }, [persist]);

  const load = useCallback(async () => {
    try {
      const startResponse = await fetch("/api/candidate/attempts/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const start = await startResponse.json() as StartPayload;
      if (!startResponse.ok || !start.attempt) throw new Error(start.error ?? "Assessment could not be opened.");
      if (start.attempt.attempt_status !== "in_progress") {
        window.location.replace(start.redirect ?? `/candidate/submission/${candidateId}`);
        return;
      }

      attemptRef.current = start.attempt.attempt_id;
      const response = await fetch(`/api/candidate/attempts/${start.attempt.attempt_id}`, { cache: "no-store" });
      const result = await response.json() as RunnerPayload & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Assessment could not be opened.");
      if (result.attempt.status !== "in_progress") {
        window.location.replace(`/candidate/submission/${candidateId}`);
        return;
      }

      const mapped: Record<number, Answer> = {};
      revisionSeed.current = Math.max(revisionSeed.current, Date.parse(result.serverTime) * 1000);
      result.assessment.questions.forEach((question) => { mapped[question.id] = blank(question.id); });
      result.responses.forEach((record) => {
        mapped[record.question_id] = record;
        revisions.current[record.question_id] = record.client_revision ?? 0;
      });
      const offline = await queuedAnswers(result.attempt.id);
      offline.forEach((answer) => {
        mapped[answer.questionId] = fromQueued(answer);
        revisions.current[answer.questionId] = Math.max(revisions.current[answer.questionId] ?? 0, answer.queuedAt);
        setSaveState((state) => ({ ...state, [answer.questionId]: "Saved offline" }));
      });

      setPayload(result);
      setAnswers(mapped);
      syncClock(result.serverTime, result.attempt.ends_at);
      setLoading(false);
      if (navigator.onLine) void flushQueue(result.attempt.id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Assessment could not be opened.");
      setLoading(false);
    }
  }, [candidateId, flushQueue, syncClock]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const current = timers.current;
    return () => {
      clearTimeout(timer);
      Object.values(current).forEach(clearTimeout);
    };
  }, [load]);

  useEffect(() => {
    if (!payload) return;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.floor((new Date(payload.attempt.ends_at).getTime() - (Date.now() + serverOffset)) / 1000));
      setRemaining(seconds);
    }, 1000);
    return () => clearInterval(timer);
  }, [payload, serverOffset]);

  useEffect(() => {
    function retry() {
      setError("");
      if (attemptRef.current) void flushQueue(attemptRef.current);
    }
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [flushQueue]);

  const submit = useCallback(async (automatic = false) => {
    if (!payload || submitting) return;
    if (!automatic) {
      const missing = payload.assessment.questions.filter((question) => {
        const answer = answers[question.id];
        return question.is_required && !(answer?.response_text?.trim() || answer?.response_url?.trim() || answer?.file_path);
      });
      if (missing.length) {
        setError(`Complete ${missing.length} required task${missing.length > 1 ? "s" : ""}.`);
        return;
      }
    }

    setSubmitting(true);
    Object.values(timers.current).forEach(clearTimeout);
    const queueSaved = await flushQueue(payload.attempt.id);
    if (!queueSaved && !automatic) {
      setError("Your answers are saved on this device. Reconnect before final submission.");
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`/api/candidate/attempts/${payload.attempt.id}/submit`, { method: "POST" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Submission failed.");
      window.location.replace(`/candidate/submission/${candidateId}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Submission failed.");
      setSubmitting(false);
    }
  }, [answers, candidateId, flushQueue, payload, submitting]);

  useEffect(() => {
    if (!payload || remaining > 0 || autoSubmitted.current) return;
    autoSubmitted.current = true;
    void submit(true);
  }, [payload, remaining, submit]);

  const answered = useMemo(() => payload?.assessment.questions.filter((question) => {
    const answer = answers[question.id];
    return !!(answer?.response_text?.trim() || answer?.response_url?.trim() || answer?.file_path);
  }).length ?? 0, [payload, answers]);

  function update(questionId: number, patch: Partial<Answer>) {
    if (!payload) return;
    const next = { ...(answers[questionId] ?? blank(questionId)), ...patch };
    const revision = Math.max(revisionSeed.current + 1, (revisions.current[questionId] ?? 0) + 1);
    revisionSeed.current = revision;
    revisions.current[questionId] = revision;
    const queued = toQueued(payload.attempt.id, next, revision);
    setAnswers((state) => ({ ...state, [questionId]: next }));
    setSaveState((state) => ({ ...state, [questionId]: "Saving locally…" }));
    void queueAnswer(queued).then(() => {
      setSaveState((state) => ({ ...state, [questionId]: navigator.onLine ? "Unsaved" : "Saved offline" }));
    });
    clearTimeout(timers.current[questionId]);
    timers.current[questionId] = window.setTimeout(() => void persist(payload.attempt.id, next, queued), 2000);
  }

  async function upload(question: Question, event: ChangeEvent<HTMLInputElement>) {
    if (!payload) return;
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowed = (question.allowed_file_types ?? []).map((value) => value.replace(".", "").toLowerCase());
    if (allowed.length && !allowed.includes(extension)) {
      setError(`Accepted types: ${allowed.join(", ")}`);
      return;
    }
    if (file.size > (question.maximum_file_size_mb ?? 10) * 1024 * 1024) {
      setError("File is too large.");
      return;
    }
    if (!navigator.onLine) {
      setError("Reconnect to upload this file.");
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const path = `${auth.user.id}/${candidateId}/${question.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
    setSaveState((state) => ({ ...state, [question.id]: "Uploading…" }));
    const { error: uploadError } = await supabase.storage.from("candidate-submissions").upload(path, file);
    if (uploadError) {
      setError(uploadError.message);
      return;
    }
    const next = { ...blank(question.id), file_path: path, file_name: file.name, file_size: file.size };
    const revision = Math.max(revisionSeed.current + 1, (revisions.current[question.id] ?? 0) + 1);
    revisionSeed.current = revision;
    revisions.current[question.id] = revision;
    const queued = toQueued(payload.attempt.id, next, revision);
    setAnswers((state) => ({ ...state, [question.id]: next }));
    await persist(payload.attempt.id, next, queued);
  }

  if (loading) return <main className="loading">Opening assessment…</main>;
  if (!payload) return <main className="loading">{error}</main>;

  const questionCount = payload.assessment.questions.length;
  return <main className="runner">
    <header className="runner-header"><Brand/><div className={remaining < 300 ? "timer urgent" : "timer"}><span>Time remaining</span><strong>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</strong></div></header>
    <section className="runner-content">
      <span className="eyebrow">Candidate assessment</span>
      <h1>{payload.assessment.title}</h1>
      <p>{payload.assessment.instructions}</p>
      <div className="progress"><span style={{ width: `${questionCount ? answered / questionCount * 100 : 0}%` }}/></div>
      <small>{answered} of {questionCount} answered · autosave and offline retry enabled</small>
      {error && <div className="alert error">{error}</div>}
      <div className="task-list">{payload.assessment.questions.map((question, index) => <article className="task" key={question.id}>
        <div className="task-head"><div><span>Task {index + 1}</span><h2>{question.title}</h2></div><strong>{question.points} points</strong></div>
        <p>{question.prompt}</p>
        <em>{question.response_type.replace("_", " ")}{question.is_required ? " · Required" : ""}</em>
        {question.response_type === "written" && <textarea className={question.written_answer_type === "short" ? "short" : ""} value={answers[question.id]?.response_text ?? ""} onChange={(event) => update(question.id, { response_text: event.target.value })} disabled={remaining <= 0}/>}
        {question.response_type === "link" && <input type="url" placeholder="https://…" value={answers[question.id]?.response_url ?? ""} onChange={(event) => update(question.id, { response_url: event.target.value })} disabled={remaining <= 0}/>}
        {question.response_type === "file_upload" && <label className="file-input"><input type="file" onChange={(event) => void upload(question, event)} disabled={remaining <= 0}/><span>{answers[question.id]?.file_name ?? "Choose file"}</span><small>{(question.allowed_file_types ?? []).join(", ")} · max {question.maximum_file_size_mb ?? 10} MB</small></label>}
        <div className="save-state">{saveState[question.id] ?? (answers[question.id]?.response_text || answers[question.id]?.response_url || answers[question.id]?.file_path ? "Saved" : "Not answered")}</div>
      </article>)}</div>
      <div className="submit-bar"><div><strong>Ready to submit?</strong><span>Answers cannot be changed after final submission.</span></div><button className="button primary" onClick={() => void submit(false)} disabled={submitting || remaining <= 0}>{submitting ? "Submitting…" : "Submit assessment"}</button></div>
    </section>
  </main>;
}
