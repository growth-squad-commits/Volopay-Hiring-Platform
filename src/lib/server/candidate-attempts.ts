import { AppError } from "@/lib/server/auth";

export const ATTEMPT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function candidateId(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new AppError(400, "Enter a valid candidate assignment.");
  }
  return parsed;
}

export function attemptId(value: unknown) {
  const parsed = String(value ?? "").trim();
  if (!ATTEMPT_ID_PATTERN.test(parsed)) throw new AppError(400, "Enter a valid attempt.");
  return parsed;
}

export function rpcRow<T>(data: T[] | T | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

export function attemptRpcError(error: { message?: string } | null) {
  const message = error?.message ?? "Attempt operation failed.";
  if (/not found/i.test(message)) return new AppError(404, "Assessment attempt not found.");
  if (/unavailable|not available|not authorized/i.test(message)) return new AppError(403, "This assessment is not available.");
  if (/complete \d+ required/i.test(message)) return new AppError(400, message);
  if (/word limit|valid http|file is too large|file type is not allowed|incomplete file|invalid .* response|unsupported response|question is not part/i.test(message)) {
    return new AppError(400, message);
  }
  return new AppError(500, "Could not update the assessment. Please try again.");
}

export function optionalText(value: unknown, maximum: number) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new AppError(400, "Invalid answer.");
  const trimmed = value.trim();
  if (trimmed.length > maximum) throw new AppError(400, "Answer is too long.");
  return trimmed || null;
}

export function optionalSize(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new AppError(400, "Invalid file size.");
  return parsed;
}
