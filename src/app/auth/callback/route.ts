import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeCandidatePath } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = safeCandidatePath(url.searchParams.get("next"));
  const supabase = await createClient();

  let error: Error | null = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type === "email") {
    ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" }));
  } else {
    error = new Error("Missing authentication token.");
  }

  if (error) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/candidate/login?error=invalid_or_expired_link", url.origin));
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id || !auth.user.email) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/candidate/login?error=invalid_or_expired_link", url.origin));
  }

  const email = auth.user.email.toLowerCase();
  const { data: assignment } = await supabase.from("candidates").select("id")
    .eq("auth_user_id", auth.user.id)
    .eq("email", email)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!assignment) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/candidate/login?error=no_active_assignment", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
