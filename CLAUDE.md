# REPrep — CLAUDE.md

Buyer-side home purchase prep for people buying without an agent. Washington State / King County first.
Repo: `awjon/REPrep` · Host: Vercel · Owner: Jon (solo).

REPrep **informs and organizes**. It never drafts contracts, never tells a user what to offer, and never represents anyone. Every feature decision is tested against that line (see §3).

---

## 1. What we are building

Two phases, one codebase. Phase A is Jon's own purchase tool. Phase B opens it to other buyers. Build multi-tenant from the first migration so Phase B is a flag flip, not a rewrite.

| # | Module | What it does | AI at runtime? |
|---|---|---|---|
| 1 | **Deal workspace** | One record per property: address, parcel, status, notes, files, contacts | No |
| 2 | **Deadline tracker** | Computes every contingency and closing date from mutual acceptance; reminders | No — pure rules engine |
| 3 | **Document review** | Upload Form 17, inspection report, title commitment, HOA/CC&Rs → flagged issues + questions to ask, each cited to a page | **Yes** — the only module that needs it |
| 4 | **Comps** | Comparable recorded sales from King County public data, with adjustable filters and a price range | No — deterministic SQL + stats |
| 5 | **Lot screen** | Zoning, lot size, ECA overlays, DADU feasibility flags from Seattle open data | No |
| 6 | **Offer term sheet** | Structured summary of price, contingencies, timelines, exported as PDF to hand to an attorney | No — templated |

### Cut list (do not build in MVP)
- Any MLS/listing feed, any scraping of Zillow/Redfin/NWMLS. Listings are entered manually by address.
- Generating, filling, or reproducing NWMLS forms.
- Push notifications, native apps, offline mode (email reminders only; PWA later).
- Lender integrations, e-signature, in-app messaging to listing agents.
- States other than Washington; counties other than King.
- Chat interface. Document review is a structured report, not a conversation.

---

## 2. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 App Router, TypeScript strict, React Server Components | Server Actions for mutations |
| UI | Tailwind + shadcn/ui | Mobile-first; used on a phone at open houses |
| DB | Supabase Postgres, Drizzle ORM | Comps radius uses lat/lon + bounding box + haversine (no PostGIS). Local tests use Postgres 16 with a Supabase shim |
| Auth | Supabase Auth, magic link only | One vendor; RLS works natively |
| Files | Supabase Storage, private buckets, signed URLs | Browser uploads direct to storage — Vercel bodies cap at ~4.5 MB |
| LLM | Anthropic API via `@anthropic-ai/sdk`, server-side only | Model IDs come from env, never hardcoded |
| Payments (Phase B) | Stripe Checkout + webhooks | Not before M5 |
| Email | Resend | Deadline reminders |
| Scheduled work | **n8n on Firebat** (`n8n/`), calling bearer-token `/api/jobs/*` endpoints per `docs/jobs-contract.md` | **Never Vercel cron** |
| Tests | Vitest (unit), Playwright (e2e) | |
| Deploy | Vercel, preview per PR, `main` → production | |

Cost target: zero fixed spend at Phase A volume. The only variable cost is document review tokens — log tokens and dollars per review in `review_runs`.

### Environment variables
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
ANTHROPIC_API_KEY
MODEL_REVIEW=claude-sonnet-5-5
MODEL_TRIAGE=claude-haiku-4-5-20251001
RESEND_API_KEY
JOBS_TOKEN                   # bearer token n8n sends to /api/jobs/* (see docs/jobs-contract.md)
ALLOWED_EMAILS               # comma-separated; only these can sign in while FEATURE_PUBLIC_SIGNUP=false
EMAIL_FROM, APP_URL          # reminder sender and the absolute app URL used in emails
STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET   # Phase B
FEATURE_PUBLIC_SIGNUP=false  # Phase B switch
```
Never commit secrets. Never print them. `.env.example` lists names only.

---

## 3. Legal guardrails — non-negotiable

These exist because crossing them is unlicensed brokerage or unauthorized practice of law in Washington. If a task seems to require breaking one, stop and ask Jon.

1. **No contract drafting.** Output is a term sheet in our own layout. Never reproduce NWMLS form text, numbering, or layout.
2. **No advice language.** Say "comparable sales ranged from X to Y" — never "you should offer X". Say "this item is commonly raised with an attorney" — never "this is a defect, demand a credit".
3. **No prohibited data sources.** Public records and user-entered data only. No scraping, no unofficial APIs, no browser automation against listing sites.
4. **Every review finding cites its source page.** A finding without a page reference is dropped, not shown.
5. **Disclaimer on every analytical surface** (review report, comps, term sheet, lot screen): not legal advice, not an appraisal, confirm with a Washington real estate attorney.
6. **Date rules are defaults, not law.** The deadline engine ships with editable defaults and labels each date "computed — confirm against your contract".
7. **User documents are private.** Private bucket, RLS on every table, hard delete on request, no document text in logs or analytics.

Any PR touching `lib/review/prompts/`, `lib/deadlines/rules/`, `lib/legal/`, or user-facing analytical copy needs the guardrail review in §5. Prompt changes also need `npm run eval:review` (live, ~$0.05) and a `SHARED_VERSION`/type version bump.

Enforcement in code: `lib/legal/banned-phrases.ts` (regexes; add every phrase that ever leaks as a test case), `tests/unit/copy-lint.test.ts` (scans app/, components/, lib/{legal,email,comps,lot,term-sheet,documents,deals}), and `lib/review/validate.ts` (quotes must be one continuous passage of ≥4 words / ≥20 normalized chars found on the cited page; no ellipses).

---

## 4. Architecture

```
app/
  (marketing)/            landing, pricing (Phase B)
  (app)/deals/[id]/       overview · deadlines · documents · comps · lot · term-sheet
  api/jobs/               n8n-triggered: reminders (bearer token, timing-safe compare)
  api/review/             starts and streams a review run
