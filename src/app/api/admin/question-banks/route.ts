import { NextRequest, NextResponse } from "next/server";
import { AppError, publicError, requireAdmin } from "@/lib/server/auth";
import { validateBankInput, validateQuestionInput, type QuestionBankItemInput } from "@/lib/server/question-bank-validation";

export async function GET() {
  try {
    const { supabase } = await requireAdmin();
    const { data, error } = await supabase
      .from("question_banks")
      .select("id,title,subject,description,owner_id,created_at,updated_at,items:question_bank_items(*)")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ banks: data ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await requireAdmin();
    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      throw new AppError(415, "Unsupported request format.");
    }
    const body = (await request.json()) as {
      title?: unknown;
      subject?: unknown;
      description?: unknown;
      questions?: QuestionBankItemInput[];
    };
    const bank = validateBankInput(body);
    const questions = Array.isArray(body.questions) ? body.questions : [];
    if (questions.length > 500) throw new AppError(400, "A bank can contain at most 500 questions per request.");
    const validatedQuestions = questions.map(validateQuestionInput);

    const { data: created, error: bankError } = await supabase
      .from("question_banks")
      .insert({ ...bank, owner_id: user.id })
      .select("id,title,subject,description,owner_id,created_at,updated_at")
      .single();
    if (bankError || !created) throw bankError ?? new Error("Question bank creation failed.");

    if (validatedQuestions.length) {
      const { error: questionError } = await supabase.from("question_bank_items").insert(
        validatedQuestions.map((question) => ({ ...question, bank_id: created.id })),
      );
      if (questionError) {
        await supabase.from("question_banks").delete().eq("id", created.id);
        throw questionError;
      }
    }

    return NextResponse.json({ bank: { ...created, items: validatedQuestions } }, { status: 201 });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const body = (await request.json()) as {
      bankId?: unknown;
      title?: unknown;
      subject?: unknown;
      description?: unknown;
    };
    const bankId = Number(body.bankId);
    if (!Number.isSafeInteger(bankId) || bankId < 1) throw new AppError(400, "Invalid question bank.");
    const values = validateBankInput(body);
    const { data, error } = await supabase
      .from("question_banks")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", bankId)
      .select("id,title,subject,description,owner_id,created_at,updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new AppError(404, "Question bank not found.");
    return NextResponse.json({ bank: data });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase } = await requireAdmin();
    const bankId = Number(new URL(request.url).searchParams.get("bankId"));
    if (!Number.isSafeInteger(bankId) || bankId < 1) throw new AppError(400, "Invalid question bank.");
    const { error } = await supabase.from("question_banks").delete().eq("id", bankId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const failure = publicError(error);
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
