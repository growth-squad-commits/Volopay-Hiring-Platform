import { NextResponse } from "next/server";
import { AppError, publicError, requireAdmin } from "@/lib/server/auth";
import { validateQuestionInput } from "@/lib/server/question-bank-validation";

type QuestionInput = {
  title?: unknown;
  prompt?: unknown;
  response_type?: unknown;
  points?: unknown;
  difficulty?: unknown;
  is_required?: unknown;
  written_answer_type?: unknown;
  word_limit?: unknown;
  allowed_file_types?: unknown;
  maximum_file_size_mb?: unknown;
  link_guidance?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await requireAdmin();
    const body = await request.json() as {
      title?: unknown;
      description?: unknown;
      instructions?: unknown;
      durationMinutes?: unknown;
      availableFrom?: unknown;
      availableUntil?: unknown;
      status?: unknown;
      questions?: QuestionInput[];
      bankItemIds?: unknown[];
    };

    const title = text(body.title);
    const durationMinutes = Number(body.durationMinutes);
    const availableFrom = validDate(body.availableFrom);
    const availableUntil = validDate(body.availableUntil);
    const requestedStatus = body.status === "published" ? "published" : "draft";
    const bankItemIds = [...new Set((body.bankItemIds ?? []).map(Number).filter(Number.isSafeInteger))];

    if (title.length < 2 || title.length > 200) throw new AppError(400, "Enter a valid assessment title.");
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
      throw new AppError(400, "Duration must be between 1 and 1440 minutes.");
    }
    if (!availableFrom || !availableUntil || availableUntil <= availableFrom) {
      throw new AppError(400, "Enter a valid assessment schedule.");
    }

    const customQuestions = (body.questions ?? []).map((question) => validateQuestionInput({
      title: question.title,
      prompt: question.prompt,
      responseType: question.response_type,
      marks: question.points,
      difficulty: question.difficulty ?? "medium",
      isRequired: question.is_required,
      writtenAnswerType: question.written_answer_type,
      wordLimit: question.word_limit,
      allowedFileTypes: question.allowed_file_types,
      maximumFileSizeMb: question.maximum_file_size_mb,
      linkGuidance: question.link_guidance,
    }));

    let bankItems: Record<string, unknown>[] = [];
    if (bankItemIds.length) {
      const { data, error } = await supabase.from("question_bank_items").select("*").in("id", bankItemIds);
      if (error) throw error;
      if ((data ?? []).length !== bankItemIds.length) throw new AppError(400, "One or more selected bank questions are unavailable.");
      bankItems = data ?? [];
    }

    if (!customQuestions.length && !bankItems.length) throw new AppError(400, "Add at least one question.");

    const snapshots = [
      ...bankItems.map((item) => ({
        title: item.title,
        prompt: item.prompt,
        points: item.marks,
        response_type: item.response_type,
        is_required: item.is_required,
        written_answer_type: item.written_answer_type,
        word_limit: item.word_limit,
        allowed_file_types: item.allowed_file_types,
        maximum_file_size_mb: item.maximum_file_size_mb,
        link_guidance: item.link_guidance,
        source_bank_item_id: item.id,
        source_bank_item_updated_at: item.updated_at,
      })),
      ...customQuestions.map((item) => ({
        title: item.title,
        prompt: item.prompt,
        points: item.marks,
        response_type: item.response_type,
        is_required: item.is_required,
        written_answer_type: item.written_answer_type,
        word_limit: item.word_limit,
        allowed_file_types: item.allowed_file_types,
        maximum_file_size_mb: item.maximum_file_size_mb,
        link_guidance: item.link_guidance,
        source_bank_item_id: null,
        source_bank_item_updated_at: null,
      })),
    ];
    const totalPoints = snapshots.reduce((sum, item) => sum + Number(item.points), 0);

    const { data: assessment, error: assessmentError } = await supabase.from("assessments").insert({
      title,
      description: text(body.description),
      instructions: text(body.instructions),
      duration_minutes: durationMinutes,
      total_points: totalPoints,
      status: "draft",
      available_from: availableFrom.toISOString(),
      available_until: availableUntil.toISOString(),
      created_by: user.id,
    }).select("id").single();
    if (assessmentError || !assessment) throw assessmentError ?? new Error("Assessment was not created.");

    const { error: questionError } = await supabase.from("assessment_questions").insert(
      snapshots.map((item, index) => ({
        ...item,
        assessment_id: assessment.id,
        sort_order: index,
        frozen_at: requestedStatus === "published" ? new Date().toISOString() : null,
      })),
    );

    if (questionError) {
      await supabase.from("assessments").delete().eq("id", assessment.id);
      throw questionError;
    }

    if (requestedStatus === "published") {
      const { error: publishError } = await supabase.from("assessments").update({ status: "published" }).eq("id", assessment.id);
      if (publishError) {
        await supabase.from("assessments").delete().eq("id", assessment.id);
        throw publishError;
      }
    }

    return NextResponse.json({ id: assessment.id, status: requestedStatus, totalPoints }, { status: 201 });
  } catch (error) {
    const result = publicError(error);
    return NextResponse.json({ error: result.message }, { status: result.status, headers: result.headers });
  }
}
