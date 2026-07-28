import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const candidateEmail = process.env.DEMO_CANDIDATE_EMAIL;
const candidatePassword = process.env.DEMO_CANDIDATE_PASSWORD;
const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
if (!url || !serviceKey || !candidateEmail || !candidatePassword) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_CANDIDATE_EMAIL, and DEMO_CANDIDATE_PASSWORD.");
}

const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function ensureUser(email, password) {
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  let user = listed.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    user = data.user;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password, email_confirm: true });
    if (error) throw error;
  }
  return user;
}

const candidateUser = await ensureUser(candidateEmail, candidatePassword);
if (adminEmail && adminPassword) {
  const adminUser = await ensureUser(adminEmail, adminPassword);
  const { error } = await supabase.from("admin_profiles").upsert({ user_id: adminUser.id, email: adminEmail.toLowerCase(), full_name: "Volopay Admin", is_active: true });
  if (error) throw error;
}

let { data: assessment } = await supabase.from("assessments").select("id").eq("title", "Sample Sales Assessment").maybeSingle();
if (!assessment) {
  const now = new Date(); const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const result = await supabase.from("assessments").insert({
    title: "Sample Sales Assessment", description: "A production-connected assessment for testing the candidate workflow.",
    instructions: "Complete all required tasks. Your responses save automatically.",
    status: "draft", duration_minutes: 45, total_points: 100, available_from: now.toISOString(), available_until: until.toISOString(),
  }).select("id").single();
  if (result.error) throw result.error;
  assessment = result.data;
  const { error } = await supabase.from("assessment_questions").insert([
    { assessment_id: assessment.id, title: "Outbound strategy", prompt: "Describe a 30-day outbound plan for a mid-market fintech prospect.", points: 40, sort_order: 0, response_type: "written", written_answer_type: "long", is_required: true },
    { assessment_id: assessment.id, title: "Work sample", prompt: "Share a link to a relevant work sample.", points: 30, sort_order: 1, response_type: "link", link_guidance: "Use an accessible URL.", is_required: true },
    { assessment_id: assessment.id, title: "Supporting file", prompt: "Upload any supporting PDF or DOCX file.", points: 30, sort_order: 2, response_type: "file_upload", allowed_file_types: ["pdf","docx"], maximum_file_size_mb: 10, is_required: false },
  ]);
  if (error) throw error;
  const { error: publishError } = await supabase.from("assessments").update({ status: "published" }).eq("id", assessment.id);
  if (publishError) throw publishError;
}
const { error: candidateError } = await supabase.from("candidates").upsert({
  assessment_id: assessment.id, auth_user_id: candidateUser.id, full_name: "Sample Candidate",
  email: candidateEmail.toLowerCase(), status: "not_started", decision: "pending", source: "sample",
}, { onConflict: "assessment_id,email" });
if (candidateError) throw candidateError;
console.log(`Sample candidate ready: ${candidateEmail}`);
if (adminEmail) console.log(`Admin ready: ${adminEmail}`);
