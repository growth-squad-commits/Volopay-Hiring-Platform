import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmail, normalizeEmail, publicError, requestOrigin } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  try {
    const { email: rawEmail } = (await request.json()) as { email?: unknown };
    const email = normalizeEmail(rawEmail);
    if (!isEmail(email)) return NextResponse.json({ error: "Enter your invitation email first." }, { status: 400 });
    const admin = createAdminClient();
    const { data: assignment } = await admin.from("candidates").select("id").eq("email", email).limit(1).maybeSingle();
    if (assignment) {
      const { error } = await admin.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false, emailRedirectTo: `${requestOrigin(request)}/auth/callback?next=/candidate` },
      });
      if (error) console.error("Magic-link delivery failed", { email, error });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
