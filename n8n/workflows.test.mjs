// Structural + expression tests for the n8n workflow exports.
// Run: node --test n8n/workflows.test.mjs
// n8n itself is not needed. Expressions are evaluated against mocked
// $json / $now / $('Config') for every response shape the job contract allows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter((f) => f.endsWith('.json'));
const load = (f) => JSON.parse(readFileSync(join(here, f), 'utf8'));

const EXTERNAL = new Set(['n8n-nodes-base.httpRequest']);
const TRIGGERS = new Set(['n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.manualTrigger']);
const ALLOWED_CREDS = {
  gmailOAuth2: ['Gmail account'],
  httpHeaderAuth: ['REPrep Jobs Token', 'REPrep Ingest Token'],
};

// ---------- expression evaluation ----------

const now = {
  toISO: () => '2026-10-12T07:07:00.000-07:00',
  toFormat: () => '2026-10-12 07:07',
};

function evalExpr(src, ctx) {
  if (typeof src !== 'string' || !src.startsWith('=')) return src;
  return src.slice(1).replace(/\{\{([\s\S]*?)\}\}/g, (_, code) => {
    const fn = new Function('$json', '$now', '$', `return (${code});`);
    const v = fn(ctx.json, now, (name) => ({ item: { json: ctx.nodes[name] } }));
    return typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}

function configOf(wf) {
  const cfg = wf.nodes.find((n) => n.name === 'Config');
  const out = {};
  for (const a of cfg.parameters.assignments.assignments) {
    out[a.name] = typeof a.value === 'string' && a.value.startsWith('={{')
      ? new Function(`return (${a.value.slice(3, -2)});`)()
      : a.value;
  }
  return out;
}

// ---------- graph helpers ----------

function targets(wf, name) {
  const c = wf.connections[name];
  if (!c) return [];
  return c.main.flat().map((t) => t.node);
}

function reachable(wf, start) {
  const seen = new Set();
  const stack = [start];
  while (stack.length) {
    const n = stack.pop();
    if (seen.has(n)) continue;
    seen.add(n);
    stack.push(...targets(wf, n));
  }
  return seen;
}

// ---------- per-workflow structural tests ----------

for (const file of files) {
  const wf = load(file);
  const names = new Set(wf.nodes.map((n) => n.name));
  const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));

  test(`${file}: deploys inactive, Pacific time`, () => {
    assert.equal(wf.active, false);
    assert.equal(wf.settings.timezone, 'America/Los_Angeles');
    assert.equal(wf.settings.executionOrder, 'v1');
  });

  test(`${file}: unique node names and ids`, () => {
    assert.equal(names.size, wf.nodes.length);
    assert.equal(new Set(wf.nodes.map((n) => n.id)).size, wf.nodes.length);
  });

  test(`${file}: every connection points at a real node`, () => {
    for (const [from, c] of Object.entries(wf.connections)) {
      assert.ok(names.has(from), `unknown source ${from}`);
      for (const t of c.main.flat()) assert.ok(names.has(t.node), `${from} -> unknown ${t.node}`);
    }
  });

  test(`${file}: every non-trigger node is reachable from a trigger`, () => {
    const live = new Set();
    for (const n of wf.nodes) if (TRIGGERS.has(n.type)) reachable(wf, n.name).forEach((x) => live.add(x));
    for (const n of wf.nodes) assert.ok(live.has(n.name), `orphan node: ${n.name}`);
  });

  test(`${file}: schedule uses a 5-field cron`, () => {
    const sched = wf.nodes.find((n) => n.type === 'n8n-nodes-base.scheduleTrigger');
    const expr = sched.parameters.rule.interval[0].expression;
    assert.equal(expr.trim().split(/\s+/).length, 5);
  });

  test(`${file}: external calls have an error output wired to a Gmail alert`, () => {
    for (const n of wf.nodes.filter((x) => EXTERNAL.has(x.type))) {
      assert.equal(n.onError, 'continueErrorOutput', `${n.name} must expose an error output`);
      assert.equal(n.parameters.options.response.response.neverError, true);
      assert.equal(n.parameters.options.response.response.fullResponse, true);
      const errBranch = wf.connections[n.name].main[1];
      assert.ok(errBranch?.length, `${n.name} error output not connected`);
      for (const t of errBranch) assert.equal(byName[t.node].type, 'n8n-nodes-base.gmail');
    }
  });

  test(`${file}: both branches of every IF are connected`, () => {
    for (const n of wf.nodes.filter((x) => x.type === 'n8n-nodes-base.if')) {
      const m = wf.connections[n.name]?.main ?? [];
      assert.equal(m.length, 2, `${n.name} needs true and false outputs`);
      assert.ok(m[0].length && m[1].length, `${n.name} has an unwired branch`);
    }
  });

  test(`${file}: credentials referenced by exact allowed name, no secrets inline`, () => {
    for (const n of wf.nodes) {
      for (const [type, ref] of Object.entries(n.credentials ?? {})) {
        assert.ok(ALLOWED_CREDS[type]?.includes(ref.name), `${n.name}: ${type}/${ref.name}`);
      }
    }
    const raw = readFileSync(join(here, file), 'utf8');
    assert.doesNotMatch(raw, /Bearer\s+[A-Za-z0-9_-]{10,}/);
    assert.doesNotMatch(raw, /\b(sk-ant-|re_[A-Za-z0-9]{10,}|sk_live_|sk_test_)/);
    assert.doesNotMatch(raw, /\$env\./, 'use credentials, not env access in nodes');
  });

  test(`${file}: no Code nodes (native nodes only)`, () => {
    assert.ok(!wf.nodes.some((n) => n.type === 'n8n-nodes-base.code'));
  });
}

