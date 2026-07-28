"use client";

import { useCallback, useEffect, useState } from "react";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import type { Question, ResponseRecord } from "@/lib/types";

type Submission = {
  id: number;
  status: string;
  submitted_at: string | null;
  score: number | null;
  assessment: {
    title: string;
    total_points: number;
    questions: Question[];
  };
};

const supabase = createClient();

export function SubmissionConfirmation({ candidateId }: { candidateId: number }) {
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [responses, setResponses] = useState<ResponseRecord[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data, error: submissionError } = await supabase
      .from("candidates")
      .select("id,status,submitted_at,score,assessment:assessments(title,total_points,questions:assessment_questions(*))")
      .eq("id", candidateId)
      .single();
    if (submissionError || !data || !["submitted", "reviewed"].includes(data.status)) {
      setError(submissionError?.message ?? "This submission is not available.");
      setLoading(false);
      return;
    }
    const next = data as unknown as Submission;
    next.assessment.questions.sort((a, b) => a.sort_order - b.sort_order);
    const { data: stored, error: responseError } = await supabase
      .from("candidate_responses")
      .select("*")
      .eq("candidate_id", candidateId);
    if (responseError) setError(responseError.message);
    else {
      setSubmission(next);
      setResponses((stored ?? []) as ResponseRecord[]);
    }
    setLoading(false);
  }, [candidateId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function openFile(path: string) {
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

  if (loading) return <main className="loading">Loading submission…</main>;
  if (!submission) return <main className="loading">{error}</main>;

  return <main className="candidate-shell">
    <header className="candidate-header"><Brand/><a className="button secondary" href="/candidate">Back to assessments</a></header>
    <section className="submission-content">
      <span className="submission-check">✓</span>
      <em className="eyebrow">Submission complete</em>
      <h1>{submission.assessment.title}</h1>
      <p>Your answers are locked and shown below for confirmation.</p>
      <dl className="submission-meta">
        <div><dt>Status</dt><dd>{submission.status}</dd></div>
        <div><dt>Submitted</dt><dd>{submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : "Recorded"}</dd></div>
        {submission.score !== null && <div><dt>Score</dt><dd>{submission.score}/{submission.assessment.total_points}</dd></div>}
      </dl>
      {error && <div className="alert error">{error}</div>}
      <div className="submission-responses">{submission.assessment.questions.map((question, index) => {
        const response = responses.find((item) => item.question_id === question.id);
        return <article key={question.id}>
          <span>Task {index + 1}</span>
          <h2>{question.title}</h2>
          <p>{response?.response_text || response?.response_url || response?.file_name || "No answer submitted"}</p>
          {response?.response_url && <a href={response.response_url} target="_blank" rel="noreferrer">Open submitted link</a>}
          {response?.file_path && <button className="response-link" type="button" onClick={() => void openFile(response.file_path!)}>Open submitted file</button>}
        </article>;
      })}</div>
    </section>
  </main>;
}
