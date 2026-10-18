import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHmac, timingSafeEqual, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { join, extname, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTask, applyAction, recordFoExchange, recordFoReply, recordFoFailure } from './workflow.mjs';
import { beginFoConnection, completeFoConnection, connectionStatus, disconnectFo, askFo, getFoReply } from './fo.mjs';
import { foPrompt } from './fo-prompt.mjs';
import { createDemoWorkspace, demoActionFor } from './demo.mjs';
import { dueForFollowUp, recordFollowUpDue } from './followups.mjs';
import { listFoIssues, parseAllowedRepository } from './github-issues.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(root, '.data');
const dataPath = join(dataDir, 'tasks.json');
const usersPath = join(dataDir, 'users.json');
const publicPath = join(root, 'public');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
let tasks = await load();
let users = await loadUsers();
const sessions = new Map();
let saveQueue = Promise.resolve();
let userSaveQueue = Promise.resolve();
let checkingFollowUps = false;
const foInFlight = new Set();
let syncingIssues = false;

function githubOwner() {
  const repository = parseAllowedRepository(process.env.GITHUB_ALLOWED_REPOSITORY);
  const owner = users.find(item => item.username === String(process.env.GITHUB_TASK_OWNER || '').toLowerCase());
  return repository && owner ? { repository, owner } : null;
}

async function syncIssues() {
  const config = githubOwner();
  if (!config) throw new Error('Configure the allowed GitHub repository and a local task owner first.');
  if (syncingIssues) return { imported: 0, busy: true };
  syncingIssues = true;
  try {
    const found = await listFoIssues(config.repository, process.env.GITHUB_TOKEN);
    let imported = 0;
    for (const issue of found) {
      if (tasks.some(task => task.source?.type === 'github' &&
          task.source.owner.toLowerCase() === issue.source.owner.toLowerCase() &&
          task.source.repo.toLowerCase() === issue.source.repo.toLowerCase() &&
          task.source.issue === issue.source.issue)) continue;
      const task = createTask(issue, issue.source);
      task.ownerId = config.owner.id;
      tasks.unshift(task);
      imported++;
    }
    if (imported) await save();
    return { imported, checked: found.length };
  } finally { syncingIssues = false; }
}

async function pollIssues() {
  if (process.env.GITHUB_POLL !== '1' || !githubOwner()) return;
  try { await syncIssues(); }
  catch (error) { console.error('GitHub issue poll failed:', error.message); }
}

async function checkFollowUps() {
  if (checkingFollowUps) return;
  checkingFollowUps = true;
  try {
    let changed = false;
    for (const due of tasks.filter(item => dueForFollowUp(item))) {
      const index = tasks.findIndex(item => item.id === due.id);
      if (index !== -1 && dueForFollowUp(tasks[index])) {
        tasks[index] = recordFollowUpDue(tasks[index]);
        changed = true;
        const task = tasks[index];
        if (task.autoFollowUp && task.mode !== 'demo' && connectionStatus(task.ownerId).connected && !foInFlight.has(task.id)) {
          foInFlight.add(task.id);
          try {
            const prompt = foPrompt(task, 'recover');
            const reply = await askFo(task.ownerId, prompt, task.fo?.externalId);
            const currentIndex = tasks.findIndex(item => item.id === task.id);
            if (currentIndex !== -1) tasks[currentIndex] = recordFoExchange(tasks[currentIndex], { intent: 'recover', prompt, reply });
          } catch (error) {
            const currentIndex = tasks.findIndex(item => item.id === task.id);
            if (currentIndex !== -1) tasks[currentIndex] = recordFoFailure(tasks[currentIndex], error.message);
          } finally { foInFlight.delete(task.id); }
        }
      }
    }
    if (changed) await save();
  } catch (error) { console.error('Follow-up check failed:', error); }
  finally { checkingFollowUps = false; }
}

