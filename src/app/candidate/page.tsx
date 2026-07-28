import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CandidateWorkspace } from "@/components/candidate-workspace";

export const dynamic = "force-dynamic";

export default async function CandidatePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id || !data.user.email) redirect("/candidate/login");
  const email = data.user.email.toLowerCase();
  const { data: assignment } = await supabase.from("candidates").select("id")
    .eq("auth_user_id", data.user.id).eq("email", email).eq("is_active", true).limit(1).maybeSingle();
  if (!assignment) {
    await supabase.auth.signOut();
    redirect("/candidate/login");
  }
  return <CandidateWorkspace email={email} />;
}
