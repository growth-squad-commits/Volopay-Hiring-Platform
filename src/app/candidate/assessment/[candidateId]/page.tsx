import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AssessmentRunner } from "@/components/assessment-runner";

export const dynamic = "force-dynamic";

export default async function AssessmentPage({ params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const id = Number(candidateId);
  if (!Number.isInteger(id)) redirect("/candidate");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/candidate/login");
  return <AssessmentRunner candidateId={id}/>;
}