// ---------- expression tests per response shape ----------

const shapes = {
  reminders: {
    ok: { statusCode: 200, body: { ok: true, due: 3, sent: 2, skipped: 1, failed: 0, errors: [] } },
    partial: { statusCode: 200, body: { ok: true, due: 3, sent: 1, skipped: 0, failed: 2, errors: [{ dealDateId: 'a', reason: 'resend_429' }, { dealDateId: 'b', reason: 'bad_address' }] } },
    appError: { statusCode: 500, body: { ok: false, error: 'db_unavailable' } },
    unauthorized: { statusCode: 401, body: '' },
    network: { error: { message: 'connect ECONNREFUSED', code: 'ECONNREFUSED' } },
  },
  ingest: {
    changed: { statusCode: 200, body: { ok: true, changed: ['sales'], unchanged: ['parcel', 'resbldg', 'lookup'], rows: { sales: 41213 }, durationMs: 184220 } },
    unchanged: { statusCode: 200, body: { ok: true, changed: [], unchanged: ['sales', 'parcel', 'resbldg', 'lookup'], rows: {}, durationMs: 900 } },
    runnerError: { statusCode: 502, body: { ok: false, error: 'download_failed', source: 'parcel' } },
    network: { error: { message: 'timeout of 1800000ms exceeded', code: 'ECONNABORTED' } },
  },
};

function evalIf(node, json) {
  const results = node.parameters.conditions.conditions.map((c) => {
    const left = evalExprRaw(c.leftValue, json);
    const op = c.operator;
    if (op.type === 'number' && op.operation === 'equals') return Number(left) === c.rightValue;
    if (op.type === 'number' && op.operation === 'gt') return Number(left) > c.rightValue;
    if (op.type === 'boolean' && op.operation === 'true') return left === true;
    if (op.type === 'array' && op.operation === 'notEmpty') return Array.isArray(left) && left.length > 0;
    throw new Error(`untested operator ${op.type}/${op.operation}`);
  });
  return node.parameters.conditions.combinator === 'and' ? results.every(Boolean) : results.some(Boolean);
}

function evalExprRaw(src, json) {
  const code = src.replace(/^=\{\{\s*|\s*\}\}$/g, '');
  try {
    return new Function('$json', `return (${code});`)(json);
  } catch {
    return undefined; // n8n treats a throwing left value as empty
  }
}