function save() {
  const snapshot = JSON.stringify(tasks, null, 2);
  saveQueue = saveQueue.then(async () => {
    await mkdir(dirname(dataPath), { recursive: true });
    const temp = dataPath + '.tmp';
    await writeFile(temp, snapshot);
    await rename(temp, dataPath);
  });
  return saveQueue;
}
async function load() {
  try { return JSON.parse(await readFile(dataPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
async function loadUsers() {
  try { return JSON.parse(await readFile(usersPath, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
function saveUsers() {
  const snapshot = JSON.stringify(users, null, 2);
  userSaveQueue = userSaveQueue.then(async () => {
    await mkdir(dirname(usersPath), { recursive: true });
    await writeFile(usersPath + '.tmp', snapshot);
    await rename(usersPath + '.tmp', usersPath);
  });
  return userSaveQueue;
}
function currentUser(req) {
  const cookie = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('pod_session='));
  const token = cookie?.slice('pod_session='.length);
  const userId = token && sessions.get(token);
  return users.find(user => user.id === userId) || null;
}
function setSession(req, res, user) {
  const token = randomBytes(32).toString('base64url');
  sessions.set(token, user.id);
  const secure = req.socket.encrypted ? '; Secure' : '';
  res.setHeader('Set-Cookie', `pod_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure}`);
}
function passwordHash(password, salt) { return scryptSync(password, salt, 64).toString('hex'); }
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function bodyOf(req, maxBytes = 100_000) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);
  return { raw, json: raw.length ? JSON.parse(raw.toString('utf8')) : {} };
}
function validOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
async function syncGitHub(task) {
  const { GITHUB_TOKEN } = process.env;
  if (!GITHUB_TOKEN || process.env.GITHUB_SYNC_COMMENTS !== '1' || task.source?.type !== 'github') return;
  const { owner, repo, issue } = task.source;
  const comment = `**Proof of Done · ${task.status.replaceAll('_', ' ')}**\n\nA private workspace update is available to the task owner. Vendor messages, prices, and receipts stay in the workspace.`;
  try {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issue}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'proof-of-done-hackathon' },
      body: JSON.stringify({ body: comment })
    });
    if (!response.ok) console.error(`GitHub comment failed: ${response.status}`);
    if (response.ok && task.status === 'completed') {
      const closed = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issue}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'proof-of-done-hackathon' },
        body: JSON.stringify({ state: 'closed' })
      });
      if (!closed.ok) console.error(`GitHub issue close failed: ${closed.status}`);
    }
  } catch (error) { console.error(`GitHub comment failed: ${error.message}`); }
}
function verifyGitHub(req, raw) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return false;
  const actual = String(req.headers['x-hub-signature-256'] || '');
  const expected = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
