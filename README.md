# Volopay Hiring Platform

A production-oriented Next.js application containing one linked admin and candidate workflow. It is a standard Next.js App Router project and can be imported directly into Vercel.

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
- Candidate email/password login
- Supabase magic-link candidate login, ready for production invitations
- Candidate-only assigned assessment access
- Autosaved candidate responses
- Private Supabase Storage uploads
- Final submission and thank-you page
- Admin response review, scoring and hiring decisions
- Complete candidate CSV export
- Row-level security and protected candidate fields

Google OAuth is intentionally not included.

## 1. Create or select a Supabase project

Open the Supabase SQL editor and run:

`supabase/migrations/202607260001_initial_schema.sql`

The migration creates the tables, relationships, indexes, row-level security policies, timer enforcement and private upload bucket.

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
- The candidate account from `DEMO_CANDIDATE_EMAIL` and `DEMO_CANDIDATE_PASSWORD`
- A published sample assessment assigned to that candidate

The seed script is idempotent and can be run again.

## 4. Test locally

```bash
npm run dev
```

Open the admin portal, create or edit an assessment, add a candidate and then sign into the candidate portal with that exact candidate email.

## 5. Deploy to Vercel

1. Push this folder to one GitHub repository.
2. In Vercel, select **Add New → Project**.
3. Import the repository.
4. Vercel automatically detects **Next.js**. Do not set a custom output directory.
5. Add every environment variable shown above.
6. Change `NEXT_PUBLIC_SITE_URL` to your Vercel production URL.
7. Deploy.

No Cloudflare or ChatGPT Sites configuration is present in this project.

## 6. Configure Supabase URLs

In Supabase Authentication → URL Configuration:

- Set **Site URL** to your production domain.
- Add `https://YOUR_DOMAIN/auth/callback` to Redirect URLs.
- Keep `http://localhost:3000/auth/callback` while developing locally.

Magic links use `/auth/callback` and then redirect candidates to `/candidate`.

## 7. Add your custom domain

In Vercel Project Settings → Domains:

1. Add your domain, for example `hiring.volopay.com`.
2. Add the DNS record Vercel displays.
3. Change `NEXT_PUBLIC_SITE_URL` to `https://hiring.volopay.com`.
4. Add `https://hiring.volopay.com/auth/callback` to Supabase Redirect URLs.
5. Redeploy after changing the environment variable.

## Excel candidate import format

Use an `.xlsx` file with:

| Name | Email | Phone |
|---|---|---|
| Sample Candidate | candidate@example.com | +91... |

The first row is treated as the header.

## Production checklist

- Keep all test passwords private and server-only.
- Configure custom SMTP in Supabase before sending candidate magic links at scale.
- Enable leaked-password protection in Supabase Auth.
- Keep the service-role key only in server environment variables.
- Test admin creation → candidate assignment → submission → review before launch.
