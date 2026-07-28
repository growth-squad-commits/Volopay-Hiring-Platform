export type Question = {
  id: number; assessment_id: number; title: string; prompt: string; points: number; sort_order: number;
  response_type: "written" | "link" | "file_upload"; is_required: boolean;
  written_answer_type: "short" | "long" | null; word_limit: number | null;
  allowed_file_types: string[] | null; maximum_file_size_mb: number | null; link_guidance: string | null;
};
export type ResponseRecord = {
  id: number; candidate_id: number; question_id: number; response_text: string | null;
  response_url: string | null; file_path: string | null; file_name: string | null; file_size: number | null;
};
export type Candidate = {
  id: number; assessment_id: number; full_name: string; email: string; phone: string | null;
  status: string; score: number | null; decision: string; submitted_at: string | null;
  started_at: string | null; expires_at: string | null; source: string;
  is_active: boolean; access_expires_at: string | null; responses?: ResponseRecord[];
};
export type Assessment = {
  id: number; title: string; description: string; instructions: string; status: string;
  duration_minutes: number; total_points: number; available_from: string | null; available_until: string | null;
  questions: Question[]; candidates: Candidate[];
};