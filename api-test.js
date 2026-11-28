// End-to-end API tests for the Subscription Tracker.
// Runs the real Express server against a throwaway SQLite file, then exercises
// every endpoint through HTTP. Covers the six tests in the proposal's testing
// plan (Section 8) plus the instructor's validation and error-handling findings.
//
// Run with:  npm test   (or: node --test api-test.js)

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 3100 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'subtracker-test-'));
const DB_FILE = path.join(TMP_DIR, 'test.db');

let server = null;

// Starts server.js as a child process and resolves once it answers HTTP.
async function startServer(extraArgs = []) {
  server = spawn(process.execPath, ['server.js', ...extraArgs], {
    cwd: __dirname,
    env: { ...process.env, PORT: String(PORT), DB_FILE },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  for (let i = 0; i < 50; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/categories`);
      if (res.ok) return;
    } catch (_) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server did not start');
}

function stopServer() {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.once('exit', () => resolve());
    server.kill();
    server = null;
  });
}

async function api(method, route, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body))
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* leave null */ }
  return { status: res.status, json, text, contentType: res.headers.get('content-type') || '' };
}

const summary = async () => (await api('GET', '/api/summary')).json;

test.before(async () => { await startServer(['--seed']); });
test.after(async () => {
  await stopServer();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Test 1: Financial Result (seed data, $10 weekly = $520)
// ---------------------------------------------------------------------------
test('Financial Result: seeded dashboard totals match the proposal', async () => {
  const s = await summary();
  assert.equal(s.active_annual_outflow_cents, 85088, 'Active Annual Outflow $850.88');
  assert.equal(s.monthly_outflow_cents, 7091, 'Monthly Outflow Equivalent $70.91');
  assert.equal(s.reclaimed_annual_savings_cents, 0);
  assert.equal(s.active_subscriptions_count, 3);
  assert.equal(s.total_subscriptions_count, 4);
});

test('Financial Result: $10 weekly annualizes to $520.00 and $43.33 per month', async () => {
  const { json } = await api('GET', '/api/subscriptions');
  const gym = json.find((s) => s.name === 'Gym Weekly Pass');
  assert.equal(gym.annual_cents, 52000);
  assert.equal(gym.monthly_equivalent_cents, 4333);
  const prime = json.find((s) => s.name === 'Amazon Prime');
  assert.equal(prime.annual_cents, 13900);
  assert.equal(prime.monthly_equivalent_cents, 1158, '13900 / 12 = 1158.33 rounds half-up to 1158');
  const cloud = json.find((s) => s.name === 'Cloud Storage Pro');
  assert.equal(cloud.annual_cents, 11996);
  assert.equal(cloud.status, 'paused');
});

// ---------------------------------------------------------------------------
// Test 2: Complete Workflow (add Spotify, cancel it, savings = $143.88)
// ---------------------------------------------------------------------------
let spotifyId;

test('Complete Workflow: POST Spotify returns 201 with annualized cost', async () => {
  const { status, json } = await api('POST', '/api/subscriptions', {
    name: 'Spotify', category_id: 1, amount_cents: 1199, frequency: 'monthly', status: 'active'
  });
  assert.equal(status, 201);
  assert.equal(json.annual_cents, 14388);
  assert.equal(json.category_name, 'Entertainment');
  spotifyId = json.id;

  const s = await summary();
  assert.equal(s.active_annual_outflow_cents, 99476, '$850.88 + $143.88 = $994.76');
  assert.equal(s.active_subscriptions_count, 4);
  assert.equal(s.total_subscriptions_count, 5);
});

test('Complete Workflow: cancelling Spotify reclaims exactly $143.88', async () => {
  const { status, json } = await api('PATCH', `/api/subscriptions/${spotifyId}/status`, { status: 'canceled' });
  assert.equal(status, 200);
  assert.equal(json.status, 'canceled');
  assert.equal(json.savings_delta_cents, 14388);

  const s = await summary();
  assert.equal(s.reclaimed_annual_savings_cents, 14388);
  assert.equal(s.active_annual_outflow_cents, 85088, 'outflow returns to the seed baseline');
  assert.equal(s.active_subscriptions_count, 3);
  assert.equal(s.total_subscriptions_count, 5);
});

// ---------------------------------------------------------------------------
// Test 3: Repeated Status Toggle (no double counting)
// ---------------------------------------------------------------------------
test('Repeated Status Toggle: canceled -> active -> canceled stays at $143.88', async () => {
  await api('PATCH', `/api/subscriptions/${spotifyId}/status`, { status: 'active' });
  assert.equal((await summary()).reclaimed_annual_savings_cents, 0, 'reactivating removes the savings');

  await api('PATCH', `/api/subscriptions/${spotifyId}/status`, { status: 'canceled' });
  const s = await summary();
  assert.equal(s.reclaimed_annual_savings_cents, 14388, 'not $287.76');

  const deltas = s.recent_audit_logs
    .filter((l) => l.subscription_id === spotifyId)
    .map((l) => l.annual_savings_delta_cents);
  assert.deepEqual(deltas, [14388, -14388, 14388], 'audit log keeps every signed transition');
});

test('Repeated Status Toggle: paused is excluded from both outflow and savings', async () => {
  await api('PATCH', `/api/subscriptions/${spotifyId}/status`, { status: 'paused' });
  const s = await summary();
  assert.equal(s.reclaimed_annual_savings_cents, 0);
  assert.equal(s.active_annual_outflow_cents, 85088);
  await api('PATCH', `/api/subscriptions/${spotifyId}/status`, { status: 'canceled' });
});

test('Repeated Status Toggle: same-status PATCH is a no-op with zero delta', async () => {
  const before = (await summary()).recent_audit_logs.length;
  const { status, json } = await api('PATCH', `/api/subscriptions/${spotifyId}/status`, { status: 'canceled' });
  assert.equal(status, 200);
  assert.equal(json.savings_delta_cents, 0);
  assert.equal((await summary()).recent_audit_logs.length, before, 'no audit row appended');
});

// ---------------------------------------------------------------------------
// Test 4: Invalid Input (API returns 400 as JSON)
// ---------------------------------------------------------------------------
const valid = { name: 'Hulu', category_id: 1, amount_cents: 799, frequency: 'monthly', status: 'active' };
const invalidCases = [
  ['cost as a numeric string', { ...valid, amount_cents: '1500' }],
  ['cost as a boolean', { ...valid, amount_cents: true }],
  ['negative cost', { ...valid, amount_cents: -100 }],
  ['zero cost', { ...valid, amount_cents: 0 }],
  ['fractional cents', { ...valid, amount_cents: 15.5 }],
  ['cost above $10,000', { ...valid, amount_cents: 1000001 }],
  ['empty name', { ...valid, name: '   ' }],
  ['name over 100 characters', { ...valid, name: 'A'.repeat(101) }],
  ['unknown frequency', { ...valid, frequency: 'daily' }],
  ['unknown status', { ...valid, status: 'deleted' }],
  ['category id as a string', { ...valid, category_id: '1' }],
  ['category id that does not exist', { ...valid, category_id: 99 }],
  ['array body', [1, 2, 3]]
];

for (const [label, body] of invalidCases) {
  test(`Invalid Input: POST rejects ${label} with 400 JSON`, async () => {
    const before = (await summary()).total_subscriptions_count;
    const { status, json, contentType } = await api('POST', '/api/subscriptions', body);
    assert.equal(status, 400);
    assert.match(contentType, /application\/json/);
    assert.equal(typeof json.error, 'string');
    assert.equal((await summary()).total_subscriptions_count, before, 'nothing was inserted');
  });
}

test('Invalid Input: malformed JSON returns 400 JSON, not an HTML stack trace', async () => {
  const { status, json, contentType, text } = await api('POST', '/api/subscriptions', '{bad json');
  assert.equal(status, 400);
  assert.match(contentType, /application\/json/);
  assert.equal(json.error, 'Request body must be valid JSON.');
  assert.doesNotMatch(text, /SyntaxError|at JSON\.parse|<pre>/);
});

test('Invalid Input: PATCH rejects a bad status, a non-numeric id, and a missing id', async () => {
  let r = await api('PATCH', `/api/subscriptions/${spotifyId}/status`, { status: 'deleted' });
  assert.equal(r.status, 400);
  r = await api('PATCH', '/api/subscriptions/abc/status', { status: 'canceled' });
  assert.equal(r.status, 400);
  r = await api('PATCH', '/api/subscriptions/999999/status', { status: 'canceled' });
  assert.equal(r.status, 404);
});

test('Invalid Input: stored cost is never a boolean or string (schema CHECK)', async () => {
  const { json } = await api('GET', '/api/subscriptions');
  for (const s of json) assert.equal(typeof s.amount_cents, 'number');
});

// ---------------------------------------------------------------------------
// Test 5: Endpoint Verification (PUT, DELETE, 404s, unknown routes, filter)
// ---------------------------------------------------------------------------
let huluId;

test('Endpoint Verification: PUT edits a record and logs a status transition', async () => {
  const created = await api('POST', '/api/subscriptions', valid);
  huluId = created.json.id;

  const { status, json } = await api('PUT', `/api/subscriptions/${huluId}`, {
    name: 'Hulu Plus', category_id: 1, amount_cents: 999, frequency: 'quarterly', status: 'canceled'
  });
  assert.equal(status, 200);
  assert.equal(json.name, 'Hulu Plus');
  assert.equal(json.annual_cents, 3996);

  const s = await summary();
  assert.equal(s.reclaimed_annual_savings_cents, 14388 + 3996, 'edited amount recalculates savings');
  const log = s.recent_audit_logs.find((l) => l.subscription_id === huluId);
  assert.equal(log.previous_status, 'active');
  assert.equal(log.new_status, 'canceled');
  assert.equal(log.annual_savings_delta_cents, 3996);
});

test('Endpoint Verification: PUT keeps the existing status when none is sent', async () => {
  const { status, json } = await api('PUT', `/api/subscriptions/${huluId}`, {
    name: 'Hulu Plus', category_id: 1, amount_cents: 999, frequency: 'quarterly'
  });
  assert.equal(status, 200);
  assert.equal(json.status, 'canceled');
});

test('Endpoint Verification: PUT and DELETE on a missing id return 404', async () => {
  assert.equal((await api('PUT', '/api/subscriptions/999999', valid)).status, 404);
  assert.equal((await api('DELETE', '/api/subscriptions/999999')).status, 404);
});

test('Endpoint Verification: DELETE returns 200, cascades audit logs, and removes savings', async () => {
  const { status, json } = await api('DELETE', `/api/subscriptions/${huluId}`);
  assert.equal(status, 200);
  assert.equal(json.deleted_id, huluId);

  const s = await summary();
  assert.equal(s.reclaimed_annual_savings_cents, 14388, 'deleted canceled service no longer counts');
  assert.equal(s.recent_audit_logs.some((l) => l.subscription_id === huluId), false, 'ON DELETE CASCADE');
  assert.equal((await api('DELETE', `/api/subscriptions/${huluId}`)).status, 404);
});

test('Endpoint Verification: GET /api/categories returns the eight seeded categories', async () => {
  const { status, json } = await api('GET', '/api/categories');
  assert.equal(status, 200);
  assert.deepEqual(json.map((c) => c.name), [
    'Entertainment', 'Sports', 'Fitness', 'Software & Productivity',
    'Food & Lifestyle', 'Education', 'Travel', 'Other'
  ]);
});

test('Endpoint Verification: GET /api/subscriptions?category_id filters by category', async () => {
  const { json } = await api('GET', '/api/subscriptions?category_id=1');
  assert.deepEqual(json.map((s) => s.name).sort(), ['Netflix', 'Spotify']);
  const fitness = (await api('GET', '/api/subscriptions?category_id=3')).json;
  assert.deepEqual(fitness.map((s) => s.name), ['Gym Weekly Pass']);
});

test('Endpoint Verification: unknown API route returns 404 JSON', async () => {
  const { status, json, contentType } = await api('GET', '/api/does-not-exist');
  assert.equal(status, 404);
  assert.match(contentType, /application\/json/);
  assert.equal(json.error, 'API route not found.');
});

test('Endpoint Verification: dashboard HTML is served from public/', async () => {
  const res = await fetch(`${BASE}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Subscription Tracker/);
});

// ---------------------------------------------------------------------------
// Test 6: Persistence (real server restart)
// ---------------------------------------------------------------------------
test('Persistence: data and audit history survive a server restart', async () => {
  const before = await summary();
  await stopServer();
  await startServer(); // no --seed this time
  const after = await summary();
  assert.deepEqual(after, before);
  assert.equal(after.reclaimed_annual_savings_cents, 14388);
  assert.equal(after.total_subscriptions_count, 5);
});
