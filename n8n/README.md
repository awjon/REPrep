# n8n workflows (Firebat)

Scheduled work for REPrep runs on n8n at `n8n.radd.uk`, never on Vercel cron. The interface is in [`docs/jobs-contract.md`](../docs/jobs-contract.md).

| File | Schedule (PT) | Calls | Emails you when |
|---|---|---|---|
| `reprep-deadline-reminders.json` | Hourly, 06:07–22:07 | `POST {appUrl}/api/jobs/reminders` | The job fails, or any reminder failed to send |
| `reprep-kc-ingest.json` | Sunday 03:07 | `POST {runnerUrl}/run` on Firebat | Data changed (summary), or the ingest failed |

Both are native nodes only (no Code nodes), import **inactive**, and send nothing on a clean run with no news.

## Import

1. **Create credentials** in n8n first, names exact:
   - `REPrep Jobs Token` — type *Header Auth*. Name `Authorization`, value `Bearer <JOBS_TOKEN>`.
   - `REPrep Ingest Token` — type *Header Auth*. Name `Authorization`, value `Bearer <INGEST_TOKEN>`.
   - `Gmail account` — already exists.
   Generate each token with `openssl rand -base64 32 | tr '+/' '-_' | tr -d '='`. Put the same values in Vercel (`JOBS_TOKEN`) and the ingest container (`INGEST_TOKEN`).
2. **Import** each JSON: *Workflows → Import from File*.
3. **Re-select credentials** on the HTTP and Gmail nodes if n8n did not attach them by name.
4. **Edit the Config node** in each workflow:
   - Reminders: set `appUrl` to the production Vercel URL (it ships as `https://REPLACE-ME.vercel.app` so it fails loudly).
   - Ingest: confirm the four `sources` URLs against the King County Assessor's Data Download page.
5. **Confirm the workflow timezone** shows `America/Los_Angeles` (*Workflow settings*).

## Test before activating

Use the **Manual test** trigger in each workflow.

| Workflow | Before the app exists | After the endpoint ships |
|---|---|---|
| Reminders | Run once → expect the *job failed* email (proves the alert path) | Set `dryRun` = true in Config, run → expect silence and a 200 in the execution; then set it back to false |
| Ingest | Run once → expect the *ingest failed* email (runner unreachable) | Run with the runner up → expect the *data refreshed* email on first load |

Activate a workflow only after its success path has run once for real.

## Tests in this repo

```
node --test n8n/workflows.test.mjs
```
Checks graph wiring, that every external call has a wired Gmail error path, credential names, no inline secrets or `$env` access, and renders every expression against each response shape in the contract (success, partial failure, 4xx/5xx, network error). It does not run n8n itself.

## Changing a workflow

Edit in n8n, export, overwrite the JSON here, run the tests, commit. If the response shape changes, change `docs/jobs-contract.md` and the test fixtures in the same PR.
