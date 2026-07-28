import { AppError } from "@/lib/server/auth";

export type QuestionBankItemInput = {
  title?: unknown;
  prompt?: unknown;
  responseType?: unknown;
  marks?: unknown;
  difficulty?: unknown;
  isRequired?: unknown;
  writtenAnswerType?: unknown;
  wordLimit?: unknown;
  allowedFileTypes?: unknown;
  maximumFileSizeMb?: unknown;
  linkGuidance?: unknown;
  sortOrder?: unknown;
};

function text(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "string") throw new AppError(400, `${field} is required.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new AppError(400, `${field} must be between ${min} and ${max} characters.`);
  }
  return normalized;
}

function optionalText(value: unknown, max: number) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new AppError(400, "Invalid text value.");
  const normalized = value.trim();
  if (normalized.length > max) throw new AppError(400, `Text must not exceed ${max} characters.`);
  return normalized || null;
}

function positiveInteger(value: unknown, field: string, max: number) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0 || number > max) {
    throw new AppError(400, `${field} must be a positive whole number up to ${max}.`);
  }
  return number;
}

export function validateBankInput(input: { title?: unknown; subject?: unknown; description?: unknown }) {
  return {
    title: text(input.title, "Bank title", 2, 200),
    subject: text(input.subject, "Subject", 2, 120),
    description: optionalText(input.description, 2000) ?? "",
  };
}

export function validateQuestionInput(input: QuestionBankItemInput) {
  const responseType = input.responseType;
  if (responseType !== "written" && responseType !== "link" && responseType !== "file_upload") {
    throw new AppError(400, "Answer type must be written, link, or file upload.");
  }
  const difficulty = input.difficulty ?? "medium";
  if (difficulty !== "easy" && difficulty !== "medium" && difficulty !== "hard") {
    throw new AppError(400, "Difficulty must be easy, medium, or hard.");
  }
  const isRequired = input.isRequired === undefined ? true : input.isRequired;
  if (typeof isRequired !== "boolean") throw new AppError(400, "Required must be true or false.");

  let writtenAnswerType: "short" | "long" | null = null;
  let wordLimit: number | null = null;
  let allowedFileTypes: string[] | null = null;
  let maximumFileSizeMb: number | null = null;
  let linkGuidance: string | null = null;

  if (responseType === "written") {
    if (input.writtenAnswerType !== "short" && input.writtenAnswerType !== "long") {
      throw new AppError(400, "Written answers require short or long answer type.");
    }
    writtenAnswerType = input.writtenAnswerType;
    if (input.wordLimit !== null && input.wordLimit !== undefined && input.wordLimit !== "") {
      wordLimit = positiveInteger(input.wordLimit, "Word limit", 10000);
    }
  }

  if (responseType === "link") {
    linkGuidance = optionalText(input.linkGuidance, 1000);
  }

  if (responseType === "file_upload") {
    if (!Array.isArray(input.allowedFileTypes)) throw new AppError(400, "File uploads require allowed file types.");
    allowedFileTypes = [...new Set(input.allowedFileTypes.map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
    if (allowedFileTypes.length < 1 || allowedFileTypes.length > 20) {
      throw new AppError(400, "Provide between 1 and 20 allowed file types.");
    }
    maximumFileSizeMb = positiveInteger(input.maximumFileSizeMb, "Maximum file size", 500);
  }

  const sortOrder = input.sortOrder === undefined ? 0 : Number(input.sortOrder);
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) throw new AppError(400, "Sort order must be zero or higher.");

  return {
    title: text(input.title, "Question title", 2, 200),
    prompt: text(input.prompt, "Question prompt", 5, 10000),
    response_type: responseType,
    marks: positiveInteger(input.marks, "Marks", 10000),
    difficulty,
    is_required: isRequired,
    written_answer_type: writtenAnswerType,
    word_limit: wordLimit,
    allowed_file_types: allowedFileTypes,
    maximum_file_size_mb: maximumFileSizeMb,
    link_guidance: linkGuidance,
    sort_order: sortOrder,
  };
}
