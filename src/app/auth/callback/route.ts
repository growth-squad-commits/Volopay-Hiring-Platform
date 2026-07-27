import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next")?.startsWith("/") ? url.searchParams.get("next")! : "/candidate";
  const supabase = await createClient();
  let error: Error | null = null;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (tokenHash && type) ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as "email" }));
  if (error) return NextResponse.redirect(new URL(`/candidate/login?error=${encodeURIComponent(error.message)}`, url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
