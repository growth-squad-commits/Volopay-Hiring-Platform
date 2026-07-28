import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AssessmentRunner } from "@/components/assessment-runner";

export const dynamic = "force-dynamic";

export default async function AssessmentPage({ params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const id = Number(candidateId);
  if (!Number.isInteger(id)) redirect("/candidate");
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user?.id || !auth.user.email) redirect("/candidate/login");
  const { data: assignment } = await supabase.from("candidates").select("id")
    .eq("id", id)
    .eq("auth_user_id", auth.user.id)
    .eq("email", auth.user.email.toLowerCase())
    .eq("is_active", true)
    .maybeSingle();
  if (!assignment) redirect("/candidate");
  return <AssessmentRunner candidateId={id}/>;
}
