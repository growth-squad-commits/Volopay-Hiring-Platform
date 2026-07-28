import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { QuestionBankManager } from "@/components/question-bank-manager";

export const dynamic = "force-dynamic";

export default async function QuestionBanksPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/admin/login");
  const { data: admin } = await supabase.from("admin_profiles").select("is_active").eq("user_id", userId).eq("is_active", true).maybeSingle();
  if (!admin) redirect("/admin/login");
  return <QuestionBankManager email={String(claims?.claims?.email ?? "")} />;
}
