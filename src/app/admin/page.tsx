import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminDashboard } from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/admin/login");
  const { data: admin } = await supabase.from("admin_profiles").select("is_active").eq("user_id", userId).eq("is_active", true).maybeSingle();
  if (!admin) redirect("/admin/login");
  return <><Link href="/admin/question-banks" className="button secondary" style={{ position: "fixed", left: 20, top: 118, zIndex: 20 }}>Question Banks</Link><AdminDashboard email={String(claims?.claims?.email ?? "")} /></>;
}
