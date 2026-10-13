# REPrep — first-time setup

Everything in M0–M4 is built and deployed to Vercel, but sign-in, data, email and review need these accounts wired up. Roughly an hour, in this order.

## 1. Supabase (database, auth, storage)

1. Create a project (region: West US). Save the **project URL**, **anon key**, **service role key**, and two connection strings from *Connect*:
   - **Transaction pooler** (port 6543) → Vercel `DATABASE_URL`
   - **Direct connection** (or session pooler, port 5432) → migrations and the ingest service
2. Apply migrations from your machine:
   ```bash
   DATABASE_URL="<direct connection string>" npx drizzle-kit migrate
   ```
3. In the SQL editor, run `supabase/storage.sql` (private `documents` bucket).
4. *Authentication → Sign In / Providers*: Email on, magic link on. Turn **off** "Allow new users to sign up" while `FEATURE_PUBLIC_SIGNUP=false` (the app's allowlist is a second layer).
5. *Authentication → URL Configuration*: Site URL = your production URL; add `https://<production-domain>/auth/confirm` and `https://*-awjons-projects.vercel.app/auth/confirm` to redirect URLs.
6. *Authentication → Email Templates → Magic Link*: so links work across devices, set the link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/deals`

## 2. Vercel environment variables

Project `reprep` (team awjon's projects) → *Settings → Environment Variables*, for Production and Preview:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | from step 1 |
| `DATABASE_URL` | transaction pooler URL |
| `ALLOWED_EMAILS` | `automatewithjon@gmail.com` (comma-separated) |
| `FEATURE_PUBLIC_SIGNUP` | `false` |
| `JOBS_TOKEN` | `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '='` |
| `RESEND_API_KEY`, `EMAIL_FROM` | from Resend (step 3) |
| `APP_URL` | production URL, e.g. `https://reprep-….vercel.app` |
| `ANTHROPIC_API_KEY` | from console.anthropic.com |
| `MODEL_REVIEW`, `MODEL_TRIAGE` | `claude-sonnet-5-5`, `claude-haiku-4-5-20251001` |
| `SEATTLE_ECA_LAYERS` | optional — see step 6 |

Then **redeploy** (the `NEXT_PUBLIC_*` values are baked in at build time).

Check: open the production URL, request a link with an allowed email, land on *Properties*.

## 3. Resend (reminder email)

Verify a sending domain, create an API key, set `EMAIL_FROM` like `REPrep <reminders@yourdomain>`.

## 4. n8n on Firebat

Follow `n8n/README.md`: create the two Header Auth credentials, import both workflows, set `appUrl` to the production URL. Production deployments must be reachable without Vercel Deployment Protection for `/api/jobs/*` (protection applies to previews by default; keep the job pointed at production).

## 5. King County ingest on Firebat

Follow `ingest/README.md`. Uses the **direct** Supabase connection (it needs advisory locks and temp tables). Before the first run:
- Confirm the four Assessor download URLs and their terms of use (CLAUDE.md open question #4).
- Find the parcel address/point dataset on King County GIS Open Data and set the `addresses` URL (or remove that source from the n8n Config node until you have it). Without it, comps fall back to assessor area/sub-area instead of radius.

## 6. Optional: environmentally critical area overlays

Set `SEATTLE_ECA_LAYERS` to a JSON array of official City of Seattle GIS layer URLs, e.g. `[{"name":"Steep slope","url":"https://…/MapServer/<n>"}]`. Unset, the Lot page says overlays were not checked.

## 7. Before relying on it

- Run `ANTHROPIC_API_KEY=… npm run eval:review` once (≈ $0.05) to check the review prompts against the live model.
- Spot-check comps on a property whose recent sales you know (M3 acceptance).
- Put one real deadline in and confirm the n8n reminder arrives (M1 acceptance).
- Attorney review of deadline defaults, disclaimers and report wording before anyone else uses it (open question #3).
