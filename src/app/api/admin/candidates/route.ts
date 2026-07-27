import { NextRequest, NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, isEmail, normalizeEmail, publicError, requestOrigin, requireAdmin } from "@/lib/server/auth";

type CandidateInput = {
  assessmentId?: unknown; fullName?: unknown; email?: unknown;
  phone?: unknown; source?: unknown;
};

async function findAuthUserByEmail(email: string) {
  const admin = createAdminClient();
  for (let page = 1; page <= 100; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
  }
  throw new AppError(500, "Candidate account lookup could not be completed.");
}

async function sendAccessEmail(email: string, fullName: string, redirectTo: string, existingUser: User | null) {
  const admin = createAdminClient();
  if (!existingUser) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo, data: { full_name: fullName },
    });
    if (error || !data.user) throw error ?? new Error("Invitation failed");
    return data.user;
  }
  const { error } = await admin.auth.signInWithOtp({
    email, options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
  if (error) throw error;
  return existingUser;
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json()) as { candidates?: CandidateInput[] };
    const inputs = Array.isArray(body.candidates) ? body.candidates : [];
    if (inputs.length < 1 || inputs.length > 500) throw new AppError(400, "Provide between 1 and 500 candidates.");

    const admin = createAdminClient();
    const assessmentIds = [...new Set(inputs.map((item) => Number(item.assessmentId)))];
    if (assessmentIds.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new AppError(400, "Invalid assessment assignment.");
    const { data: assessments, error: assessmentError } = await admin.from("assessments").select("id").in("id", assessmentIds);
    if (assessmentError) throw assessmentError;
    const validAssessmentIds = new Set((assessments ?? []).map((item) => Number(item.id)));
    const redirectTo = `${requestOrigin(request)}/auth/callback?next=/candidate`;
    const results: Array<{ email: string; invited: boolean; error?: string }> = [];

    for (const input of inputs) {
      const assessmentId = Number(input.assessmentId);
      const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
      const email = normalizeEmail(input.email);
      const phone = typeof input.phone === "string" ? input.phone.trim() || null : null;
      const source = input.source === "excel" ? "excel" : "manual";
      if (!validAssessmentIds.has(assessmentId) || !fullName || !isEmail(email)) {
        results.push({ email, invited: false, error: "Invalid candidate details." });
        continue;
      }
      try {
        const existingUser = await findAuthUserByEmail(email);
        const { data: assignment, error: assignmentError } = await admin.from("candidates").upsert({
          assessment_id: assessmentId, auth_user_id: existingUser?.id ?? null,
          full_name: fullName, email, phone, source,
        }, { onConflict: "assessment_id,email" }).select("id").single();
        if (assignmentError || !assignment) throw assignmentError ?? new Error("Assignment failed");

        const authUser = await sendAccessEmail(email, fullName, redirectTo, existingUser);
        const { error: bindError } = await admin.from("candidates")
          .update({ auth_user_id: authUser.id }).eq("id", assignment.id);
        if (bindError) throw bindError;
        results.push({ email, invited: true });
      } catch (error) {
        console.error("Candidate invitation failed", { email, error });
        results.push({ email, invited: false, error: "Invitation could not be sent." });
      }
    }
    const invited = results.filter((result) => result.invited).length;
    return NextResponse.json({ results, invited, failed: results.length - invited }, { status: invited === 0 ? 400 : 200 });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
