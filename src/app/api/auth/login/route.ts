import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AppError, isEmail, normalizeEmail, publicError } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { email?: unknown; password?: unknown; portal?: unknown };
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const portal = body.portal;
    if (!isEmail(email) || !password || (portal !== "admin" && portal !== "candidate")) {
      throw new AppError(400, "Enter a valid email and password.");
    }
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new AppError(401, "Invalid email or password.");
    if (portal === "admin") {
      const { data: admin } = await supabase.from("admin_profiles").select("user_id")
        .eq("user_id", data.user.id).eq("is_active", true).maybeSingle();
      if (!admin) { await supabase.auth.signOut(); throw new AppError(403, "This account is not an active administrator."); }
    } else {
      const { data: assignment } = await supabase.from("candidates").select("id")
        .eq("auth_user_id", data.user.id).eq("email", email).limit(1).maybeSingle();
      if (!assignment) { await supabase.auth.signOut(); throw new AppError(403, "No assessment is assigned to this account."); }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
