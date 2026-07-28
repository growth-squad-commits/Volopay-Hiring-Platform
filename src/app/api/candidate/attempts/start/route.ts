import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, publicError, requireCandidate } from "@/lib/server/auth";
import { candidateId, attemptRpcError, rpcRow } from "@/lib/server/candidate-attempts";
import { consumeRateLimit, requestIp } from "@/lib/server/rate-limit";

type StartResult = {
  attempt_id: string;
  candidate_id: number;
  assessment_id: number;
  attempt_status: "in_progress" | "submitted" | "auto_submitted";
  started_at: string;
  ends_at: string;
  server_time: string;
};

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { user, email } = await requireCandidate();
    await consumeRateLimit({
      scope: "candidate-attempt-start",
      identifier: `${user.id}:${requestIp(request)}`,
      limit: 20,
      windowSeconds: 3600,
    });

    const body = await request.json() as { candidateId?: unknown };
    const assignmentId = candidateId(body.candidateId);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("start_exam_attempt_internal", {
      p_candidate_id: assignmentId,
      p_student_id: user.id,
      p_email: email,
    });
    if (error) throw attemptRpcError(error);

    const attempt = rpcRow<StartResult>(data as StartResult[] | null);
    if (!attempt) throw new AppError(500, "The assessment could not be started.");

    return NextResponse.json(
      {
        attempt,
        redirect: attempt.attempt_status === "in_progress"
          ? `/candidate/assessment/${assignmentId}`
          : `/candidate/submission/${assignmentId}`,
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
