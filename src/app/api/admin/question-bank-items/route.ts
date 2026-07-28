import { NextRequest, NextResponse } from "next/server";
import { AppError, publicError, requireAdmin } from "@/lib/server/auth";
import { validateQuestionInput, type QuestionBankItemInput } from "@/lib/server/question-bank-validation";

function validId(value: unknown, field: string) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new AppError(400, `Invalid ${field}.`);
  return id;
}

export async function POST(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = (await request.json()) as { bankId?: unknown; question?: QuestionBankItemInput };
    const bankId = validId(body.bankId, "question bank");
    const question = validateQuestionInput(body.question ?? {});
    const { data: bank } = await supabase.from("question_banks").select("id").eq("id", bankId).maybeSingle();
    if (!bank) throw new AppError(404, "Question bank not found.");
    const { data, error } = await supabase.from("question_bank_items")
      .insert({ ...question, bank_id: bankId })
      .select("*")
      .single();
    if (error) throw error;
    await supabase.from("question_banks").update({ updated_at: new Date().toISOString() }).eq("id", bankId);
    return NextResponse.json({ question: data }, { status: 201 });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = (await request.json()) as { questionId?: unknown; question?: QuestionBankItemInput };
    const questionId = validId(body.questionId, "question");
    const question = validateQuestionInput(body.question ?? {});
    const { data, error } = await supabase.from("question_bank_items")
      .update({ ...question, updated_at: new Date().toISOString() })
      .eq("id", questionId)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new AppError(404, "Question not found.");
    await supabase.from("question_banks").update({ updated_at: new Date().toISOString() }).eq("id", data.bank_id);
    return NextResponse.json({ question: data });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const questionId = validId(new URL(request.url).searchParams.get("questionId"), "question");
    const { data: existing } = await supabase.from("question_bank_items").select("bank_id").eq("id", questionId).maybeSingle();
    if (!existing) throw new AppError(404, "Question not found.");
    const { error } = await supabase.from("question_bank_items").delete().eq("id", questionId);
    if (error) throw error;
    await supabase.from("question_banks").update({ updated_at: new Date().toISOString() }).eq("id", existing.bank_id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
