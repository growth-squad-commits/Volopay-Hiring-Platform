import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, publicError, requireCandidate } from "@/lib/server/auth";
import {
  attemptId,
  attemptRpcError,
  optionalSize,
  optionalText,
  rpcRow,
} from "@/lib/server/candidate-attempts";
import { consumeRateLimit } from "@/lib/server/rate-limit";

type SaveResult = {
  saved: boolean;
  attempt_status: "in_progress" | "submitted" | "auto_submitted";
  ends_at: string;
  server_time: string;
  saved_at: string | null;
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
      scope: "candidate-answer-save",
      identifier: `${user.id}:${id}`,
      limit: 2000,
      windowSeconds: 3600,
    });

    const body = await request.json() as {
      questionId?: unknown;
      responseText?: unknown;
      responseUrl?: unknown;
      filePath?: unknown;
      fileName?: unknown;
      fileSize?: unknown;
      clientRevision?: unknown;
    };
    const questionId = Number(body.questionId);
    if (!Number.isSafeInteger(questionId) || questionId < 1) throw new AppError(400, "Invalid question.");
    const clientRevision = Number(body.clientRevision);
    if (!Number.isSafeInteger(clientRevision) || clientRevision < 0) throw new AppError(400, "Invalid answer revision.");

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("save_exam_answer_internal", {
      p_attempt_id: id,
      p_student_id: user.id,
      p_email: email,
      p_question_id: questionId,
      p_response_text: optionalText(body.responseText, 100_000),
      p_response_url: optionalText(body.responseUrl, 2_048),
      p_file_path: optionalText(body.filePath, 1_024),
      p_file_name: optionalText(body.fileName, 255),
      p_file_size: optionalSize(body.fileSize),
      p_client_revision: clientRevision,
    });
    if (error) throw attemptRpcError(error);

    const result = rpcRow<SaveResult>(data as SaveResult[] | null);
    if (!result) throw new AppError(500, "The answer could not be saved.");
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status, headers: { "cache-control": "no-store", ...failure.headers } },
    );
  }
}
