# REPrep King County ingest runner

Small Node 22 HTTP service that downloads King County Assessor bulk extracts and loads them into the
app's Postgres (`kc_parcels`, `kc_res_buildings`, `kc_sales`, `ingest_runs`). Interface:
[`docs/jobs-contract.md`](../docs/jobs-contract.md) section 2. It runs on Firebat, on the same Docker
network as n8n, and is never published or tunnelled.

## API

- `POST /run` with `Authorization: Bearer <INGEST_TOKEN>` and `{ "force": false, "sources": [{ "name", "url" }] }`.
  Sources run in the order parcel, resbldg, sales, addresses, lookup regardless of request order.
  `200 { ok, changed, unchanged, rows, durationMs }`; failure `{ ok:false, error, source }` with 400 (bad request),
  401, 409 (`busy`), 422 (bad file: `invalid_file`, `missing_columns`, `empty_source`, `row_count_drop`),
  502 (`download_failed`, `download_incomplete`) or 500. The first failing source stops the run; sources
  already swapped stay loaded, the failing one keeps its previous data.
- `GET /healthz` returns 200.

| source | file | loads into |
|---|---|---|
| `parcel` | `EXTR_Parcel.csv` | `kc_parcels` |
| `resbldg` | `EXTR_ResBldg.csv` | `kc_res_buildings` |
| `sales` | `EXTR_RPSale.csv` (price > 0, `DocumentDate >= SALES_SINCE`) | `kc_sales` |
| `addresses` (optional) | one CSV, or a zip with one CSV | updates `kc_parcels.lat/lon/address/zip` |
| `lookup` | `EXTR_LookUp.csv` | nothing yet; recorded in `ingest_runs` |

The `addresses` header names are configured in `src/sources.ts` (defaults `PIN`, `LAT`, `LON`, `ADDR_FULL`,
`ZIP5`; env `ADDRESS_COL_PIN|LAT|LON|ADDRESS|ZIP` override).

## Environment

| var | required | notes |
|---|---|---|
| `DATABASE_URL` | yes | Supabase **direct** connection, owner role (RLS does not apply). Not the transaction pooler. |
| `INGEST_TOKEN` | yes | 32+ random bytes; same value as the n8n credential `REPrep Ingest Token`. |
| `PORT` | no | default 8080 |
| `SALES_SINCE` | no | default `2015-01-01` |
| `CSV_ENCODING` | no | default `latin1` |

## Deploy on Firebat

```sh
cd /path/to/reprep/ingest
cp docker-compose.example.yml docker-compose.yml   # set the network name to n8n's; see `docker network ls`
export REPREP_INGEST_DATABASE_URL='postgres://postgres:...@db.<ref>.supabase.co:5432/postgres'
export REPREP_INGEST_TOKEN="$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')"
docker compose up -d --build
docker logs -f reprep-ingest
```

Put the token in n8n as Header Auth credential `REPrep Ingest Token` (`Authorization: Bearer <token>`). The
workflow `n8n/reprep-kc-ingest.json` calls `http://reprep-ingest:8080/run`. Test from n8n's container:
`docker exec n8n wget -qO- http://reprep-ingest:8080/healthz`.

First run: set `force: true` once from the workflow's Manual test trigger. Expect several minutes and about
1 GB of scratch space in `/tmp` (zips are downloaded to disk, then streamed; memory stays flat).

## How a load works

HEAD each URL (GET headers if HEAD fails) and compare `ETag`/`Last-Modified` with the latest `ingest_runs` row;
unchanged sources are skipped unless `force`. Otherwise: download to a temp file, stream the zip entry through
`csv-parse` into a temp staging table with multi-row INSERTs, check the header and row counts (more than 0, and
at least 50% of current rows unless the table is empty), then in one transaction `DELETE` the target, `INSERT ... SELECT DISTINCT ON (key)` from staging and
record the run. `DELETE` rather than `TRUNCATE` so readers are not blocked by an exclusive lock while a few
million rows load. A `kc_parcels` reload carries over the geocoded columns written by `addresses`. One run at a
time (in-process lock plus `pg_try_advisory_lock`).

## Development

```sh
npm ci && npm run typecheck && npm test
```
Tests need Postgres with the app migrations applied (`TEST_DATABASE_URL`, default
`postgres://postgres@127.0.0.1:54329/reprep_test`) and truncate the `kc_*` tables and `ingest_runs`.
