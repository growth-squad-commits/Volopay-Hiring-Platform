import { NextRequest, NextResponse } from "next/server";
import { AppError, publicError, requireAdmin } from "@/lib/server/auth";
import { validateQuestionInput, type QuestionBankItemInput } from "@/lib/server/question-bank-validation";

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = (await request.json()) as { bankId?: unknown; questions?: QuestionBankItemInput[] };
    const bankId = Number(body.bankId);
    if (!Number.isSafeInteger(bankId) || bankId < 1) throw new AppError(400, "Invalid question bank.");
    if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 500) {
      throw new AppError(400, "Provide between 1 and 500 questions.");
    }

    const { data: bank } = await supabase.from("question_banks").select("id").eq("id", bankId).maybeSingle();
    if (!bank) throw new AppError(404, "Question bank not found.");

    const valid: ReturnType<typeof validateQuestionInput>[] = [];
    const errors: { row: number; error: string }[] = [];
    body.questions.forEach((question, index) => {
      try { valid.push(validateQuestionInput(question)); }
      catch (error) { errors.push({ row: index + 2, error: error instanceof Error ? error.message : "Invalid row." }); }
    });

    if (valid.length) {
      const { error } = await supabase.from("question_bank_items").insert(
        valid.map((question, index) => ({ ...question, bank_id: bankId, sort_order: index })),
      );
      if (error) throw error;
      await supabase.from("question_banks").update({ updated_at: new Date().toISOString() }).eq("id", bankId);
    }

    return NextResponse.json({ imported: valid.length, failed: errors.length, errors });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
