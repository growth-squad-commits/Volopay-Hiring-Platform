import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/server/auth";

type RateLimitOptions = {
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
};

function hashIdentifier(value: string) {
  const pepper = process.env.RATE_LIMIT_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!pepper) throw new Error("Missing RATE_LIMIT_PEPPER or server secret.");
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}

export function requestIp(request: NextRequest) {
  const connectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (connectingIp) return connectingIp;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}

export async function consumeRateLimit(options: RateLimitOptions) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("consume_auth_rate_limit", {
    p_scope: options.scope,
    p_identifier_hash: hashIdentifier(options.identifier),
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.allowed) {
    const retryAfter = Math.max(1, Number(result?.retry_after_seconds ?? options.windowSeconds));
    throw new AppError(429, "Too many attempts. Please try again later.", { "retry-after": String(retryAfter) });
  }
}
