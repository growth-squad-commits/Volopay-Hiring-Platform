import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { AppError, isEmail, normalizeEmail, publicError } from "@/lib/server/auth";
import { consumeRateLimit, requestIp } from "@/lib/server/rate-limit";

export async function POST(request: NextRequest) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      throw new AppError(415, "Unsupported request format.");
    }
    const body = (await request.json()) as { email?: unknown; password?: unknown; portal?: unknown };
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    if (!isEmail(email) || !password || password.length > 1024 || body.portal !== "admin") {
      throw new AppError(400, "Enter a valid admin email and password.");
    }

    const ip = requestIp(request);
    await Promise.all([
      consumeRateLimit({ scope: "login-ip:admin", identifier: ip, limit: 20, windowSeconds: 900 }),
      consumeRateLimit({ scope: "login-account:admin", identifier: `${email}:${ip}`, limit: 5, windowSeconds: 900 }),
    ]);

    const supabase = await createClient();
    await supabase.auth.signOut();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new AppError(401, "Invalid email or password.");

    const { data: admin } = await supabase.from("admin_profiles").select("user_id")
      .eq("user_id", data.user.id).eq("is_active", true).maybeSingle();
    if (!admin) {
      await supabase.auth.signOut();
      throw new AppError(403, "This account is not an active administrator.");
    }

    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json(
      { error: failure.message },
      { status: failure.status, headers: { "cache-control": "no-store", ...failure.headers } },
    );
  }
}
