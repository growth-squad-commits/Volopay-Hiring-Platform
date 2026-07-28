import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AppError, publicError } from "@/lib/server/auth";
import { consumeRateLimit, requestIp } from "@/lib/server/rate-limit";

const DEMO_EMAIL = "candidate-demo@volopay.dev";
const DEMO_NAME = "Candidate Demo";
const DEMO_ACCESS_ENDS_AT = Date.parse("2026-08-04T18:29:59Z");

export async function POST(request: NextRequest) {
  try {
    if (process.env.DEMO_CANDIDATE_LOGIN_ENABLED === "false" || Date.now() > DEMO_ACCESS_ENDS_AT) {
      throw new AppError(404, "Demo access is disabled.");
    }

    await consumeRateLimit({
      scope: "demo-candidate-ip",
      identifier: requestIp(request),
      limit: 20,
      windowSeconds: 3600,
    });

    const admin = createAdminClient();
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: DEMO_EMAIL,
      options: { data: { name: DEMO_NAME, demo_candidate: true } },
    });
    if (linkError || !link.properties?.hashed_token || !link.user?.id) {
      throw new AppError(503, "Demo access is temporarily unavailable.");
    }

    const now = Date.now();
    const { data: assessments, error: assessmentError } = await admin
      .from("assessments")
      .select("id,available_from,available_until,due_date")
      .eq("status", "published")
      .order("created_at", { ascending: false });
    if (assessmentError) throw assessmentError;

    const assessment = (assessments ?? []).find((item) => {
      const opensAt = item.available_from ? new Date(item.available_from).getTime() : null;
      const closesAt = item.available_until
        ? new Date(item.available_until).getTime()
        : item.due_date
          ? new Date(item.due_date).getTime()
          : null;
      return (!opensAt || opensAt <= now) && (!closesAt || closesAt > now);
    });
    if (!assessment) throw new AppError(503, "No published assessment is currently available for demo access.");

    const { data: existing, error: lookupError } = await admin
      .from("candidates")
      .select("id,assessment_id,status")
      .eq("email", DEMO_EMAIL)
      .eq("auth_user_id", link.user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (!existing || existing.assessment_id !== assessment.id) {
      const { error: insertError } = await admin.from("candidates").insert({
        assessment_id: assessment.id,
        full_name: DEMO_NAME,
        email: DEMO_EMAIL,
        status: "not_started",
        decision: "pending",
        source: "temporary_demo",
        auth_user_id: link.user.id,
        is_active: true,
        access_expires_at: assessment.available_until ?? assessment.due_date,
      });
      if (insertError) throw insertError;
    }

    const supabase = await createClient();
    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: "email",
    });
    if (verifyError) throw new AppError(503, "Unable to start the demo session.");

    return NextResponse.json(
      { ok: true, redirect: "/candidate" },
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
