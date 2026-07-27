"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import { createClient } from "@/lib/supabase/client";
import type { Question, ResponseRecord } from "@/lib/types";

type RunnerCandidate = { id: number; status: string; expires_at: string; assessment: { title: string; instructions: string; total_points: number; questions: Question[] } };
type Answer = Pick<ResponseRecord, "question_id"|"response_text"|"response_url"|"file_path"|"file_name"|"file_size">;
const blank = (id: number): Answer => ({ question_id: id, response_text: null, response_url: null, file_path: null, file_name: null, file_size: null });
const supabase = createClient();

export function AssessmentRunner({ candidateId }: { candidateId: number }) {
  const timers = useRef<Record<number, number>>({});
  const [candidate, setCandidate] = useState<RunnerCandidate | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [remaining, setRemaining] = useState(0);
  const [saveState, setSaveState] = useState<Record<number,string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.from("candidates")
      .select("id,status,expires_at,assessment:assessments(title,instructions,total_points,questions:assessment_questions(*))")
      .eq("id", candidateId).single();
    if (loadError || !data) { setError(loadError?.message ?? "Assessment not found."); setLoading(false); return; }
    const next = data as unknown as RunnerCandidate;
    if (next.status !== "in_progress") { window.location.replace("/candidate"); return; }
    next.assessment.questions.sort((a,b)=>a.sort_order-b.sort_order);
    const { data: saved } = await supabase.from("candidate_responses").select("*").eq("candidate_id", candidateId);
    const mapped: Record<number, Answer> = {}; next.assessment.questions.forEach((q)=>mapped[q.id]=blank(q.id));
    (saved ?? []).forEach((r)=>mapped[r.question_id]=r as Answer);
    setCandidate(next); setAnswers(mapped); setRemaining(Math.max(0,Math.floor((new Date(next.expires_at).getTime()-Date.now())/1000))); setLoading(false);
  }, [candidateId]);
  useEffect(()=>{ const timer=window.setTimeout(()=>void load(),0); const current=timers.current; return()=>{clearTimeout(timer);Object.values(current).forEach(clearTimeout)};},[load]);
  useEffect(()=>{ if(!candidate)return; const timer=setInterval(()=>setRemaining(Math.max(0,Math.floor((new Date(candidate.expires_at).getTime()-Date.now())/1000))),1000);return()=>clearInterval(timer);},[candidate]);

  const answered = useMemo(()=>candidate?.assessment.questions.filter((q)=>{const a=answers[q.id];return !!(a?.response_text?.trim()||a?.response_url?.trim()||a?.file_path)}).length??0,[candidate,answers]);
  async function persist(questionId:number, answer:Answer){
    if(!candidate||remaining<=0)return false; setSaveState((s)=>({...s,[questionId]:"Saving…"}));
    const {error:saveError}=await supabase.from("candidate_responses").upsert({candidate_id:candidateId,...answer,updated_at:new Date().toISOString()},{onConflict:"candidate_id,question_id"});
    setSaveState((s)=>({...s,[questionId]:saveError?"Save failed":"Saved"})); if(saveError)setError(saveError.message); return !saveError;
  }
  function update(questionId:number, patch:Partial<Answer>){const next={...(answers[questionId]??blank(questionId)),...patch};setAnswers((s)=>({...s,[questionId]:next}));setSaveState((s)=>({...s,[questionId]:"Unsaved"}));clearTimeout(timers.current[questionId]);timers.current[questionId]=window.setTimeout(()=>void persist(questionId,next),800);}
  async function upload(question:Question,event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];if(!file)return;const extension=file.name.split(".").pop()?.toLowerCase()??"";const allowed=(question.allowed_file_types??[]).map((x)=>x.replace(".","").toLowerCase());
    if(allowed.length&&!allowed.includes(extension)){setError(`Accepted types: ${allowed.join(", ")}`);return}if(file.size>(question.maximum_file_size_mb??10)*1024*1024){setError("File is too large.");return}
    const {data:auth}=await supabase.auth.getUser();if(!auth.user)return;const path=`${auth.user.id}/${candidateId}/${question.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"-")}`;
    setSaveState((s)=>({...s,[question.id]:"Uploading…"}));const {error:uploadError}=await supabase.storage.from("candidate-submissions").upload(path,file);if(uploadError){setError(uploadError.message);return}
    const next={...blank(question.id),file_path:path,file_name:file.name,file_size:file.size};setAnswers((s)=>({...s,[question.id]:next}));await persist(question.id,next);
  }
  async function submit(){
    if(!candidate)return;const missing=candidate.assessment.questions.filter((q)=>q.is_required&&!(answers[q.id]?.response_text?.trim()||answers[q.id]?.response_url?.trim()||answers[q.id]?.file_path));
    if(missing.length){setError(`Complete ${missing.length} required task${missing.length>1?"s":""}.`);return}setSubmitting(true);
    for(const q of candidate.assessment.questions){clearTimeout(timers.current[q.id]);if(!await persist(q.id,answers[q.id]??blank(q.id))){setSubmitting(false);return}}
    const {error:submitError}=await supabase.from("candidates").update({status:"submitted"}).eq("id",candidateId).eq("status","in_progress");if(submitError){setError(submitError.message);setSubmitting(false);return}window.location.replace("/candidate/thank-you");
  }
  if(loading)return <main className="loading">Opening assessment…</main>;if(!candidate)return <main className="loading">{error}</main>;
  return <main className="runner"><header className="runner-header"><Brand/><div className={remaining<300?"timer urgent":"timer"}><span>Time remaining</span><strong>{String(Math.floor(remaining/60)).padStart(2,"0")}:{String(remaining%60).padStart(2,"0")}</strong></div></header>
    <section className="runner-content"><span className="eyebrow">Candidate assessment</span><h1>{candidate.assessment.title}</h1><p>{candidate.assessment.instructions}</p><div className="progress"><span style={{width:`${answered/candidate.assessment.questions.length*100}%`}}/></div><small>{answered} of {candidate.assessment.questions.length} answered · autosave enabled</small>
      {error&&<div className="alert error">{error}</div>}<div className="task-list">{candidate.assessment.questions.map((q,index)=><article className="task" key={q.id}><div className="task-head"><div><span>Task {index+1}</span><h2>{q.title}</h2></div><strong>{q.points} points</strong></div><p>{q.prompt}</p><em>{q.response_type.replace("_"," ")}{q.is_required?" · Required":""}</em>
        {q.response_type==="written"&&<textarea className={q.written_answer_type==="short"?"short":""} value={answers[q.id]?.response_text??""} onChange={(e)=>update(q.id,{response_text:e.target.value})} disabled={remaining<=0}/>}
        {q.response_type==="link"&&<input type="url" placeholder="https://…" value={answers[q.id]?.response_url??""} onChange={(e)=>update(q.id,{response_url:e.target.value})} disabled={remaining<=0}/>}
        {q.response_type==="file_upload"&&<label className="file-input"><input type="file" onChange={(e)=>void upload(q,e)} disabled={remaining<=0}/><span>{answers[q.id]?.file_name??"Choose file"}</span><small>{(q.allowed_file_types??[]).join(", ")} · max {q.maximum_file_size_mb??10} MB</small></label>}
        <div className="save-state">{saveState[q.id]??"Not answered"}</div></article>)}</div>
      <div className="submit-bar"><div><strong>Ready to submit?</strong><span>Answers cannot be changed after final submission.</span></div><button className="button primary" onClick={()=>void submit()} disabled={submitting||remaining<=0}>{submitting?"Submitting…":"Submit assessment"}</button></div>
    </section></main>;
}
