import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, publicError, requireCandidate } from "@/lib/server/auth";
import { attemptId, attemptRpcError, rpcRow } from "@/lib/server/candidate-attempts";
import { consumeRateLimit, requestIp } from "@/lib/server/rate-limit";

type SubmitResult = {
  attempt_status: "submitted" | "auto_submitted";
  submitted_at: string;
  ends_at: string;
  server_time: string;
};

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  try {
    const { user, email } = await requireCandidate();
    const id = attemptId((await params).attemptId);
    await consumeRateLimit({
      scope: "candidate-attempt-submit",
      identifier: `${user.id}:${requestIp(request)}`,
      limit: 30,
      windowSeconds: 3600,
    });

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("submit_exam_attempt_internal", {
      p_attempt_id: id,
      p_student_id: user.id,
      p_email: email,
    });
    if (error) throw attemptRpcError(error);

    const result = rpcRow<SubmitResult>(data as SubmitResult[] | null);
    if (!result) throw new AppError(500, "The assessment could not be submitted.");
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status, headers: { "cache-control": "no-store", ...failure.headers } },
    );
  }
}