lib/
  deadlines/              rules engine — pure functions, no I/O
  comps/                  query builder + stats — pure where possible
  review/                 pipeline, prompts, zod schemas
  lot/                    zoning and overlay lookups
  db/                     drizzle schema, migrations, RLS policies
  legal/                  disclaimer components, banned-phrase lint
ingest/                   King County + Seattle loader service (container on Firebat, not Vercel)
n8n/                      exported n8n workflows + their tests
docs/jobs-contract.md     the n8n ↔ app ↔ ingest interface — change it here first
tests/
```

### Data model (core tables — all carry `user_id`, all under RLS)
`deals`, `deal_dates`, `reminder_sends`, `documents`, `review_runs`, `review_findings`, `comp_sets`, `term_sheets`
Shared reference data (no `user_id`, read-only to clients): `kc_parcels`, `kc_sales`, `kc_res_buildings`, `sea_zoning`, `sea_eca`

### Deadline engine
- Input: mutual acceptance timestamp + a set of period lengths. Output: a list of dated deadlines.
- Encodes the standard WA day-counting convention as the default rule set: periods of five days or less skip weekends and legal holidays; deadlines land at 9:00 pm Pacific. **Verify against current forms with an attorney before Phase B** (open question #3).
- Seeds: Form 17 review window (three business days), inspection, financing, title review, earnest money delivery, closing. All editable per deal.
- Pure functions, table-driven tests, a holiday table checked into the repo. 100% branch coverage here — a wrong date is the worst bug this product can have.
- Reminders: n8n calls `/api/jobs/reminders` hourly; the app decides what is due and sends via Resend. Idempotent on `(deal_date_id, offset)` — a retry or double run never double-sends.

### Document review pipeline
1. Browser uploads PDF to storage via signed URL; server records `documents` row.
2. **Triage** (`MODEL_TRIAGE`): classify document type, detect scanned vs. text, page count.
3. **Review** (`MODEL_REVIEW`): send the PDF natively to the API with a type-specific prompt; require JSON matching a zod schema — `{severity, category, summary, page, quote, question_to_ask}`.
4. **Validate**: reject findings whose `quote` is not found on the cited `page`; reject any that trip the banned-phrase lint.
5. Persist to `review_findings`; record tokens and cost in `review_runs`.

Long documents: split into page ranges under the API's per-request PDF limits, review in parallel, merge and dedupe. Route handler sets `maxDuration = 300` and streams progress. One prompt file per document type, versioned; prompt version stored on every run.

### Comps
- Source: King County Assessor bulk extracts (real property sales, parcel, residential building). Confirm current download location and licence terms at build time.
- Ingest is a small container on Firebat (`ingest/`), triggered weekly by n8n over the internal Docker network, loading to Postgres via staging tables and an atomic swap. Vercel never downloads bulk files.
- Query: radius (lat/lon from the optional `addresses` source) or assessor area/sub-area, recency, single building, unit match, living-area band, optional year/bed filters. Excludes sales with any sale-warning code and multi-parcel sales. Assessor numeric code filters stay off until checked against the Lookup extract (`lib/comps/codes.ts`).
- Output: the comp list, median and interquartile $/sqft, and a range. Show the method. No point estimate labelled as "value".

### Lot screen
Parcel lookup → zoning on record, lot area, jurisdiction, units, from King County Assessor records; ECA overlays from official City of Seattle ArcGIS layers configured in `SEATTLE_ECA_LAYERS` ("not checked" when unset). Emit **flags** that restate records, never a yes/no on whether a DADU is permitted, and link to SDCI.

---

## 5. Orchestration and model routing

Opus orchestrates and holds the plan. Sonnet does the building. Haiku does mechanical work. Delegate by default; the orchestrator writes code itself only when delegating would cost more than doing it.

| Work | Model | Agent |
|---|---|---|
| Planning, sequencing, schema and RLS design, cross-module decisions | Opus | orchestrator |
| Deadline rules design and the review of its tests | Opus | orchestrator |
| Review prompts and the eval set for them | Opus | orchestrator |
| Guardrail review (§3) on flagged paths | Opus | `code-reviewer` |
| Feature implementation: routes, components, Server Actions, Drizzle queries | Sonnet | general |
| Writing tests first, e2e flows | Sonnet | `test-engineer` |
| Ingest loaders, n8n workflows, Firebat deploy | Sonnet | `automation-architect`, `firebat-ops` |
| Standard PR review | Sonnet | `code-reviewer` |
| Scaffolding, shadcn installs, renames, fixtures, seed data, copy edits | Haiku | general |
| Market and competitor checks before Phase B | Sonnet | `market-researcher`, `business-analyst` |

Runtime models are separate from build models and set by env (§2): Sonnet for review, Haiku for triage. Nothing else in the product calls an LLM. Adding a new runtime LLM call requires Jon's approval and a written reason a deterministic approach cannot do it.

Orchestrator rules:
- One milestone at a time. Break it into tasks small enough for one subagent and one PR.
- Hand each subagent: the task, the files it may touch, the acceptance test, and the relevant section of this file.
- Independent tasks run in parallel; anything touching the schema runs alone.
- Verify a subagent's work by running the tests yourself. Do not accept "done" on its word.

---

## 6. Working conventions

- **TDD.** Failing test first, then implementation. No test, no merge.
- **Gate before every commit:** `npm run gate` (typecheck, lint, unit, n8n, build). Schema or data-access changes also run `scripts/test-db.sh start && npm run test:db` (local Postgres + PostGIS with a Supabase shim).
- All user data access goes through `withUser(userId, tx => …)` so RLS applies. `adminDb()` bypasses RLS and is only for `/api/jobs/*`.
- Each milestone ends with a Vercel preview deploy that Jon can click through.
- Small PRs, conventional commits, feature branches off `main`.
- Zod at every boundary: form input, API input, LLM output, ingest rows.
- n8n workflows: edit in n8n, export to `n8n/`, run `node --test n8n/workflows.test.mjs`. Native nodes only, no Code nodes, inactive on import.
- Server-only code imports `server-only`. The service-role key never reaches a client bundle.
- Migrations are forward-only and include their RLS policies in the same file.
- `lib/legal/banned-phrases.ts` runs as a lint over UI copy and as a filter over LLM output.
- Prefer boring and shippable. No new dependency without a one-line justification in the PR.

---

## 7. Milestones

| M | Scope | Done when |
|---|---|---|
| **M0** | Scaffold, Supabase, auth, RLS baseline, CI, Vercel deploy | Magic-link login works on the production URL; second test user cannot read the first's rows |
| **M1** | Deal workspace + deadline engine + email reminders via n8n | Enter an acceptance date, get a correct dated list; reminder email arrives from Firebat job |
| **M2** | Document upload + review pipeline for Form 17 and inspection reports | Upload a real PDF, get cited findings; cost per run logged; uncited findings provably dropped |
| **M3** | King County ingest + comps | Enter an address, get comps and a range that match a hand-checked sample |
| **M4** | Lot screen + term sheet PDF + title/HOA review types | Full flow on one real property, start to exported term sheet |
| **M5** | Phase B: landing page, Stripe, public signup flag, attorney-reviewed copy | Blocked on open questions 1–3 |

M0–M4 is the personal tool. Do not start M5 without Jon.

---

First-time account setup lives in `SETUP.md`.

## 8. Open questions

1. **Market check not done.** Before M5: who are the closest unrepresented-buyer tools, what do they charge, and are any dead — and why?
2. **Pricing.** Likely one-time per-purchase rather than subscription (a buyer needs this for weeks, not years). Needs per-review token cost from M2 to set a floor.
3. **Attorney review** of the deadline defaults, disclaimers, and review-report wording before any public user. Budget for a flat-fee consult.
4. **King County data terms** — confirm bulk extracts may be used in a commercial product and what attribution is required.
5. **Attorney referral** as a Phase B feature or revenue line — check WA rules on referral fees to non-lawyers first.
6. **Scanned inspection reports** — measure review quality on image-only PDFs in M2 before promising support.
7. **Name and domain** — "REPrep" is a working name; collision check before M5.