// Walks the graph from the HTTP node for one response, returns the terminal node
// and evaluates every expression on the path.
function run(wf, httpName, response) {
  const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  const ctx = { json: response, nodes: { Config: configOf(wf) } };
  let current = response.error ? wf.connections[httpName].main[1][0].node : wf.connections[httpName].main[0][0].node;
  for (;;) {
    const node = byName[current];
    if (node.type === 'n8n-nodes-base.if') {
      const branch = evalIf(node, ctx.json) ? 0 : 1;
      current = wf.connections[current].main[branch][0].node;
      continue;
    }
    const rendered = {};
    for (const [k, v] of Object.entries(node.parameters)) {
      if (typeof v === 'string') rendered[k] = evalExpr(v, ctx);
    }
    return { node, rendered };
  }
}

const reminders = load('reprep-deadline-reminders.json');
const ingest = load('reprep-kc-ingest.json');

test('reminders: request body renders to the contract shape', () => {
  const http = reminders.nodes.find((n) => n.name === 'Call reminders job');
  const ctx = { json: {}, nodes: { Config: configOf(reminders) } };
  const body = JSON.parse(evalExpr(http.parameters.jsonBody, ctx));
  assert.deepEqual(Object.keys(body).sort(), ['dryRun', 'lookaheadHours', 'runAt']);
  assert.equal(body.lookaheadHours, 48);
  assert.equal(body.dryRun, false);
  assert.match(evalExpr(http.parameters.url, ctx), /\/api\/jobs\/reminders$/);
});

test('reminders: all sent → silent', () => {
  assert.equal(run(reminders, 'Call reminders job', shapes.reminders.ok).node.name, 'All sent');
});

test('reminders: partial failure → partial alert listing each error', () => {
  const { node, rendered } = run(reminders, 'Call reminders job', shapes.reminders.partial);
  assert.equal(node.name, 'Alert: some reminders failed');
  assert.equal(rendered.subject, 'REPrep reminders: 2 of 3 failed to send');
  assert.match(rendered.message, /- a: resend_429\n- b: bad_address/);
});

for (const key of ['appError', 'unauthorized', 'network']) {
  test(`reminders: ${key} → job-failed alert with readable detail`, () => {
    const { node, rendered } = run(reminders, 'Call reminders job', shapes.reminders[key]);
    assert.equal(node.name, 'Alert: job failed');
    assert.doesNotMatch(rendered.subject + rendered.message, /undefined|\[object Object\]/);
    if (key === 'network') assert.match(rendered.subject, /no response/);
    else assert.match(rendered.subject, new RegExp(String(shapes.reminders[key].statusCode)));
  });
}

test('ingest: request body carries all five sources', () => {
  const http = ingest.nodes.find((n) => n.name === 'Run ingest');
  const ctx = { json: {}, nodes: { Config: configOf(ingest) } };
  const body = JSON.parse(evalExpr(http.parameters.jsonBody, ctx));
  assert.equal(body.force, false);
  assert.deepEqual(body.sources.map((s) => s.name), ['sales', 'parcel', 'resbldg', 'lookup', 'addresses']);
  for (const s of body.sources) assert.match(s.url, /^https:\/\//);
  assert.equal(evalExpr(http.parameters.url, ctx), 'http://reprep-ingest:8080/run');
});

test('ingest: changed data → refresh summary', () => {
  const { node, rendered } = run(ingest, 'Run ingest', shapes.ingest.changed);
  assert.equal(node.name, 'Notify: data refreshed');
  assert.equal(rendered.subject, 'REPrep: King County data refreshed (sales)');
  assert.match(rendered.message, /Rows loaded: sales=41213/);
  assert.match(rendered.message, /Duration: 184 s/);
});

test('ingest: nothing changed → silent', () => {
  assert.equal(run(ingest, 'Run ingest', shapes.ingest.unchanged).node.name, 'No change');
});

for (const key of ['runnerError', 'network']) {
  test(`ingest: ${key} → failure alert`, () => {
    const { node, rendered } = run(ingest, 'Run ingest', shapes.ingest[key]);
    assert.equal(node.name, 'Alert: ingest failed');
    assert.doesNotMatch(rendered.subject + rendered.message, /undefined|\[object Object\]/);
    if (key === 'runnerError') assert.match(rendered.subject, /\(parcel\)/);
  });
}
