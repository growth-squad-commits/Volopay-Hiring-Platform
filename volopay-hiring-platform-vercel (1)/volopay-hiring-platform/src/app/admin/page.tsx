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
  return <AdminDashboard email={String(claims?.claims?.email ?? "")} />;
}
