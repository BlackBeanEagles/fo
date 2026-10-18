import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { createHmac } from 'node:crypto';

async function availablePort() {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

test('accounts only access their own tasks and receipts', async () => {
  const testRoot = join(import.meta.dirname, '.data', 'test-runs');
  await mkdir(testRoot, { recursive: true });
  const dataDir = await mkdtemp(join(testRoot, 'fo-auth-'));
  const port = await availablePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: import.meta.dirname,
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir, GITHUB_WEBHOOK_SECRET: 'local-test-secret', GITHUB_ALLOWED_REPOSITORY: 'BlackBeanEagles/fo', GITHUB_TASK_OWNER: 'alice' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverError = '';
  let serverOutput = '';
  child.stderr.on('data', chunk => { serverError += chunk.toString().slice(0, 2000); });
  child.stdout.on('data', chunk => { serverOutput += chunk.toString().slice(0, 2000); });
  async function request(path, options = {}, cookie = '') {
    const response = await fetch(base + path, { ...options, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  try {
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { await request('/api/auth/session'); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, `server started (exit=${child.exitCode}, output=${serverOutput}, error=${serverError})`);
    const registration = name => request('/api/auth/register', { method: 'POST', body: JSON.stringify({ username: name, password: 'a strong password 123' }) });
    const alice = await registration('alice');
    const bob = await registration('bob');
    assert.equal(alice.status, 201);
    assert.equal(bob.status, 201);
    const created = await request('/api/tasks', { method: 'POST', body: JSON.stringify({ title: 'Repair private office projector' }) }, alice.cookie);
    assert.equal(created.status, 201);
    const id = created.body.task.id;
    assert.equal((await request('/api/tasks', {}, alice.cookie)).body.tasks.length, 1);
    assert.deepEqual((await request('/api/tasks', {}, bob.cookie)).body.tasks, []);
    assert.equal((await request('/api/tasks')).status, 401);
    assert.equal((await request(`/api/tasks/${id}`, {}, bob.cookie)).status, 404);
    assert.equal((await request(`/api/tasks/${id}/receipt`, {}, bob.cookie)).status, 404);
    assert.equal((await request(`/api/tasks/${id}/run-trace`, {}, bob.cookie)).status, 404);
    assert.equal((await request(`/api/tasks/${id}/run-trace`, {}, alice.cookie)).status, 409);
    assert.equal((await request(`/api/tasks/${id}/action`, { method: 'POST', body: JSON.stringify({ type: 'start' }) }, bob.cookie)).status, 404);
    assert.equal((await request(`/api/tasks/${id}/demo-next`, { method: 'POST', body: '{}' }, bob.cookie)).status, 404);
    assert.equal((await request(`/api/tasks/${id}/demo-next`, { method: 'POST', body: '{}' }, alice.cookie)).status, 409);
    assert.equal((await request(`/api/tasks/${id}/fo/ask`, { method: 'POST', body: JSON.stringify({ intent: 'research', authorized: true }) }, bob.cookie)).status, 404);
    assert.equal((await request(`/api/tasks/${id}/fo/reply`, { method: 'POST', body: '{}' }, bob.cookie)).status, 404);
    assert.equal((await request('/api/status', {}, alice.cookie)).body.fo.connected, false);
    assert.equal((await request('/api/status', {}, bob.cookie)).body.fo.connected, false);
    assert.equal((await request('/api/github/sync', { method: 'POST', body: '{}' }, bob.cookie)).status, 403);
    assert.equal((await request(`/api/tasks/${id}`, {}, alice.cookie)).status, 200);
    await request(`/api/tasks/${id}/action`, { method: 'POST', body: JSON.stringify({ type: 'start' }) }, alice.cookie);
    const quoted = await request(`/api/tasks/${id}/action`, { method: 'POST', body: JSON.stringify({ type: 'add_option', vendor: 'Print shop', price: 25 }) }, alice.cookie);
    const optionId = quoted.body.task.options[0].id;
    await request(`/api/tasks/${id}/action`, { method: 'POST', body: JSON.stringify({ type: 'approve', optionId }) }, alice.cookie);
    await request(`/api/tasks/${id}/action`, { method: 'POST', body: JSON.stringify({ type: 'book', confirmation: 'Confirmed for pickup' }) }, alice.cookie);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/8QAAAABJRU5ErkJggg==';
    assert.equal((await request(`/api/tasks/${id}/action`, { method: 'POST', body: JSON.stringify({ type: 'complete', evidence: 'Picked up and photographed', verified: true, photoData: `data:image/png;base64,${png}` }) }, alice.cookie)).status, 200);
    assert.equal((await request(`/api/tasks/${id}/evidence`, {}, bob.cookie)).status, 404);
    const privateEvidence = await fetch(`${base}/api/tasks/${id}/evidence`, { headers: { Cookie: alice.cookie } });
    assert.equal(privateEvidence.status, 200);
    assert.equal(privateEvidence.headers.get('content-type'), 'image/png');
    const seeded = await request('/api/demo/seed', { method: 'POST', body: '{}' }, bob.cookie);
    assert.equal(seeded.status, 201);
    assert.equal((await request('/api/tasks', {}, alice.cookie)).body.tasks.length, 1);
    assert.equal((await request('/api/tasks', {}, bob.cookie)).body.tasks.length, 3);
    const payload = { action: 'labeled', issue: { number: 7, title: 'Print poster', body: 'Get a quote first', labels: [{ name: 'fo' }], html_url: 'https://github.com/BlackBeanEagles/fo/issues/7' }, repository: { owner: { login: 'BlackBeanEagles' }, name: 'fo' } };
    const raw = JSON.stringify(payload);
    const signature = 'sha256=' + createHmac('sha256', 'local-test-secret').update(raw).digest('hex');
    const webhookOptions = { method: 'POST', body: raw, headers: { 'x-hub-signature-256': signature, 'x-github-event': 'issues' } };
    assert.equal((await request('/api/github/webhook', webhookOptions)).status, 201);
    assert.equal((await request('/api/github/webhook', webhookOptions)).body.duplicate, true);
    assert.equal((await request('/api/tasks', {}, alice.cookie)).body.tasks.length, 2);
    assert.equal((await request('/api/tasks', {}, bob.cookie)).body.tasks.length, 3);
  } finally {
    child.kill();
    await new Promise(resolve => child.once('exit', resolve));
    const safeRoot = resolve(testRoot) + sep;
    if (resolve(dataDir).startsWith(safeRoot)) await rm(dataDir, { recursive: true, force: true });
  }
});
