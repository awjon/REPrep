# Jobs contract — n8n (Firebat) ↔ REPrep

n8n on Firebat owns **when** scheduled work runs. The REPrep app and the ingest runner own **what** happens. This file is the interface between them. Change it here first, then on both sides.

## Auth

Every job call carries a static bearer token:

```
Authorization: Bearer <token>
```

| Caller → callee | n8n credential (Header Auth) | Callee env var |
|---|---|---|
| n8n → Vercel app `/api/jobs/*` | `REPrep Jobs Token` | `JOBS_TOKEN` |
| n8n → ingest runner on Firebat | `REPrep Ingest Token` | `INGEST_TOKEN` |

- Callee compares with `crypto.timingSafeEqual`. Missing or wrong token → `401`, no body detail.
- Tokens are 32+ random bytes, base64url. Generate with `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`.
- The two tokens are different. Rotating one does not touch the other.
- Why not HMAC: calls are HTTPS (app) or an internal Docker network (runner), and every job is idempotent, so replay buys an attacker nothing. A bearer token fits n8n's native Header Auth credential with no Code node and no env access in nodes.

## 1. Deadline reminders

`POST {APP_URL}/api/jobs/reminders` — called hourly, 06:07–22:07 Pacific.

Request:
```json
{ "runAt": "2026-10-12T07:07:00.000-07:00", "lookaheadHours": 48, "dryRun": false }
```

Response `200`:
```json
{
  "ok": true,
  "due": 3,
  "sent": 2,
  "skipped": 1,
  "failed": 0,
  "errors": []
}
```
`errors[]` items: `{ "dealDateId": "uuid", "reason": "short machine string" }`. No addresses, no document text, no deal notes in the response — it lands in an email and in n8n execution logs.

Rules the app must enforce (not n8n):
- **Idempotent.** A reminder is keyed `(deal_date_id, offset)` in a `reminder_sends` table with a unique constraint. Running the job twice, or n8n retrying, never sends twice. `skipped` counts these.
- Offsets live in the app (default: 48 h and 24 h before the deadline, plus a same-day 9 am Pacific notice). n8n only says "now"; it does not know about offsets.
- A deadline already passed or a deal marked closed/terminated is never reminded.
- `dryRun: true` computes and returns counts, sends nothing, writes nothing.
- Any unhandled error → `500` with `{ "ok": false, "error": "short string" }`.

## 2. King County ingest

`POST {RUNNER_URL}/run` — called weekly, Sunday 03:07 Pacific. The runner is the `ingest/` service in this repo, running as a container on Firebat on the same Docker network as n8n. It is **not** exposed through the Cloudflare tunnel.

Request:
```json
{
  "force": false,
  "sources": [
    { "name": "sales",   "url": "https://aqua.kingcounty.gov/extranet/assessor/Real%20Property%20Sales.zip" },
    { "name": "parcel",  "url": "https://aqua.kingcounty.gov/extranet/assessor/Parcel.zip" },
    { "name": "resbldg", "url": "https://aqua.kingcounty.gov/extranet/assessor/Residential%20Building.zip" },
    { "name": "lookup",  "url": "https://aqua.kingcounty.gov/extranet/assessor/Lookup.zip" }
  ]
}
```
URLs are set in the n8n workflow's Config node so they can be fixed without a redeploy. **Confirm them against the Assessor's Data Download page before first activation** (CLAUDE.md open question #4).

Response `200`:
```json
{
  "ok": true,
  "changed": ["sales"],
  "unchanged": ["parcel", "resbldg", "lookup"],
  "rows": { "sales": 41213 },
  "durationMs": 184220
}
```

Rules the runner must enforce:
- Checks each source's `ETag` / `Last-Modified` against its last successful load and skips unchanged files unless `force: true`.
- Loads into staging tables, validates row counts and required columns with zod, then swaps in one transaction. A failed load leaves the previous data in place.
- Responds synchronously. n8n waits up to 30 minutes.
- Any failure → non-200 with `{ "ok": false, "error": "short string", "source": "sales" }`.
