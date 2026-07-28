# Volopay Hiring Platform

A production-oriented Next.js application containing one linked admin and candidate workflow. It is a standard Next.js App Router project deployed behind Cloudflare.

## Application URLs

| Portal | Local URL | Production URL |
|---|---|---|
| Admin login | `http://localhost:3000/admin/login` | `https://YOUR_DOMAIN/admin/login` |
| Admin workspace | `http://localhost:3000/admin` | `https://YOUR_DOMAIN/admin` |
| Candidate login | `http://localhost:3000/candidate/login` | `https://YOUR_DOMAIN/candidate/login` |
| Candidate workspace | `http://localhost:3000/candidate` | `https://YOUR_DOMAIN/candidate` |
| Candidate assessment | `/candidate/assessment/[candidateId]` | Same path on your domain |

Both portals live in this one application. Supabase links them through `assessment_id`, `candidate_id`, and the authenticated candidate email.

## Included features

- Password-protected, allowlisted admin access
- Assessment creation with several questions in one save
- Written, link and file-upload responses
- Assessment availability dates and fixed attempt duration
- Manual candidate creation and Excel import
- Candidate magic-link-only login
- Candidate invitation, assignment, activation and access-expiry controls
- Reusable question banks with CSV/XLSX import
- Candidate-only assigned assessment access
- Autosaved candidate responses
- Private Supabase Storage uploads
- Final submission and thank-you page
- Admin response review, scoring and hiring decisions
- Complete candidate CSV export
- Row-level security and protected candidate fields

Google OAuth is intentionally not included.

## 1. Create or select a Supabase project

Apply every SQL file in `supabase/migrations` in filename order. Do not apply only the initial schema.

Current order:

1. `202607260001_initial_schema.sql`
2. `202607280002_auth_rate_limits.sql`
3. `202607280003_candidate_active_access.sql`
4. `202607280004_candidate_access_expiry.sql`
5. `202607280005_consolidate_candidate_rls.sql`
6. `202607280005_precise_admin_rls.sql`
7. `202607280006_question_banks.sql`
8. `202607280007_exam_builder_snapshots.sql`

The migrations create the application tables, indexes, access controls, rate limits, candidate expiry controls, question banks, timer enforcement and private upload bucket. Record applied migrations in the target environment and never skip a file.

## 2. Configure environment variables

Copy `.env.example` to `.env.local` and enter the values from Supabase Project Settings → API.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000

DEMO_CANDIDATE_EMAIL=YOUR_PRIVATE_TEST_CANDIDATE_EMAIL
DEMO_CANDIDATE_PASSWORD=YOUR_PRIVATE_STRONG_TEST_PASSWORD

BOOTSTRAP_ADMIN_EMAIL=sandeep.juttuga@volopay.co
BOOTSTRAP_ADMIN_PASSWORD=USE_A_STRONG_PASSWORD
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` with a `NEXT_PUBLIC_` prefix.

## 3. Create the sample candidate and first admin

After applying the migration:

```bash
npm install
npm run seed:demo
```

This creates:

- The admin account from `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`
- A candidate Auth account used only by the seed script; candidate UI access remains magic-link-only
- A published sample assessment assigned to that candidate

The seed script is idempotent and can be run again.

## 4. Test locally

```bash
npm run dev
```

Open the admin portal, create an assessment, add a candidate and request a magic link using that exact candidate email.

## 5. Deploy with Cloudflare

1. Push this repository to GitHub.
2. Connect the repository to the Cloudflare deployment used for the hiring platform.
3. Configure the Node.js compatibility settings required by the Next.js adapter.
4. Add every environment variable shown above as encrypted Cloudflare secrets or environment variables.
5. Set `NEXT_PUBLIC_SITE_URL` to the canonical Cloudflare/custom-domain production URL.
6. Deploy from the tested `main` commit.

Do not configure a separate Vercel deployment for this application.

## 6. Configure Supabase URLs

In Supabase Authentication → URL Configuration:

- Set **Site URL** to your production domain.
- Add `https://YOUR_DOMAIN/auth/callback` to Redirect URLs.
- Keep `http://localhost:3000/auth/callback` while developing locally.

Magic links use `/auth/callback` and then redirect candidates to `/candidate`.

## 7. Add your custom domain

In the relevant Cloudflare project:

1. Add the production hostname, for example `hiring.volopay.com`.
2. Complete the Cloudflare DNS binding.
3. Change `NEXT_PUBLIC_SITE_URL` to `https://hiring.volopay.com`.
4. Add `https://hiring.volopay.com/auth/callback` to Supabase Redirect URLs.
5. Redeploy after changing the environment variable.

## Excel candidate import format

Use an `.xlsx` file with:

| Name | Email | Phone | Access Expires At |
|---|---|---|---|
| Sample Candidate | candidate@example.com | +91... | 2026-08-31T18:00:00+05:30 |

The first row is treated as the header. `Access Expires At` is optional and must be a valid spreadsheet date or ISO-style date/time when supplied.

## Production checklist

- Keep all test passwords private and server-only.
- Configure custom SMTP in Supabase before sending candidate magic links at scale.
- Enable leaked-password protection in Supabase Auth.
- Keep the service-role key only in server environment variables.
- Test admin creation → candidate assignment → submission → review before launch.
