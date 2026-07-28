import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, publicError, requireCandidate } from "@/lib/server/auth";
import { attemptId } from "@/lib/server/candidate-attempts";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  try {
    const { user, email } = await requireCandidate();
    const id = attemptId((await params).attemptId);
    const admin = createAdminClient();

    const { data: attempt, error: attemptError } = await admin
      .from("exam_attempts")
      .select("id,candidate_id,assessment_id,status,started_at,ends_at,submitted_at")
      .eq("id", id)
      .eq("student_id", user.id)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) throw new AppError(404, "Assessment attempt not found.");

    const { data: assignment, error: assignmentError } = await admin
      .from("candidates")
      .select("id,status,email,auth_user_id,is_active,access_expires_at")
      .eq("id", attempt.candidate_id)
      .maybeSingle();
    if (assignmentError) throw assignmentError;
    if (
      !assignment
      || assignment.auth_user_id !== user.id
      || assignment.email.toLowerCase() !== email
      || !assignment.is_active
      || (assignment.access_expires_at && new Date(assignment.access_expires_at).getTime() <= Date.now())
    ) {
      throw new AppError(403, "This assessment is not available.");
    }

    const [{ data: assessment, error: assessmentError }, { data: questions, error: questionError }, { data: responses, error: responseError }] = await Promise.all([
      admin.from("assessments").select("id,title,instructions,total_points").eq("id", attempt.assessment_id).single(),
      admin.from("assessment_questions").select("*").eq("assessment_id", attempt.assessment_id).order("sort_order"),
      admin.from("candidate_responses").select("*").eq("attempt_id", attempt.id),
    ]);
    if (assessmentError) throw assessmentError;
    if (questionError) throw questionError;
    if (responseError) throw responseError;

    return NextResponse.json(
      {
        attempt,
        candidate: { id: assignment.id, status: assignment.status },
        assessment: { ...assessment, questions: questions ?? [] },
        responses: responses ?? [],
        serverTime: new Date().toISOString(),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status, headers: { "cache-control": "no-store", ...failure.headers } },
    );
  }
}
