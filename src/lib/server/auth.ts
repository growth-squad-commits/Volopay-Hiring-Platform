import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly headers: Record<string, string> = {},
  ) {
    super(message);
  }
}

export async function requireAdmin() {
  const supabase = await createClient();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth.user) throw new AppError(401, "Please sign in.");
  const { data: admin } = await supabase.from("admin_profiles").select("user_id")
    .eq("user_id", auth.user.id).eq("is_active", true).maybeSingle();
  if (!admin) throw new AppError(403, "Not authorized.");
  return { supabase, user: auth.user };
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function requestOrigin(request: NextRequest) {
  return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || request.nextUrl.origin).replace(/\/+$/, "");
}

export function safeCandidatePath(value: string | null) {
  if (!value) return "/candidate";
  if (value === "/candidate" || value === "/candidate/") return "/candidate";
  if (/^\/candidate\/assessment\/\d+$/.test(value)) return value;
  return "/candidate";
}

export function publicError(error: unknown) {
  if (error instanceof AppError) {
    return { status: error.status, message: error.message, headers: error.headers };
  }
  console.error("Server operation failed", error);
  return { status: 500, message: "Something went wrong. Please try again.", headers: {} };
}
