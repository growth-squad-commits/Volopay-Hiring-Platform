import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const requestedNext = url.searchParams.get("next");
  const next = requestedNext?.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/candidate";
  const supabase = await createClient();
  let error: Error | null = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "email" }));
  if (error) return NextResponse.redirect(new URL("/candidate/login?error=invalid_or_expired_link", url.origin));
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id || !auth.user.email) {
    return NextResponse.redirect(new URL("/candidate/login?error=invalid_or_expired_link", url.origin));
  }
  const { data: assignment } = await supabase.from("candidates").select("id")
    .eq("auth_user_id", auth.user.id)
    .eq("email", auth.user.email.toLowerCase())
    .limit(1)
    .maybeSingle();
  if (!assignment) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/candidate/login?error=no_assignment", url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