async function serveFile(pathname, res) {
  const file = pathname === '/' ? 'index.html' : pathname.slice(1);
  if (!['index.html', 'app.js', 'style.css', 'workspace-background.png'].includes(file)) return send(res, 404, { error: 'Not found.' });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[extname(file)];
  try {
    const content = await readFile(join(publicPath, file));
    res.writeHead(200, { 'Content-Type': mime + (extname(file) === '.png' ? '' : '; charset=utf-8'), 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  } catch { send(res, 404, { error: 'Not found.' }); }
}

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const path = requestUrl.pathname;
    if (req.method === 'GET' && path === '/api/fo/callback') {
      try {
        if (requestUrl.searchParams.get('error')) throw new Error('Fo authorization was declined.');
        await completeFoConnection(requestUrl.searchParams.get('state'), requestUrl.searchParams.get('code'));
        res.writeHead(303, { Location: '/#fo-connected', 'Cache-Control': 'no-store' });
      } catch (error) {
        res.writeHead(303, { Location: `/#fo-error=${encodeURIComponent(error.message)}`, 'Cache-Control': 'no-store' });
      }
      return res.end();
    }
    if (req.method === 'GET' && path === '/api/auth/session') {
      const user = currentUser(req);
      return send(res, 200, { user: user ? { id: user.id, username: user.username } : null });
    }
    const user = currentUser(req);
    if (req.method === 'GET' && path === '/api/status') return send(res, 200, { mode: 'local-prototype', fo: user ? connectionStatus(user.id) : { connected: false, pending: false, tools: [] }, githubWebhookEnabled: !!process.env.GITHUB_WEBHOOK_SECRET, githubCommentsEnabled: !!process.env.GITHUB_TOKEN && process.env.GITHUB_SYNC_COMMENTS === '1', githubIssueSyncEnabled: !!user && githubOwner()?.owner.id === user.id, githubIssuePollingEnabled: process.env.GITHUB_POLL === '1' && !!githubOwner() });
    if (req.method === 'GET' && path === '/api/tasks') {
      if (!user) return send(res, 401, { error: 'Sign in to see your tasks.' });
      return send(res, 200, { tasks: tasks.filter(task => task.ownerId === user.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) });
    }
    const receiptMatch = path.match(/^\/api\/tasks\/([a-f0-9-]+)\/receipt$/);
    if (req.method === 'GET' && receiptMatch) {
      if (!user) return send(res, 401, { error: 'Sign in to see your receipt.' });
      const task = tasks.find(item => item.id === receiptMatch[1] && item.ownerId === user.id);
      if (!task) return send(res, 404, { error: 'Task not found.' });
      if (task.status !== 'completed' || !task.receipt) return send(res, 409, { error: 'No verified receipt exists yet.' });
      const option = task.options.find(item => item.id === task.approvedOptionId) || null;
      return send(res, 200, { receipt: { taskId: task.id, title: task.title, category: task.category, source: task.source, budget: task.budget, approvedOption: option, booking: task.booking, completion: task.receipt, activity: task.events, mode: task.mode } });
    }
    const evidenceMatch = path.match(/^\/api\/tasks\/([a-f0-9-]+)\/evidence$/);
    if (req.method === 'GET' && evidenceMatch) {
      if (!user) return send(res, 401, { error: 'Sign in to see evidence.' });
      const task = tasks.find(item => item.id === evidenceMatch[1] && item.ownerId === user.id);
      if (!task) return send(res, 404, { error: 'Task not found.' });
      if (!task.receipt?.photoFile) return send(res, 404, { error: 'No photo evidence exists.' });
      const extension = task.receipt.photoFile.endsWith('.png') ? '.png' : '.jpg';
      const content = await readFile(join(dataDir, 'evidence', task.receipt.photoFile));
      res.writeHead(200, { 'Content-Type': extension === '.png' ? 'image/png' : 'image/jpeg', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(content);
    }
    if (req.method === 'GET' && path.startsWith('/api/tasks/')) {
      if (!user) return send(res, 401, { error: 'Sign in to see your tasks.' });
      const task = tasks.find(item => item.id === path.split('/')[3] && item.ownerId === user.id);
      return task ? send(res, 200, { task }) : send(res, 404, { error: 'Task not found.' });
    }
    if (req.method === 'POST') {
      if (!validOrigin(req)) return send(res, 403, { error: 'Invalid origin.' });
      const { raw, json } = await bodyOf(req, path.endsWith('/action') ? 4_000_000 : 100_000);
      if (path === '/api/auth/register') {
        const username = String(json.username || '').trim().toLowerCase();
        const password = String(json.password || '');
        if (!/^[a-z0-9_]{3,32}$/.test(username)) return send(res, 400, { error: 'Username must be 3–32 letters, numbers, or underscores.' });
        if (password.length < 10 || password.length > 200) return send(res, 400, { error: 'Password must be 10–200 characters.' });
        if (users.some(item => item.username === username)) return send(res, 409, { error: 'Username is already taken.' });
        const salt = randomBytes(16).toString('hex');
        const created = { id: randomUUID(), username, salt, hash: passwordHash(password, salt) };
        users.push(created); await saveUsers(); setSession(req, res, created);
        return send(res, 201, { user: { id: created.id, username } });
      }
      if (path === '/api/auth/login') {
        const username = String(json.username || '').trim().toLowerCase();
        if (String(json.password || '').length > 200) return send(res, 401, { error: 'Incorrect username or password.' });
        const found = users.find(item => item.username === username);
        const attempt = passwordHash(String(json.password || ''), found?.salt || '00000000000000000000000000000000');
        if (!found || !timingSafeEqual(Buffer.from(attempt, 'hex'), Buffer.from(found.hash, 'hex'))) return send(res, 401, { error: 'Incorrect username or password.' });
        setSession(req, res, found);
        return send(res, 200, { user: { id: found.id, username } });
      }
      if (path === '/api/auth/logout') {
        const cookie = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('pod_session='));
        if (cookie) sessions.delete(cookie.slice('pod_session='.length));
        res.setHeader('Set-Cookie', 'pod_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        return send(res, 200, { ok: true });
      }
      if (path === '/api/github/webhook') {
        if (!verifyGitHub(req, raw)) return send(res, 401, { error: 'Invalid webhook signature.' });
        if (req.headers['x-github-event'] !== 'issues' || !['opened', 'labeled'].includes(json.action) || !json.issue?.labels?.some(label => label.name?.toLowerCase() === 'fo')) return send(res, 200, { ignored: true });
        const owner = json.repository?.owner?.login, repo = json.repository?.name, issue = json.issue?.number;
        if (!owner || !repo || !Number.isInteger(issue)) return send(res, 400, { error: 'Invalid issue payload.' });
        if (`${owner}/${repo}`.toLowerCase() !== String(process.env.GITHUB_ALLOWED_REPOSITORY || '').toLowerCase()) return send(res, 403, { error: 'Repository is not allowed.' });
        if (tasks.some(item => item.source?.type === 'github' && item.source.owner === owner && item.source.repo === repo && item.source.issue === issue)) return send(res, 200, { duplicate: true });
        const mappedUser = users.find(item => item.username === String(process.env.GITHUB_TASK_OWNER || '').toLowerCase());
        if (!mappedUser) return send(res, 409, { error: 'GitHub task owner is not configured.' });
        const task = createTask({ title: json.issue.title, description: json.issue.body }, { type: 'github', owner, repo, issue, url: json.issue.html_url });
        task.ownerId = mappedUser.id;
        tasks.unshift(task); await save();
        void syncGitHub(task);
        return send(res, 201, { task });
      }
      if (!user) return send(res, 401, { error: 'Sign in to manage tasks.' });
      if (path === '/api/github/sync') {
        if (githubOwner()?.owner.id !== user.id) return send(res, 403, { error: 'GitHub sync belongs to another workspace account.' });
        const result = await syncIssues();
        return send(res, 200, result);
      }
      if (path === '/api/fo/connect') {
        const requestOrigin = new URL(`http://${req.headers.host}`);
        if (!['127.0.0.1', 'localhost'].includes(requestOrigin.hostname) || requestOrigin.port !== String(port)) return send(res, 400, { error: 'Fo OAuth requires this local 127.0.0.1 or localhost preview.' });
        const callback = new URL('/api/fo/callback', requestOrigin);
        const authorizationUrl = await beginFoConnection(user.id, callback);
        return send(res, 200, { authorizationUrl });
      }
      if (path === '/api/fo/disconnect') {
        disconnectFo(user.id);
        return send(res, 200, { ok: true });
      }
      if (path === '/api/tasks') {
        const task = createTask(json);
        task.ownerId = user.id;
        tasks.unshift(task); await save();
        return send(res, 201, { task });
      }
      if (path === '/api/demo/seed') {
        const existing = tasks.filter(item => item.source?.type === 'demo' && item.ownerId === user.id);
        if (existing.length) return send(res, 200, { tasks: existing, existing: true });
        const seeded = createDemoWorkspace();
        seeded.forEach(task => { task.ownerId = user.id; });
        tasks.unshift(...seeded); await save();
        return send(res, 201, { tasks: seeded });
      }
      const foMatch = path.match(/^\/api\/tasks\/([a-f0-9-]+)\/fo\/(ask|reply)$/);
      if (foMatch) {
        const id = foMatch[1];
        const index = tasks.findIndex(item => item.id === id && item.ownerId === user.id);
        if (index === -1) return send(res, 404, { error: 'Task not found.' });
        if (!connectionStatus(user.id).connected) return send(res, 409, { error: 'Connect your Fo account first.' });
        if (foInFlight.has(id)) return send(res, 409, { error: 'Fo is already working on this task.' });
        foInFlight.add(id);
        try {
          const task = tasks[index];
          let updated;
          if (foMatch[2] === 'reply') {
            const reply = await getFoReply(user.id, task.fo?.externalId);
            updated = recordFoReply(tasks.find(item => item.id === id), reply);
          } else {
            const intent = String(json.intent || 'research');
            if (!['research', 'recover', 'book', 'message'].includes(intent) || json.authorized !== true) return send(res, 400, { error: 'Choose and authorize the Fo action.' });
            if (task.mode === 'demo' || ['completed', 'cancelled'].includes(task.status)) return send(res, 409, { error: 'Fo needs an open real task.' });
            if (task.fo?.status === 'working' && intent !== 'message') return send(res, 409, { error: 'Fo is still working. Check the existing reply before sending another request.' });
            const selected = task.options.find(item => item.id === task.approvedOptionId);
            if (intent === 'book' && (task.status !== 'approved' || !selected)) return send(res, 409, { error: 'Approve a specific option before asking Fo to book.' });
            if (intent === 'message' && !task.fo?.externalId) return send(res, 409, { error: 'Start a Fo conversation for this task first.' });
            const message = String(json.message || '').trim();
            if (intent === 'message' && (!message || message.length > 2000)) return send(res, 400, { error: 'Write a reply to Fo under 2,000 characters.' });
            const prompt = intent === 'message'
              ? `${message}\n\nContinue only this task. This free-form reply does not authorize booking, purchase, deposits, or payment. Ask for approval through the task workflow before any such action.`
              : foPrompt(task, intent, selected);
            const reply = await askFo(user.id, prompt, task.fo?.externalId);
            updated = recordFoExchange(tasks.find(item => item.id === id), { intent, prompt, reply });
          }
          const currentIndex = tasks.findIndex(item => item.id === id && item.ownerId === user.id);
          if (currentIndex === -1) return send(res, 404, { error: 'Task not found.' });
          tasks[currentIndex] = updated;
          await save();
          if (foMatch[2] === 'ask' || updated !== task) void syncGitHub(updated);
          return send(res, 200, { task: updated });
        } finally { foInFlight.delete(id); }
      }
      const match = path.match(/^\/api\/tasks\/([a-f0-9-]+)\/(action|demo-next)$/);
      if (match) {
        const index = tasks.findIndex(item => item.id === match[1] && item.ownerId === user.id);
        if (index === -1) return send(res, 404, { error: 'Task not found.' });
        let action = { ...json, actor: user.username, mode: tasks[index].mode === 'demo' ? 'demo' : 'manual' };
        if (match[2] === 'demo-next') {
          action = demoActionFor(tasks[index]);
          if (!action) return send(res, 400, { error: 'Approve an option or verify the outcome to continue.' });
        }
        if (action.type === 'schedule_followup' && action.autoFollowUp === true && (tasks[index].mode === 'demo' || !connectionStatus(user.id).connected)) return send(res, 409, { error: 'Connect Fo and use a real task before scheduling an automatic follow-up.' });
        const task = applyAction(tasks[index], action);
        if (action.type === 'complete' && json.photoData) {
          const match = String(json.photoData).match(/^data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)$/);
          if (!match) return send(res, 400, { error: 'Use a JPEG or PNG evidence photo.' });
          const bytes = Buffer.from(match[2], 'base64');
          if (bytes.length > 2_000_000 || bytes.length < 8) return send(res, 400, { error: 'Evidence photo must be under 2 MB.' });
          const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.subarray(0, 3).equals(Buffer.from([255,216,255]));
          if (!valid) return send(res, 400, { error: 'Evidence photo format is invalid.' });
          const photoFile = `${task.id}-${randomUUID()}.${match[1] === 'png' ? 'png' : 'jpg'}`;
          await mkdir(join(dataDir, 'evidence'), { recursive: true });
          await writeFile(join(dataDir, 'evidence', photoFile), bytes);
          task.receipt.photoFile = photoFile;
        }
        if (action.mode === 'demo') task.mode = 'demo';
        tasks[index] = task; await save();
        if (action.mode !== 'demo') void syncGitHub(task);
        return send(res, 200, { task });
      }
    }
    if (req.method === 'GET') return serveFile(path, res);
    send(res, 404, { error: 'Not found.' });
  } catch (error) {
    const client = error instanceof SyntaxError || /required|valid|budget|closed|Cannot|Unknown|exceeds|large/.test(error.message);
    send(res, client ? 400 : 500, { error: client ? error.message : 'Server error.' });
    if (!client) console.error(error);
  }
});

server.listen(port, host, () => console.log(`Proof of Done running at http://${host}:${port}`));
setInterval(checkFollowUps, 10_000).unref();
void checkFollowUps();
setInterval(pollIssues, 120_000).unref();
void pollIssues();
