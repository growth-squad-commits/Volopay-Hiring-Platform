import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError, isEmail, normalizeEmail, publicError, requestOrigin } from "@/lib/server/auth";
import { consumeRateLimit, requestIp } from "@/lib/server/rate-limit";

export async function POST(request: NextRequest) {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      throw new AppError(415, "Unsupported request format.");
    }
    const { email: rawEmail } = (await request.json()) as { email?: unknown };
    const email = normalizeEmail(rawEmail);
    if (!isEmail(email)) throw new AppError(400, "Enter your invitation email first.");

    const ip = requestIp(request);
    await Promise.all([
      consumeRateLimit({ scope: "magic-link-ip", identifier: ip, limit: 12, windowSeconds: 3600 }),
      consumeRateLimit({ scope: "magic-link-account", identifier: email, limit: 3, windowSeconds: 3600 }),
    ]);

    const admin = createAdminClient();
    const { data: assignment } = await admin.from("candidates").select("id")
      .eq("email", email).limit(1).maybeSingle();
    if (assignment) {
      const { error } = await admin.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${requestOrigin(request)}/auth/callback?next=/candidate`,
        },
      });
      if (error) console.error("Magic-link delivery failed", { email, error });
    }

    return NextResponse.json(
      { ok: true, message: "If the email is eligible, a sign-in link has been sent." },
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
