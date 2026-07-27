import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CandidateWorkspace } from "@/components/candidate-workspace";

export const dynamic = "force-dynamic";

export default async function CandidatePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/candidate/login");
  return <CandidateWorkspace email={String(data?.claims?.email ?? "")} />;
}
