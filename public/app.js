const $ = selector => document.querySelector(selector);
const state = { tasks: [], selectedId: null, filter: 'all', search: '', action: null, foIntent: null, user: null, authMode: 'register', foConnected: false, githubCommentsEnabled: false, runs: { runs: 0, verified: 0, inProgress: 0 }, foSeen: {}, judgeTaskId: null, judgeSlide: 0 };
const statusNames = { new: 'New', working: 'In progress', awaiting_approval: 'Needs approval', approved: 'Approved', booked: 'Booked', completed: 'Verified done', blocked: 'Blocked', cancelled: 'Cancelled' };
const categoryNames = { repair: 'Repair', event: 'Event', purchase: 'Purchase', other: 'Task' };
const categoryIcons = { repair: '🔧', event: '🥗', purchase: '🛒', other: '✳' };
const templates = {
  quote: { title: 'Get one verified print quote', description: 'Ask relevant print shops for the itemized total, tax, pickup location, and earliest pickup time for one A3 color poster. Add the real city and deadline before sending. Request quotes only; do not order or pay.', doneWhen: 'A real shop sends an itemized quote and pickup time, and I check the reply.', budget: 40, category: 'other' },
  poster: { title: 'Print and collect a hackathon poster', description: 'Find a nearby print shop that can print one color A3 poster today. Ask for a quote and pickup time. Do not order until I approve. Add my city and print file details before sending.', doneWhen: 'A person has the printed poster and records a photo or receipt.', budget: 40, category: 'other' },
  repair: { title: 'Get the office projector repaired', description: 'Find someone available this week. Ask before booking.', doneWhen: 'A teammate tests the projector and confirms it displays correctly.', budget: 180 },
  event: { title: 'Arrange team lunch for 12', description: 'Collect dietary needs, compare catering options, and deliver by noon. Ask before ordering.', doneWhen: 'The lunch arrives for all 12 people and the order receipt is saved.', budget: 250 },
  purchase: { title: 'Restock the office fridge', description: 'Water, sparkling drinks, fruit, and snacks. Ask before purchase.', doneWhen: 'The requested items arrive and someone checks the delivery against the order.', budget: 90 }
};

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (response.status === 401 && !path.startsWith('/api/auth/')) showAuth();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function showAuth() {
  state.user = null; state.tasks = []; state.selectedId = null; state.filter = 'all'; state.search = ''; state.foConnected = false; state.foSeen = {}; state.judgeTaskId = null;
  $('#taskSearch').value = '';
  $('#appShell').hidden = true; $('#authScreen').hidden = false;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  setFilter('all');
}
function showApp(user) {
  state.user = user; state.tasks = []; state.selectedId = null;
  try { state.foSeen = JSON.parse(localStorage.getItem(`proof-of-done:fo-seen:${user.id}`) || '{}') || {}; }
  catch { state.foSeen = {}; }
  $('#accountName').textContent = user.username;
  $('#accountAvatar').textContent = user.username.slice(0, 1).toUpperCase();
  render();
  $('#authScreen').hidden = true; $('#appShell').hidden = false;
}
function setAuthMode(mode) {
  state.authMode = mode;
  const register = mode === 'register';
  $('#authTitle').textContent = register ? 'Create your account' : 'Welcome back';
  $('#authDescription').textContent = register ? 'Your tasks and receipts are visible only when you sign in.' : 'Sign in to continue with your private workspace.';
  $('#authSubmit').textContent = register ? 'Create workspace ↗' : 'Sign in ↗';
  $('#authSwitchText').textContent = register ? 'Already have an account?' : 'New to Proof of Done?';
  $('#authToggle').textContent = register ? 'Sign in' : 'Create an account';
  $('#authForm').elements.password.autocomplete = register ? 'new-password' : 'current-password';
  $('#authForm').reset();
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = value => value == null ? 'No limit set' : '$' + Number(value).toFixed(2);
const niceDate = value => value ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const isDue = task => task.nextFollowUp && !['completed', 'cancelled'].includes(task.status) && new Date(task.nextFollowUp).getTime() <= Date.now();
const needsAttention = task => ['awaiting_approval', 'blocked'].includes(task.status) || isDue(task);
const statusName = status => statusNames[status] || status;
function foMessageKind(value) {
  const message = String(value ?? '').trim();
  if (!message) return 'empty';
  if (/^The run finished without a textual reply\.?$/i.test(message)) return 'empty';
  if (/^Fo is still working on this\. Call get_fo_reply now;/i.test(message)) return 'waiting';
  return 'result';
}
const shortText = (value, max = 190) => String(value ?? '').trim().slice(0, max) + (String(value ?? '').trim().length > max ? '…' : '');
const newest = (items, key = 'at') => [...items].sort((a, b) => new Date(b[key] || 0) - new Date(a[key] || 0));
function featuredTaskFor(tasks) {
  const live = tasks.filter(task => task.mode !== 'demo');
  return newest(live.length ? live : tasks, 'updatedAt')[0] || null;
}
const latestFoEvent = task => newest((task.events || []).filter(event => event.kind === 'fo_web_import' || event.kind === 'fo_reply' && event.mode === 'live'))[0] || null;
const latestFoText = task => task.fo?.webReply && new Date(task.fo.webReply.importedAt) > new Date(task.fo?.lastSyncedAt || 0) ? task.fo.webReply.text : task.fo?.lastResponse;
const foConversationUrl = task => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(task.fo?.externalId || '') ? `https://wajo.ai/fo/c/${encodeURIComponent(task.fo.externalId)}` : null;
const githubIssueUrl = task => task.source?.type === 'github' && /^[\w.-]+$/.test(task.source.owner || '') && /^[\w.-]+$/.test(task.source.repo || '') && Number.isInteger(task.source.issue) ? `https://github.com/${encodeURIComponent(task.source.owner)}/${encodeURIComponent(task.source.repo)}/issues/${task.source.issue}` : null;
const providerReplyEvents = task => (task.events || []).filter(event => event.kind === 'message' && event.direction === 'inbound');
const humanVerified = task => task.mode !== 'demo' && task.status === 'completed' && task.receipt?.verifiedByHuman === true;
const realFoRun = task => task.mode !== 'demo' && (task.events || []).some(event => event.kind === 'fo_request' && event.mode === 'live');
function saveFoSeen(task, event) {
  if (!state.user || !event) return;
  state.foSeen[task.id] = event.id;
  try { localStorage.setItem(`proof-of-done:fo-seen:${state.user.id}`, JSON.stringify(state.foSeen)); }
  catch { /* This device may block local storage. */ }
}
function proofMarkup(task, presentation = false) {
  const latestReport = newest((task.events || []).filter(event => event.kind === 'fo_web_import' || event.kind === 'fo_reply' && event.mode === 'live' && foMessageKind(event.text) === 'result'))[0];
  const provider = newest(providerReplyEvents(task))[0];
  const verified = humanVerified(task);
  const simulated = task.mode === 'demo';
  const photo = task.receipt?.photoFile && !simulated ? `<img class="evidence-photo" src="/api/tasks/${esc(task.id)}/evidence" alt="Private photo or receipt for ${esc(task.title)}">` : '<div class="evidence-photo-empty">◇<span>No photo or receipt attached yet</span></div>';
  return `<div class="evidence-panel ${presentation ? 'evidence-presentation' : ''} ${!verified && !task.receipt?.photoFile ? 'evidence-compact' : ''}"><div class="evidence-heading"><div><span class="eyebrow">THE RECEIPT</span><h3>Proof, separated by source</h3></div>${simulated ? '<span class="demo-chip">SIMULATED</span>' : verified ? '<span class="evidence-verified">✓ Human verified</span>' : '<span class="evidence-open">Outcome still open</span>'}</div><div class="evidence-grid"><div class="evidence-source"><span>01 · FO REPORTED</span><strong>${simulated ? 'Sample only' : latestReport ? latestReport.kind === 'fo_web_import' ? 'Owner-imported Wajo reply' : 'Live Fo MCP update' : 'No usable report yet'}</strong><p>${simulated ? 'This scenario uses generated steps, not Fo MCP.' : latestReport ? esc(shortText(latestReport.text, 145)) : 'A completed Fo run does not establish a provider response.'}</p></div><div class="evidence-source"><span>02 · PROVIDER CONFIRMED</span><strong>${simulated ? 'Simulated provider' : provider ? 'Owner-logged reply' : 'No provider reply logged'}</strong><p>${simulated ? 'No real person was contacted.' : provider ? `Logged ${niceDate(provider.at)}; check the original message before presenting it as confirmed.` : 'Wait for an actual response and record its source.'}</p></div><div class="evidence-source"><span>03 · HUMAN VERIFIED</span><strong>${verified ? 'Outcome checked' : 'Not verified'}</strong><p>${verified ? esc(shortText(task.receipt.evidence, 145)) : 'Close only after a person checks the real result.'}</p></div></div><div class="evidence-receipt">${photo}<div><small>COMPLETION EVIDENCE</small><strong>${verified ? 'Verified result' : simulated ? 'Sample outcome' : 'Awaiting a real receipt'}</strong><p>${task.receipt?.evidence ? esc(task.receipt.evidence) : 'A photo, receipt, or concise human check will appear here after verification.'}</p>${task.receipt?.at ? `<span>Recorded ${niceDate(task.receipt.at)}</span>` : ''}</div></div></div>`;
}
function journeyMarkup(task) {
  const requested = (task.events || []).some(event => event.kind === 'created');
  const fo = realFoRun(task) || task.mode === 'demo' && (task.events || []).some(event => event.kind === 'start');
  const provider = providerReplyEvents(task).length > 0;
  const approved = !!task.approvedOptionId;
  const verified = humanVerified(task);
  const steps = [
    ['Request', requested, 'Task created'],
    ['Fo action', fo, task.mode === 'demo' ? 'Simulated step' : fo ? 'Live MCP request' : 'Not sent'],
    ['Provider reply', provider, provider ? task.mode === 'demo' ? 'Simulated reply' : 'Owner logged' : 'Not confirmed'],
    ['Approval', approved, approved ? 'Choice recorded' : 'Not granted'],
    ['Proof', verified, verified ? 'Human checked' : 'Still open']
  ];
  return `<div class="featured-journey" aria-label="Task journey">${steps.map(([name, done, detail], index) => `<div class="journey-step ${done ? 'done' : 'pending'}"><span>${done ? '✓' : String(index + 1).padStart(2, '0')}</span><strong>${name}</strong><small>${detail}</small></div>`).join('')}</div>`;
}
function nextSafeAction(task) {
  if (humanVerified(task)) return 'The result is verified. Review the proof and export the packet.';
  if (task.status === 'booked') return 'Wait for the real result, then record a receipt and human check.';
  if (task.status === 'approved') return 'Arrange only the approved option; confirm any change before booking.';
  if (task.status === 'blocked') return 'Review the setback, then choose a permitted recovery step.';
  if (task.status === 'awaiting_approval') return 'Compare the source, price, and timing before choosing an option.';
  if (task.fo?.status === 'working') return 'Fo is still working. Check for an update before another request.';
  if (task.fo?.webReply && !providerReplyEvents(task).length) return 'Review the imported Wajo reply, answer missing details, and wait for a real provider response.';
  if (foMessageKind(task.fo?.lastResponse) === 'empty' && task.fo?.lastResponse) return 'Open the original Fo conversation, answer any missing details, then reply.';
  if (task.fo?.externalId && !providerReplyEvents(task).length) return 'Fo has a conversation open. Check for a provider reply or clarify the brief.';
  if (task.mode === 'demo') return 'This is a sample. Create a live task to show real Fo work.';
  return 'Define the result, review the scope, then ask Fo to find options.';
}
function renderCommandDeck(tasks) {
  const task = featuredTaskFor(tasks);
  const quickActions = task?.fo?.externalId && task.mode !== 'demo'
    ? `<div class="featured-quick"><span class="status ${esc(task.status)}">${statusName(task.status)}</span><button type="button" data-feature-reply="${esc(task.id)}">Reply to Fo</button><button type="button" data-feature-check="${esc(task.id)}">Check for update</button><button type="button" data-feature-import="${esc(task.id)}">Import web reply</button></div>`
    : task ? `<span class="status ${esc(task.status)}">${statusName(task.status)}</span>` : '';
  $('#featuredTask').innerHTML = task ? `<div class="featured-top"><div><span class="eyebrow">${task.mode === 'demo' ? 'SAMPLE SCENARIO' : 'LATEST LIVE TASK'} · ${esc(categoryNames[task.category] || 'TASK')}</span><h2>${esc(task.title)}</h2><p>${esc(shortText(task.description, 220) || 'No brief entered yet.')}</p></div>${quickActions}</div>${journeyMarkup(task)}<div class="featured-next"><span>THE NEXT SAFE MOVE</span><strong>${esc(nextSafeAction(task))}</strong></div>${proofMarkup(task)}<div class="featured-actions"><button type="button" class="primary" data-feature-open="${esc(task.id)}">Open task details ↗</button><button type="button" class="secondary" data-judge-open="${esc(task.id)}">▶ Present this run</button></div>` : `<div class="featured-empty"><span class="eyebrow">YOUR NEXT REAL-WORLD RESULT</span><h2>Start with one task that can finish.</h2><p>Write what needs doing, set a clear success check, then approve exactly what Fo may do.</p><button class="primary" type="button" data-new-feature>＋ Create a task</button></div>`;
  const entries = tasks.filter(task => task.mode !== 'demo').map(task => ({ task, event: latestFoEvent(task) })).filter(item => item.event).sort((a, b) => new Date(b.event.at) - new Date(a.event.at));
  const unread = entries.filter(({ task, event }) => state.foSeen[task.id] !== event.id).length;
  const cards = entries.slice(0, 3).map(({ task, event }) => {
    const kind = event.kind === 'fo_web_import' ? 'result' : foMessageKind(event.text);
    const summary = kind === 'empty' ? 'MCP returned no text. Open the original Fo conversation for context.' : kind === 'waiting' ? 'Fo is still working. No provider result yet.' : shortText(event.text, 170);
    const isUnread = state.foSeen[task.id] !== event.id;
    return `<article class="inbox-item ${isUnread ? 'unread' : ''}"><div class="inbox-item-head"><strong>${esc(task.title)}</strong>${isUnread ? '<span class="unread-dot" aria-label="Unread reply">NEW</span>' : ''}</div><small>${niceDate(event.at)} · ${event.kind === 'fo_web_import' ? 'Owner-imported Wajo web reply' : kind === 'result' ? 'Fo MCP' : 'Fo MCP status'}</small><p>${esc(summary)}</p><div class="inbox-item-actions"><button type="button" data-inbox-open="${esc(task.id)}">View</button>${task.fo?.externalId ? `<button type="button" data-inbox-reply="${esc(task.id)}">Reply</button><button type="button" data-inbox-check="${esc(task.id)}">Check for update</button><button type="button" data-feature-import="${esc(task.id)}">Import web reply</button>` : ''}${foConversationUrl(task) ? `<a href="${foConversationUrl(task)}" target="_blank" rel="noopener noreferrer">Open Fo ↗</a>` : ''}</div></article>`;
  }).join('');
  const waiting = tasks.find(task => task.mode !== 'demo' && task.fo?.externalId);
  $('#foInbox').innerHTML = `<div class="inbox-heading"><div><span class="eyebrow">LIVE FO CONVERSATIONS</span><h2>Fo reply inbox</h2></div>${unread ? `<span class="inbox-unread">${unread} unread</span>` : '<span class="inbox-clear">All caught up</span>'}</div>${cards || `<div class="inbox-empty"><span>✳</span><strong>${waiting ? 'Fo is waiting for a result' : 'No Fo replies yet'}</strong><p>${waiting ? 'Check the existing conversation for an update.' : 'Send a scoped live task to Fo; its update will appear here.'}</p>${waiting ? `<button type="button" class="secondary" data-inbox-check="${esc(waiting.id)}">Check for update ↗</button>` : ''}</div>`}`;
}
function renderJudge() {
  const task = state.tasks.find(item => item.id === state.judgeTaskId);
  if (!task) { $('#judgeDialog').close(); return; }
  const simulated = task.mode === 'demo';
  const foEvent = latestFoEvent(task);
  const foKind = foEvent?.kind === 'fo_web_import' ? 'result' : foMessageKind(foEvent?.text);
  const setbacks = newest((task.events || []).filter(event => ['block', 'fo_error'].includes(event.kind)));
  const gapEvent = newest((task.events || []).filter(event => event.kind === 'fo_reply' && foMessageKind(event.text) === 'empty'))[0];
  const setbackAt = setbacks[0]?.at || gapEvent?.at || null;
  const recovery = newest((task.events || []).filter(event => setbackAt && event.at > setbackAt && (event.intent === 'recover' || ['followup', 'edit', 'fo_web_import'].includes(event.kind))));
  const approval = task.options.find(option => option.id === task.approvedOptionId);
  const calls = task.mcpCalls || [];
  const slides = [
    `<div class="judge-slide"><div class="judge-kicker">01 / THE MISSION</div><h3>${esc(task.title)}</h3><p class="judge-lead">${esc(task.description || 'No details provided yet.')}</p><div class="judge-facts"><div><small>OUTCOME CONTRACT</small><strong>${esc(task.doneWhen || 'Not defined yet')}</strong></div><div><small>BUDGET</small><strong>${money(task.budget)}</strong></div><div><small>STATUS</small><strong>${statusName(task.status)}</strong></div></div>${journeyMarkup(task)}</div>`,
    `<div class="judge-slide"><div class="judge-kicker">02 / FO ACTION</div><h3>${simulated ? 'A sample Fo step' : realFoRun(task) ? 'A real MCP request was sent' : 'Fo has not been called yet'}</h3><p class="judge-lead">${simulated ? 'This sequence is simulated and never contacted a provider.' : foEvent ? foKind === 'result' ? esc(shortText(foEvent.text, 700)) : foKind === 'empty' ? 'MCP returned no textual reply. The original Fo conversation may contain details; no provider result is established here.' : 'Fo reported that it was still working. No provider reply is established here.' : 'Send a scoped request to Fo after the owner reviews the action.'}</p><div class="judge-trace-card"><span>WHAT THE APP CAN VERIFY</span><strong>${simulated ? 'No Fo MCP call' : `${calls.filter(call => call.tool === 'ask_fo').length || (realFoRun(task) ? 1 : 0)} app-visible ask_fo request(s)`}</strong><small>${foEvent ? `${foEvent.kind === 'fo_web_import' ? 'Owner-imported Wajo web reply' : 'App-visible Fo MCP response'}: ${niceDate(foEvent.at)}` : 'No app-visible Fo response yet'}</small></div></div>`,
    `<div class="judge-slide"><div class="judge-kicker">03 / SETBACK & RECOVERY</div><h3>Keep the issue open when reality pushes back.</h3><div class="judge-two"><div class="judge-story"><span>SETBACK ON RECORD</span><strong>${setbacks[0] ? esc(shortText(setbacks[0].text, 220)) : gapEvent ? 'MCP reply gap' : 'No setback recorded'}</strong><p>${setbacks[0] ? `Recorded ${niceDate(setbacks[0].at)}` : gapEvent ? 'MCP returned no text; the original Fo conversation needs separate review.' : 'This run has no logged vendor refusal, missed slot, or tool failure.'}</p></div><div class="judge-story"><span>RECOVERY ON RECORD</span><strong>${recovery[0] ? recovery[0].kind === 'fo_web_import' ? 'Owner imported the Wajo web reply' : esc(shortText(recovery[0].text, 220)) : 'No recovery attempted yet'}</strong><p>${recovery[0] ? `${recovery[0].kind === 'fo_web_import' ? 'This repairs the app evidence gap; it does not prove vendor outreach.' : 'Next permitted step'} · ${niceDate(recovery[0].at)}` : 'The next action needs a real update or an owner-approved change of plan.'}</p></div></div><div class="judge-story judge-decision"><span>OWNER DECISION</span><strong>${approval ? `${esc(approval.vendor)} · ${money(approval.price)}` : 'No option approved'}</strong><p>${approval ? 'Approval records permission for one option; booking and payment are separate.' : 'No money or booking was authorized by this task.'}</p></div></div>`,
    `<div class="judge-slide"><div class="judge-kicker">04 / EVIDENCE</div><h3>What can we actually prove?</h3>${proofMarkup(task, true)}</div>`,
    `<div class="judge-slide"><div class="judge-kicker">05 / RUN TRACE & OUTCOME</div><h3>${humanVerified(task) ? 'The result was human verified.' : 'The real-world outcome is still open.'}</h3><p class="judge-lead">${simulated ? 'This is a sample scenario. Its steps are not a real Fo run.' : `The app logged ${calls.length} MCP call${calls.length === 1 ? '' : 's'}. Fo’s internal phone and email tool calls are not exposed to this app.`}</p><div class="judge-call-list">${calls.length ? calls.map(call => `<div><span>${esc(call.tool)}</span><strong>${esc(call.resultStatus || 'unknown')}</strong><small>${niceDate(call.startedAt)} · ${Math.round(call.durationMs || 0)} ms</small></div>`).join('') : '<div><strong>No exact MCP calls logged for this task.</strong><small>Earlier events may have a partial trace.</small></div>'}</div>${!simulated && realFoRun(task) ? `<button type="button" class="primary" data-judge-trace="${esc(task.id)}">↓ Export redacted trace</button>` : ''}<p class="judge-caveat">Trace export omits Fo’s internal tools and masks contact patterns. Review it before sharing.</p></div>`
  ];
  state.judgeSlide = Math.max(0, Math.min(state.judgeSlide, slides.length - 1));
  $('#judgeTitle').textContent = task.title;
  $('#judgeModeBadge').innerHTML = simulated ? '<span class="demo-chip">SIMULATED SAMPLE</span>' : `<span class="judge-live">${realFoRun(task) ? 'LIVE MCP RUN' : 'LIVE TASK · NO RUN YET'}</span>`;
  $('#judgeContent').innerHTML = slides[state.judgeSlide];
  $('#judgeCounter').textContent = `${state.judgeSlide + 1} / ${slides.length}`;
  $('#judgeDots').innerHTML = slides.map((_, index) => `<button type="button" aria-label="Show step ${index + 1}" data-judge-slide="${index}" class="${index === state.judgeSlide ? 'active' : ''}"></button>`).join('');
  $('#judgePrevious').disabled = state.judgeSlide === 0;
  $('#judgeNext').textContent = state.judgeSlide === slides.length - 1 ? 'Close walkthrough' : 'Next →';
}
function openJudge(taskId) {
  if (!state.tasks.some(task => task.id === taskId)) return;
  state.judgeTaskId = taskId; state.judgeSlide = 0;
  $('#judgeDialog').showModal(); renderJudge();
}
function timelineMessage(event) {
  const raw = String(event.text ?? '');
  const kind = event.kind === 'fo_reply' ? foMessageKind(raw) : 'result';
  const summary = event.kind === 'fo_request' ? 'Brief sent to Fo with the owner’s limits.' : kind === 'empty' ? 'Fo run ended without a usable reply. No provider result is confirmed.' : kind === 'waiting' ? 'Fo was still working when checked. No provider result yet.' : raw;
  const original = summary !== raw ? `<details class="timeline-original"><summary>View original ${event.kind === 'fo_request' ? 'brief' : 'Fo message'}</summary><p>${esc(raw)}</p></details>` : '';
  return `<li><div class="timeline-dot"></div><div><p>${esc(summary)} ${event.mode === 'demo' ? '<span class="demo-chip">SIMULATED</span>' : event.kind === 'fo_web_import' ? '<span class="source-chip">OWNER-IMPORTED WAJO WEB REPLY</span>' : ''}</p><small>${event.channel ? `<span class="channel-chip ${esc(event.channel)}">${esc(event.channel.toUpperCase())}</span> ` : ''}${esc(event.actor)} · ${niceDate(event.at)}${event.observedAt ? ` · observed ${niceDate(event.observedAt)}` : ''}</small>${original}</div></li>`;
}
let toastTimer;
function toast(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = 'show' + (error ? ' error' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = '', 3500);
}
async function refresh() {
  const accountId = state.user?.id;
  const [{ tasks }, status] = await Promise.all([api('/api/tasks'), api('/api/status')]);
  if (!state.user || state.user.id !== accountId) return;
  state.tasks = tasks;
  state.foConnected = !!status.fo?.connected;
  state.githubCommentsEnabled = !!status.githubCommentsEnabled;
  state.runs = status.runs || { runs: 0, verified: 0, inProgress: 0 };
  $('#syncGitHub').hidden = !status.githubIssueSyncEnabled;
  renderFoConnection();
  if (!tasks.some(t => t.id === state.selectedId)) state.selectedId = featuredTaskFor(tasks)?.id || null;
  render();
}
function renderFoConnection() {
  $('#foConnectionTitle').textContent = state.foConnected ? 'Fo is connected' : 'Connect your Fo account';
  $('#foConnectionText').textContent = state.foConnected ? 'Live Fo requests are ready. This workspace connection is encrypted locally and unlocks when you sign in after a restart.' : 'Authorize your Wajo account to send a real task through Fo MCP.';
  $('#connectFo').hidden = state.foConnected;
  $('#disconnectFo').hidden = !state.foConnected;
  $('#connectFoInline').hidden = state.foConnected;
  $('#disconnectFoInline').hidden = !state.foConnected;
  $('#foInlineStatus').textContent = state.foConnected ? 'Fo connected · live actions ready' : 'Fo is not connected · demo steps are simulated';
  $('#modeDisclosure').innerHTML = `<strong>${state.foConnected ? 'Fo connected' : 'Fo disconnected'}:</strong> ${state.runs.runs} logged real run${state.runs.runs === 1 ? '' : 's'} · ${state.runs.verified} human-verified outcome${state.runs.verified === 1 ? '' : 's'}. Sample scenarios are simulated; booking and completion require proof.`;
}
function setFilter(filter) {
  state.filter = filter;
  document.querySelectorAll('[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === filter));
  document.querySelectorAll('[data-nav]').forEach(button => button.classList.toggle('active', button.dataset.nav === filter));
  render();
}
function render() {
  const tasks = state.tasks;
  const approval = tasks.filter(t => t.status === 'awaiting_approval');
  const attention = tasks.filter(needsAttention);
  $('#openCount').textContent = tasks.filter(t => !['completed', 'cancelled'].includes(t.status)).length;
  $('#approvalCount').textContent = approval.length;
  $('#attentionCount').textContent = attention.length;
  $('#doneCount').textContent = tasks.filter(t => t.mode !== 'demo' && t.status === 'completed' && t.receipt?.verifiedByHuman === true).length;
  const metricHints = document.querySelectorAll('.metrics .metric > small');
  metricHints[0].textContent = tasks.some(t => !['completed', 'cancelled'].includes(t.status)) ? 'In motion right now' : 'Create a task to start real work';
  metricHints[1].textContent = approval.length ? 'Quotes awaiting your choice' : 'No spending decision pending';
  metricHints[2].textContent = attention.length ? 'Review these next steps' : 'Nothing urgent is waiting';
  metricHints[3].textContent = tasks.some(humanVerified) ? 'With evidence attached' : 'Proof appears after a human check';
  $('#sideApprovalCount').textContent = approval.length;
  $('#sideAttentionCount').textContent = attention.length;
  $('#taskCount').textContent = tasks.length;
  renderCommandDeck(tasks);
  renderShowcase(tasks);
  renderAttention(attention);
  renderList(tasks);
  const selected = tasks.find(t => t.id === state.selectedId);
  renderDetail(selected);
  renderConversations(selected);
  if ($('#judgeDialog').open) renderJudge();
}
function showcaseCounts(tasks) {
  const live = tasks.filter(task => task.mode !== 'demo');
  return {
    runs: state.runs.runs || 0,
    replies: live.reduce((total, task) => total + task.events.filter(event => event.kind === 'message' && event.direction === 'inbound').length, 0),
    approvals: live.filter(task => !!task.approvedOptionId).length,
    verified: live.filter(task => task.status === 'completed' && task.receipt?.verifiedByHuman === true).length
  };
}
function renderShowcase(tasks) {
  const counts = showcaseCounts(tasks);
  $('#showcaseRuns').textContent = counts.runs;
  $('#showcaseReplies').textContent = counts.replies;
  $('#showcaseApprovals').textContent = counts.approvals;
  $('#showcaseVerified').textContent = counts.verified;
}
function renderAttention(items) {
  $('#attentionSection').hidden = items.length === 0;
  $('#attentionCards').innerHTML = items.slice(0, 3).map(t => {
    const reason = t.status === 'awaiting_approval' ? 'Decision needed' : t.status === 'blocked' ? 'Blocked' : 'Follow-up due';
    const hint = t.status === 'awaiting_approval' ? `${t.options.length} option${t.options.length === 1 ? '' : 's'} to review` : t.status === 'blocked' ? 'Needs a new path' : 'Time to check back';
    return `<button class="attention-card" type="button" data-select="${esc(t.id)}"><span class="attention-icon ${esc(t.status)}">${t.status === 'awaiting_approval' ? '◇' : t.status === 'blocked' ? '!' : '↗'}</span><span class="attention-copy"><small>${reason}</small><strong>${esc(t.title)}</strong><em>${esc(hint)}</em></span><span class="attention-arrow">↗</span></button>`;
  }).join('');
}
function visibleTasks(tasks) {
  return tasks.filter(t => {
    const match = state.filter === 'all' || (state.filter === 'active' && !['completed', 'cancelled'].includes(t.status)) || (state.filter === 'approval' && t.status === 'awaiting_approval') || (state.filter === 'attention' && needsAttention(t)) || (state.filter === 'done' && t.status === 'completed') || (state.filter === 'live' && t.mode !== 'demo') || (state.filter === 'demo' && t.mode === 'demo');
    const text = `${t.title} ${t.description} ${categoryNames[t.category] || ''}`.toLowerCase();
    return match && text.includes(state.search);
  });
}
function renderList(tasks) {
  const visible = visibleTasks(tasks);
  if (!visible.some(task => task.id === state.selectedId)) state.selectedId = visible[0]?.id || null;
  $('#taskList').innerHTML = visible.length ? visible.map(t => `<button type="button" class="task-item ${t.id === state.selectedId ? 'selected' : ''}" data-select="${esc(t.id)}"><div class="task-item-top"><span class="category-icon">${categoryIcons[t.category] || '✳'}</span><span class="task-item-copy"><strong>${esc(t.title)}</strong><small>${esc(categoryNames[t.category] || 'Task')} · ${niceDate(t.updatedAt)}</small></span><span class="task-item-arrow">↗</span></div><div class="task-item-bottom"><span class="status ${esc(t.status)}">${statusName(t.status)}</span>${t.priority === 'urgent' ? '<span class="priority-chip">URGENT</span>' : ''}${isDue(t) ? '<span class="due-chip">FOLLOW-UP DUE</span>' : ''}${t.mode === 'demo' ? '<span class="demo-chip">SIMULATED</span>' : ''}</div></button>`).join('') : `<div class="task-empty"><span>✳</span><strong>${tasks.length ? 'No matching tasks' : 'No tasks yet'}</strong><p>${tasks.length ? 'Try another search or filter.' : 'Create a scoped real task, then review what Fo may do.'}</p></div>`;
}
function stageMarkup(task) {
  const map = { new: 0, working: 1, awaiting_approval: 2, approved: 3, booked: 4, completed: 5, blocked: 1, cancelled: 0 };
  const active = map[task.status] ?? 0;
  return `<div class="stage-rail" aria-label="Task progress"><div class="stage-line"></div>${['Request', 'Find', 'Decide', 'Book', 'Verify'].map((name, index) => `<div class="stage ${index <= active ? 'reached' : ''} ${index === active ? 'current' : ''}"><span class="stage-dot">${index < active ? '✓' : index + 1}</span><small>${name}</small></div>`).join('')}</div>`;
}
function actionButton(type, title, cls = 'secondary') { return `<button type="button" class="${cls}" data-action="${type}">${title}</button>`; }
function renderDetail(task) {
  const panel = $('#detailPanel');
  if (!task) { panel.innerHTML = `<div class="empty"><div class="empty-art">✳</div><h2>A clean slate feels good.</h2><p>Create a task or load sample scenarios to see Fo’s work move from request to receipt.</p><button class="secondary" id="emptyNew" type="button">Create your first task ↗</button></div>`; return; }
  const actions = [];
  if (['new', 'working', 'blocked', 'awaiting_approval'].includes(task.status)) actions.push(actionButton('edit', 'Edit brief'));
  if (['new', 'blocked'].includes(task.status)) actions.push(actionButton('start', 'Start work ↗', 'primary'));
  if (['working', 'awaiting_approval'].includes(task.status)) actions.push(actionButton('add_option', '＋ Add option'));
  if (task.status === 'awaiting_approval') actions.push(actionButton('approve', 'Review & approve ↗', 'primary'));
  if (task.status === 'approved') actions.push(actionButton('book', 'Record booking ↗', 'primary'));
  if (task.doneWhen && ['working', 'awaiting_approval', 'approved', 'booked'].includes(task.status)) actions.push(actionButton('complete', 'Verify outcome ↗', 'primary'));
  if (['working', 'awaiting_approval', 'approved', 'booked', 'blocked'].includes(task.status)) actions.push(actionButton('followup', 'Log follow-up'));
  if (['working', 'awaiting_approval', 'approved', 'booked', 'blocked'].includes(task.status)) actions.push(actionButton('message', '＋ Log conversation'));
  if (['working', 'awaiting_approval', 'approved', 'booked', 'blocked'].includes(task.status)) actions.push(actionButton('schedule_followup', '⏱ Schedule reminder'));
  if (['working', 'awaiting_approval', 'approved', 'booked'].includes(task.status)) actions.push(actionButton('block', 'Mark blocked', 'quiet'));
  if (!['completed', 'cancelled'].includes(task.status) && task.mode !== 'demo' && state.foConnected) {
    if (task.fo?.status !== 'working') {
      actions.push('<button type="button" class="primary" data-fo-intent="research">Ask Fo for quotes ↗</button>');
      if (['working', 'blocked', 'awaiting_approval'].includes(task.status)) actions.push('<button type="button" class="secondary" data-fo-intent="recover">Try another path</button>');
      if (task.status === 'approved') actions.push('<button type="button" class="secondary" data-fo-intent="book">Ask Fo to book</button>');
    }
    if (task.fo?.externalId) {
      actions.push('<button type="button" class="secondary" data-fo-intent="message">Reply to Fo ↗</button>');
      actions.push('<button type="button" class="secondary" data-fo-reply>Check Fo reply</button>');
      if (foConversationUrl(task)) actions.push(`<button type="button" class="secondary" data-feature-import="${esc(task.id)}">Import Wajo web reply</button>`);
    }
  }
  if (!['completed', 'cancelled'].includes(task.status)) actions.push('<button type="button" class="quiet" data-copy-brief>Copy Fo brief</button>');
  if (task.mode === 'demo' && ['new', 'working', 'approved'].includes(task.status)) actions.push('<button type="button" class="quiet" data-demo>▶ Simulate next step</button>');
  if (!['completed', 'cancelled'].includes(task.status)) actions.push(actionButton('cancel', 'Cancel', 'quiet'));
  if (task.status === 'completed') actions.push('<button type="button" class="secondary" data-download-receipt>↓ Export receipt</button>');
  const hasRealRun = task.mode !== 'demo' && ((task.events || []).some(event => event.kind === 'fo_request' && event.mode === 'live') || task.mcpCalls?.some(call => call.tool === 'ask_fo'));
  if (hasRealRun) actions.push('<button type="button" class="secondary" data-download-trace>↓ Export run trace</button>');
  if (hasRealRun) actions.push('<button type="button" class="secondary" data-download-proof>↓ Export proof packet</button>');
  if (githubIssueUrl(task) && state.githubCommentsEnabled && task.githubSync?.state !== 'synced') actions.push('<button type="button" class="secondary" data-github-sync>↻ Update GitHub issue</button>');
  const lowestPrice = task.options.length ? Math.min(...task.options.map(option => option.price)) : null;
  const options = task.options.length ? [...task.options].sort((a, b) => a.price - b.price).map(o => {
    const budgetLabel = task.budget == null ? '' : o.price <= task.budget ? '<span class="quote-tag in-budget">Within budget</span>' : '<span class="quote-tag over-budget">Over budget</span>';
    const cheapest = o.price === lowestPrice ? '<span class="quote-tag lowest">Lowest price</span>' : `<span class="quote-delta">+${money(o.price - lowestPrice)} vs lowest</span>`;
    const source = o.source || (task.mode === 'demo' ? 'Simulated scenario' : 'Owner entered; original not attached');
    return `<div class="option comparison-option ${o.id === task.approvedOptionId ? 'chosen' : ''}"><div class="quote-card-top"><div><span class="option-initial">${esc(o.vendor.slice(0, 1).toUpperCase())}</span><strong>${esc(o.vendor)}</strong></div>${o.id === task.approvedOptionId ? '<span class="quote-tag in-budget">✓ APPROVED</span>' : task.mode === 'demo' ? '<span class="demo-chip">SIMULATED</span>' : ''}</div><div class="quote-card-facts"><div><small>PRICE</small><strong>${money(o.price)}</strong></div><div><small>AVAILABILITY</small><strong>${esc(o.availability || 'Not recorded')}</strong></div><div><small>SOURCE · OWNER LOG</small><strong>${esc(source)}</strong></div><div><small>BUDGET FIT</small><strong>${task.budget == null ? 'No limit set' : o.price <= task.budget ? 'Within limit' : 'Over limit'}</strong></div></div><div class="quote-card-bottom"><span>${cheapest}${budgetLabel}${o.details ? ` · ${esc(o.details)}` : ''}</span>${task.status === 'awaiting_approval' ? `<button type="button" data-approve="${esc(o.id)}">Review this option ↗</button>` : ''}</div></div>`;
  }).join('') : `<div class="subtle-empty">${task.fo?.status === 'working' ? 'Fo is working. Check its reply before recording a quote.' : task.fo?.externalId ? 'No quote has been confirmed here. Check Fo’s conversation or wait for a provider reply.' : 'No options yet. Ask Fo for quotes after reviewing the brief.'}</div>`;
  const timeline = [...task.events].reverse().map(timelineMessage).join('');
  const lastFoKind = foMessageKind(task.fo?.lastResponse);
  const noFoResult = task.fo?.lastResponse && lastFoKind !== 'result';
  const foConversationLink = foConversationUrl(task) ? `<a class="fo-source-link" href="${foConversationUrl(task)}" target="_blank" rel="noopener noreferrer">Open original Fo conversation ↗</a>` : '';
  const foPanel = task.fo?.lastResponse ? noFoResult ? `<div class="fo-result fo-result-pending"><div class="fo-result-top"><strong>${lastFoKind === 'empty' ? 'MCP returned no Fo reply' : 'Fo is still working'}</strong><span>LIVE MCP · ${lastFoKind === 'empty' ? 'NO REPLY' : 'WAITING'}</span></div><p>${lastFoKind === 'empty' ? 'The MCP run ended without usable text. The Fo conversation may contain more detail; no quote or provider action is confirmed here.' : 'Fo has not returned a provider result yet. Check this conversation again before taking another step.'}</p><small>Checked ${niceDate(task.fo.lastSyncedAt)}</small><div class="fo-result-note">${lastFoKind === 'empty' ? 'Read the original Fo conversation, then add any details Fo requested in Edit brief before asking it to continue.' : 'No vendor reply, order, or delivery has been confirmed.'}</div>${foConversationLink}<details class="timeline-original"><summary>View original MCP message</summary><p>${esc(task.fo.lastResponse)}</p></details></div>` : `<div class="fo-result"><div class="fo-result-top"><strong>Fo’s latest reply</strong><span>LIVE MCP · ${esc(task.fo.status)}</span></div><p>${esc(task.fo.lastResponse)}</p><small>Updated ${niceDate(task.fo.lastSyncedAt)}</small><div class="fo-result-note">Fo’s report is evidence of progress. Verify quotes, booking confirmations, and physical completion separately.</div>${foConversationLink}</div>` : '';
  panel.innerHTML = `<div class="detail-inner"><div class="detail-header"><div class="eyebrow">TASK ${esc(task.id.slice(0, 8).toUpperCase())} ${task.mode === 'demo' ? '· SIMULATED SCENARIO' : ''}</div><div class="detail-heading"><div><div class="detail-category">${categoryIcons[task.category] || '✳'} ${esc(categoryNames[task.category] || 'Task')}</div><h2>${esc(task.title)}</h2></div><span class="status ${esc(task.status)}">${statusName(task.status)}</span></div><p>${esc(task.description || 'No details provided.')}</p></div>${stageMarkup(task)}${foPanel}${task.status === 'blocked' ? '<div class="state-banner blocked">This task is blocked. Review the activity and start a new path.</div>' : ''}${isDue(task) ? '<div class="state-banner due">Follow-up is due. Record the response or ask Fo to check back.</div>' : ''}<div class="fact-row"><div><small>BUDGET</small><strong>${money(task.budget)}</strong></div><div><small>DEADLINE</small><strong>${esc(task.deadline || 'Not set')}</strong></div><div><small>PRIORITY</small><strong>${task.priority === 'urgent' ? 'Urgent' : 'Normal'}</strong></div><div><small>SOURCE</small><strong>${task.source?.type === 'github' ? 'GitHub #' + esc(task.source.issue) : task.source?.type === 'demo' ? 'Demo scenario' : 'Direct request'}</strong></div></div><div class="detail-section"><div class="detail-section-head"><h3>Next move</h3><small>${task.nextFollowUp ? 'Follow up ' + niceDate(task.nextFollowUp) : 'Stay in control'}</small></div><div class="action-bar">${actions.join('') || '<span class="subtle-empty">No further action required.</span>'}</div></div><div class="detail-section"><div class="detail-section-head"><h3>Options</h3><small>${task.options.length} found</small></div>${options}</div>${task.booking ? `<div class="detail-section"><div class="detail-section-head"><h3>Booking</h3><small>${niceDate(task.booking.at)}</small></div><div class="receipt booking"><span>◇</span><div><strong>${task.status === 'completed' ? 'Booking confirmed' : 'Booked · outcome pending'}</strong><p>${esc(task.booking.confirmation)}</p></div></div></div>` : ''}${task.receipt ? `<div class="detail-section"><div class="detail-section-head"><h3>Proof of done</h3><small>${niceDate(task.receipt.at)}</small></div><div class="receipt complete"><span>✓</span><div><strong>Verified by ${esc(task.receipt.completedBy)}</strong><p>${esc(task.receipt.evidence)}</p></div></div>${task.receipt.photoFile ? `<img class="proof-photo" src="/api/tasks/${esc(task.id)}/evidence" alt="Private photo evidence for this task">` : ''}</div>` : ''}<div class="detail-section"><div class="detail-section-head"><h3>Every step, on record</h3><small>${task.events.length} events</small></div><ul class="timeline">${timeline}</ul></div></div>`;
  if (task.fo?.webReply && task.mode !== 'demo') {
    const imported = task.fo.webReply;
    panel.querySelector('.fact-row')?.insertAdjacentHTML('beforebegin', `<div class="fo-result fo-web-import"><div class="fo-result-top"><strong>Fo web conversation · owner imported</strong><span>NOT MCP TEXT</span></div><p>${esc(imported.text)}</p><small>Observed ${niceDate(imported.observedAt)} · imported ${niceDate(imported.importedAt)}</small><div class="fo-result-note">Copied by ${esc(imported.importedBy)} from the linked Wajo conversation. This is a Fo report, not a provider confirmation.</div><a class="fo-source-link" href="${foConversationUrl(task)}" target="_blank" rel="noopener noreferrer">Inspect original Wajo conversation ↗</a></div>`);
  }
  const sortedOptions = [...task.options].sort((a, b) => a.price - b.price);
  panel.querySelectorAll('.comparison-option').forEach((card, index) => {
    const option = sortedOptions[index];
    if (!option) return;
    const evidence = [option.receivedAt ? `<span>Received ${niceDate(option.receivedAt)}</span>` : '', option.sourceUrl ? `<a href="${esc(option.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open original source ↗</a>` : '', option.evidenceFile ? `<a href="/api/tasks/${esc(task.id)}/option-evidence/${esc(option.id)}" target="_blank" rel="noopener noreferrer">View private screenshot ↗</a>` : ''].filter(Boolean).join(' · ');
    if (option.sourceMessage || evidence) card.querySelector('.quote-card-bottom')?.insertAdjacentHTML('beforebegin', `<details class="quote-original"><summary>Original evidence · owner attached</summary>${option.sourceMessage ? `<p>${esc(option.sourceMessage)}</p>` : ''}<div>${evidence || 'Original text only'}</div></details>`);
  });
  if (githubIssueUrl(task)) {
    const sync = task.githubSync;
    const stateLabel = !state.githubCommentsEnabled ? 'Status comments not configured' : sync?.state === 'synced' && sync.taskUpdatedAt === task.updatedAt ? 'Latest status posted' : sync?.state === 'failed' ? 'GitHub update failed' : 'GitHub update pending';
    panel.querySelector('.fact-row')?.insertAdjacentHTML('beforebegin', `<div class="fo-result github-loop"><div class="fo-result-top"><strong>GitHub issue loop</strong><span>${esc(stateLabel)}</span></div><p><a href="${githubIssueUrl(task)}" target="_blank" rel="noopener noreferrer">Open issue #${task.source.issue} ↗</a>${sync?.commentUrl && /^https:\/\/github\.com\//.test(sync.commentUrl) ? ` · <a href="${esc(sync.commentUrl)}" target="_blank" rel="noopener noreferrer">Inspect status comment ↗</a>` : ''}</p><div class="fo-result-note">Only status goes to GitHub. Private vendor messages, prices, and receipts stay in this workspace.${sync?.state === 'failed' ? ` Last error: ${esc(sync.error || 'Unknown error')}.` : ''}</div></div>`);
  }
  const contract = document.createElement('div');
  contract.className = 'fo-result outcome-contract';
  contract.innerHTML = `<div class="fo-result-top"><strong>Definition of done</strong><span>${task.doneWhen ? 'OWNER SET' : 'NEEDS DEFINITION'}</span></div><p>${esc(task.doneWhen || 'Add a concrete success check in Edit brief before closing this issue.')}</p><div class="fo-result-note">A Fo status of complete means its request finished. The issue closes only after a person verifies the outcome and records evidence.</div>`;
  panel.querySelector('.fact-row').before(contract);
  const providerReplies = task.events.filter(event => event.kind === 'message' && event.direction === 'inbound').length;
  const foReports = task.events.filter(event => event.kind === 'fo_reply' && event.mode === 'live' && foMessageKind(event.text) === 'result').length;
  const verified = task.status === 'completed' && task.receipt?.verifiedByHuman === true;
  const proofChain = document.createElement('div');
  proofChain.className = 'proof-chain';
  proofChain.innerHTML = `<div class="proof-chain-title"><strong>Proof chain</strong><small>Each source has a different level of certainty</small></div><div class="proof-chain-grid"><div class="proof-step ${task.doneWhen ? 'ready' : 'pending'}"><span>01 · OWNER</span><strong>${task.doneWhen ? 'Outcome defined' : 'Define the outcome'}</strong><small>${task.doneWhen ? 'A measurable check is on record.' : 'Set “Done when” before a new Fo request.'}</small></div><div class="proof-step ${foReports ? 'ready' : 'pending'}"><span>02 · FO REPORT</span><strong>${foReports ? `${foReports} live update${foReports === 1 ? '' : 's'}` : 'No usable Fo update yet'}</strong><small>Fo reports progress; its provider actions need corroboration.</small></div><div class="proof-step ${providerReplies ? 'ready' : 'pending'}"><span>03 · PROVIDER LOG</span><strong>${providerReplies ? `${providerReplies} ${providerReplies === 1 ? 'reply' : 'replies'} logged` : 'No provider reply logged'}</strong><small>Entered by the owner from an actual reply.</small></div><div class="proof-step ${verified ? 'ready' : 'pending'}"><span>04 · HUMAN CHECK</span><strong>${verified ? 'Outcome verified' : 'Outcome remains open'}</strong><small>${verified ? 'A person attested to the result.' : 'Requires evidence against the outcome contract.'}</small></div></div>`;
  panel.querySelector('.fact-row').before(proofChain);
  if (hasRealRun) {
    const runPanel = document.createElement('div');
    runPanel.className = 'fo-result run-ledger';
    const callLabel = task.mcpCalls?.length ? `${task.mcpCalls.length} app MCP call${task.mcpCalls.length === 1 ? '' : 's'} logged` : 'Earlier run · partial trace';
    const outcome = task.status === 'completed' && task.receipt?.evidence && task.receipt?.verifiedByHuman === true ? 'Human verified' : 'Outcome still open';
    runPanel.innerHTML = `<div class="fo-result-top"><strong>Run ledger</strong><span>${esc(outcome)}</span></div><p>${esc(callLabel)}. Export the redacted trace for tool calls and limitations.</p><div class="fo-result-note">Fo’s internal phone and email calls are not exposed here. Only claim outcomes backed by a vendor reply or human proof.</div>`;
    panel.querySelector('.fact-row').before(runPanel);
  }
}

function renderConversations(task) {
  if (!task) return;
  const panel = $('#detailPanel');
  const quoteHeading = [...panel.querySelectorAll('.detail-section-head h3')].find(node => node.textContent === 'Options');
  if (quoteHeading) {
    quoteHeading.textContent = 'Compare quotes';
    quoteHeading.closest('.detail-section').querySelector('.detail-section-head').insertAdjacentHTML('afterend', '<p class="compare-intro">Compare price, timing, and scope before you authorize the next step.</p>');
  }
  const messages = task.events.filter(event => event.kind === 'message');
  const cards = messages.length ? messages.slice().reverse().map(event => `<div class="conversation-card ${esc(event.direction || 'inbound')}"><div class="conversation-icon">${event.channel === 'call' ? '◉' : event.channel === 'email' ? '✉' : '↗'}</div><div><div class="conversation-top"><strong>${esc(event.party || 'Provider')}</strong><span>${event.direction === 'outbound' ? 'OUTGOING' : 'REPLY'} · ${esc((event.channel || 'note').toUpperCase())}</span></div><p>${esc(event.text)}</p><small>${esc(event.actor)} · ${niceDate(event.at)}${event.mode === 'demo' ? ' · SIMULATED' : ''}</small></div></div>`).join('') : '<div class="subtle-empty">No conversations logged yet. Record calls, emails, and replies as the task moves.</div>';
  const timelineSection = panel.querySelector('.timeline')?.closest('.detail-section');
  timelineSection?.insertAdjacentHTML('beforebegin', `<div class="detail-section"><div class="detail-section-head"><h3>Conversations</h3><small>${messages.length} update${messages.length === 1 ? '' : 's'}</small></div><div class="conversation-list">${cards}</div></div>`);
}

const actionConfig = {
  edit: ['Edit task brief', 'Update private task details and limits.', `<label>Task title<input name="title" required maxlength="160"></label><label>Details<textarea name="description" rows="4" maxlength="2000" placeholder="Pickup area, file format, size, deadline, and what counts as done"></textarea></label><div class="form-row"><label>Category<select name="category"><option value="other">Other</option><option value="repair">Repair</option><option value="event">Event</option><option value="purchase">Purchase</option></select></label><label>Priority<select name="priority"><option value="normal">Normal</option><option value="urgent">Urgent</option></select></label></div><div class="form-row"><label>Budget (USD)<input name="budget" type="number" min="0" step="0.01" placeholder="Maximum total"></label><label>Deadline<input name="deadline" type="date"></label></div><p class="form-hint">Only you can see these private details. The next Fo action shares the current brief.</p>`],
  start: ['Start work', 'Record the first step.', `<label>What is happening now?<input name="note" placeholder="Calling repair providers"></label><label>Follow up at<input name="nextFollowUp" type="datetime-local"></label>`],
  add_option: ['Add an option', 'Record a quote or proposal.', `<label>Vendor or option name<input name="vendor" required placeholder="Reliable Repair Co."></label><div class="form-row"><label>Price (USD)<input name="price" type="number" min="0" step="0.01" required></label><label>Availability<input name="availability" placeholder="Friday, 2 PM"></label></div><label>Source of this quote<input name="source" maxlength="160" placeholder="Provider email, phone call, or Fo conversation"></label><label>Original provider message<textarea name="sourceMessage" rows="3" maxlength="2000" placeholder="Paste the provider's actual words, if available"></textarea></label><label>Original source link (optional)<input name="sourceUrl" type="url" placeholder="https://..."></label><label>When received<input name="receivedAt" type="datetime-local"></label><label>Screenshot of original reply (optional)<input name="photo" type="file" accept="image/jpeg,image/png"></label><label>Details<input name="details" placeholder="Includes parts and labor"></label><p class="form-hint">These are owner-attached records. The app does not independently authenticate the provider.</p>`],
  approve: ['Approve an option', 'Record permission for one option; no booking or payment.', ''],
  book: ['Record booking', 'Only record a booking after it is confirmed.', `<label>Confirmation details<input name="confirmation" required placeholder="Booking #123, Friday at 2 PM"></label>`],
  complete: ['Verify the outcome', 'A booking alone is not a finished task.', `<label>Evidence that the task is done<textarea name="evidence" rows="3" required placeholder="Poster collected. Receipt #123."></textarea></label><label>Photo or receipt (optional)<input name="photo" type="file" accept="image/jpeg,image/png"></label><p class="form-hint">The photo stays private to this workspace and is included in the proof view.</p>`],
  followup: ['Log a follow-up', 'Keep track of attempts and replies.', `<label>What happened?<textarea name="note" rows="3" required placeholder="Left voicemail; waiting for a call back."></textarea></label><label>Follow up again at<input name="nextFollowUp" type="datetime-local"></label>`],
  message: ['Log a conversation', 'Keep the exact vendor reply or outreach visible.', `<div class="form-row"><label>Direction<select name="direction"><option value="inbound">Reply received</option><option value="outbound">Contacted provider</option></select></label><label>Channel<select name="channel"><option value="call">Phone call</option><option value="email">Email</option><option value="web">Web or chat</option></select></label></div><label>Person or vendor<input name="party" required maxlength="120" placeholder="Device Clinic"></label><label>What was said?<textarea name="note" rows="3" required maxlength="1000" placeholder="Available tomorrow between 2 and 4 PM."></textarea></label><label>Follow up at (optional)<input name="nextFollowUp" type="datetime-local"></label>`],
  schedule_followup: ['Schedule a reminder', 'The app will flag this task when the time arrives.', `<label>Remind me at<input name="nextFollowUp" type="datetime-local" required></label><p class="form-hint">This creates a local reminder. No vendor is contacted automatically until a live Fo connection is configured.</p>`],
  block: ['Mark blocked', 'Explain what needs attention.', `<label>What is blocking progress?<textarea name="note" rows="3" required placeholder="Vendor cannot meet the deadline."></textarea></label>`],
  cancel: ['Cancel task', 'The task stays in the history.', `<label>Reason (optional)<input name="note" placeholder="No longer needed"></label>`]
};
function openAction(type, optionId) {
  const task = state.tasks.find(t => t.id === state.selectedId); if (!task) return;
  state.action = type;
  const [title, subtitle, fields] = actionConfig[type];
  $('#actionTitle').textContent = title;
  $('#actionEyebrow').textContent = subtitle.toUpperCase();
  $('#actionSubmit').textContent = type === 'approve' ? 'Approve selected quote ↗' : 'Save update ↗';
  $('#actionFields').innerHTML = fields;
  if (type === 'edit') {
    const form = $('#actionForm');
    form.elements.description.closest('label').insertAdjacentHTML('afterend', '<label>Done when <textarea name="doneWhen" rows="2" maxlength="400" placeholder="The real-world result a person will check before closing this task"></textarea></label>');
    for (const key of ['title', 'description', 'category', 'priority']) form.elements[key].value = task[key] || '';
    form.elements.doneWhen.value = task.doneWhen || '';
    form.elements.budget.value = task.budget ?? '';
    form.elements.deadline.value = task.deadline?.slice(0, 10) || '';
  }
  if (type === 'complete' && task.mode !== 'demo') $('#actionFields').insertAdjacentHTML('beforeend', '<label class="check"><input name="verified" type="checkbox" required> I personally checked the real-world outcome against the definition of done.</label>');
  if (type === 'schedule_followup' && state.foConnected && task.mode !== 'demo') $('#actionFields').insertAdjacentHTML('beforeend', '<label class="check"><input name="autoFollowUp" type="checkbox"> Let Fo check for an alternative when due. Fo may contact up to three providers for quotes; no booking or spending.</label>');
  if (type === 'approve') {
    const selected = optionId || task.options[0]?.id;
    $('#actionFields').innerHTML = `<p class="approval-intro">Compare each option. Sources are owner-entered records until you inspect the original provider reply.</p><div class="approval-choices">${[...task.options].sort((a, b) => a.price - b.price).map(o => `<label class="approval-choice"><input type="radio" name="optionId" value="${esc(o.id)}" ${o.id === selected ? 'checked' : ''} required><span><strong>${esc(o.vendor)}</strong><small>${esc(o.availability || 'Timing not recorded')} · ${esc(o.source || (task.mode === 'demo' ? 'Simulated source' : 'Source not recorded'))}</small></span><b>${money(o.price)}</b></label>`).join('')}</div><div id="approvalExact" class="approval-exact" aria-live="polite"></div>${task.budget != null && task.options.some(o => o.price > task.budget) ? '<label class="check budget-override"><input name="overrideBudget" type="checkbox"> I approve going over budget if that quote is chosen</label>' : ''}`;
    updateApprovalExact(task);
  }
  $('#actionDialog').showModal();
}
function updateApprovalExact(task) {
  const chosen = task.options.find(option => option.id === $('#actionForm').elements.optionId?.value);
  if (!chosen || !$('#approvalExact')) return;
  $('#approvalExact').innerHTML = `<span>EXACT ACTION BEING APPROVED</span><strong>Record permission to pursue ${esc(chosen.vendor)} at up to ${money(chosen.price)}.</strong><p>Availability: ${esc(chosen.availability || 'unconfirmed')}. ${task.budget != null && chosen.price > task.budget ? 'This exceeds the stated budget.' : 'This does not exceed the stated budget.'} No booking or payment happens when you approve.</p>`;
}
function foBrief(task) {
  return `Please handle this task and report progress, options, and confirmation details. Do not book, purchase, or spend without my approval.\n\nTask: ${task.title}\nDetails: ${task.description || 'None provided'}\nDone when: ${task.doneWhen || 'Ask me to define a success check'}\nBudget: ${money(task.budget)}\nDeadline: ${task.deadline || 'Not set'}\nCurrent status: ${statusName(task.status)}\nLatest activity: ${task.events.at(-1)?.text || 'None'}\n\nIf an option exceeds the budget or the outcome cannot be verified, ask me before proceeding.`;
}
async function seedDemo() {
  try {
    const result = await api('/api/demo/seed', { method: 'POST', body: '{}' });
    state.selectedId = result.tasks[0]?.id || state.selectedId;
    await refresh(); toast(result.existing ? 'Demo workspace is already loaded.' : 'Three simulated scenarios loaded.');
  } catch (error) { toast(error.message, true); }
}

function openFoAction(intent) {
  const task = state.tasks.find(item => item.id === state.selectedId);
  if (!task || !state.foConnected) return;
  if (!task.fo?.externalId && !task.doneWhen?.trim()) { toast('Define “Done when” before sending a new task to Fo.', true); return openAction('edit'); }
  const chosen = task.options.find(item => item.id === task.approvedOptionId);
  state.foIntent = intent;
  $('#foActionTitle').textContent = intent === 'message' ? 'Reply to Fo' : intent === 'book' ? 'Arrange the approved option' : intent === 'recover' ? 'Recover from a setback' : 'Find real options';
  const scope = intent === 'book'
    ? `Fo may arrange only ${chosen?.vendor || 'the approved vendor'} at up to ${money(chosen?.price)}. No deposit or card details. Any change needs new approval.`
    : intent === 'message'
      ? 'Your exact reply goes to this task’s existing Fo conversation. This reply cannot authorize booking, purchase, or payment; use the approved booking flow for that.'
      : 'Fo may contact up to three distinct providers total for this task for quotes and availability. It should identify itself as an AI assistant, respect refusals, and avoid repeated unsolicited follow-ups. Fo may not book, buy, or spend.';
  $('#foActionSummary').innerHTML = intent === 'message'
    ? `<div><small>TASK</small><strong>${esc(task.title)}</strong></div><div><small>FO’S LATEST ${task.fo?.webReply && latestFoText(task) === task.fo.webReply.text ? 'OWNER-IMPORTED WAJO WEB' : 'MCP'} REPLY</small><p>${esc(latestFoText(task) || 'No reply yet.')}</p></div><label>Your reply to Fo<textarea name="message" rows="4" maxlength="2000" required placeholder="Answer Fo’s question or ask for a precise update"></textarea></label><div><small>PERMITTED ACTION</small><p>${esc(scope)}</p></div>`
    : `<div><small>TASK</small><strong>${esc(task.title)}</strong></div><div><small>DETAILS SHARED WITH FO</small><p>${esc(task.description || 'No details added')}</p></div><div><small>DONE WHEN</small><p>${esc(task.doneWhen || 'Not defined yet')}</p></div><div><small>BUDGET</small><strong>${money(task.budget)}</strong></div><div><small>PERMITTED ACTION</small><p>${esc(scope)}</p></div>`;
  $('#foActionForm').reset();
  $('#foActionSubmit').textContent = intent === 'message' ? 'Send reply to Fo ↗' : 'Send to Fo ↗';
  $('#foActionDialog').showModal();
}

function openFoImport(task) {
  const url = foConversationUrl(task);
  if (!url || task.mode === 'demo') return toast('A live Wajo conversation is required.', true);
  state.selectedId = task.id;
  const form = $('#importFoForm');
  form.reset();
  form.elements.sourceUrl.value = url;
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  form.elements.observedAt.value = now.toISOString().slice(0, 16);
  $('#importFoDialog').showModal();
}

document.addEventListener('click', async event => {
  const close = event.target.closest('[data-close]');
  if (close) return close.closest('dialog').close();
  if (event.target.closest('#newTask,#newTaskSide,#panelNew,#emptyNew,[data-new-feature]')) return $('#taskDialog').showModal();
  if (event.target.closest('#judgeMode')) {
    const task = featuredTaskFor(state.tasks);
    return task ? openJudge(task.id) : toast('Create a task before opening judge mode.', true);
  }
  const judgeOpen = event.target.closest('[data-judge-open]');
  if (judgeOpen) return openJudge(judgeOpen.dataset.judgeOpen);
  const judgeSlide = event.target.closest('[data-judge-slide]');
  if (judgeSlide) { state.judgeSlide = Number(judgeSlide.dataset.judgeSlide); return renderJudge(); }
  if (event.target.closest('#judgePrevious')) { state.judgeSlide--; return renderJudge(); }
  if (event.target.closest('#judgeNext')) { if (state.judgeSlide === 4) return $('#judgeDialog').close(); state.judgeSlide++; return renderJudge(); }
  const quick = event.target.closest('[data-feature-reply],[data-feature-check],[data-feature-import]');
  if (quick) {
    const id = quick.dataset.featureReply || quick.dataset.featureCheck || quick.dataset.featureImport;
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    state.selectedId = id;
    if (quick.hasAttribute('data-feature-import')) return openFoImport(task);
    if (quick.hasAttribute('data-feature-reply')) return openFoAction('message');
    try { await api(`/api/tasks/${id}/fo/reply`, { method: 'POST', body: '{}' }); await refresh(); toast('Existing Fo conversation checked.'); }
    catch (error) { toast(error.message, true); }
    return;
  }
  const inboxTask = event.target.closest('[data-inbox-open],[data-inbox-reply],[data-inbox-check],[data-feature-open]');
  if (inboxTask) {
    const id = inboxTask.dataset.inboxOpen || inboxTask.dataset.inboxReply || inboxTask.dataset.inboxCheck || inboxTask.dataset.featureOpen;
    const task = state.tasks.find(item => item.id === id);
    if (!task) return;
    state.selectedId = id;
    if (inboxTask.matches('[data-inbox-open],[data-inbox-reply],[data-feature-open]')) saveFoSeen(task, latestFoEvent(task));
    if (inboxTask.matches('[data-inbox-check]')) {
      try { await api(`/api/tasks/${id}/fo/reply`, { method: 'POST', body: '{}' }); await refresh(); toast('Existing Fo conversation checked.'); }
      catch (error) { toast(error.message, true); }
      return;
    }
    state.filter = 'all'; state.search = ''; $('#taskSearch').value = ''; setFilter('all');
    if (inboxTask.matches('[data-inbox-reply]')) return openFoAction('message');
    document.querySelector('.workspace').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const judgeTrace = event.target.closest('[data-judge-trace]');
  if (judgeTrace) return downloadRunTrace(judgeTrace.dataset.judgeTrace);
  if (event.target.closest('#seedDemo,#seedSide')) return seedDemo();
  if (event.target.closest('#viewAllAttention')) return setFilter('attention');
  if (event.target.closest('#copyShowcase')) {
    const { runs, replies, approvals, verified } = showcaseCounts(state.tasks);
    const summary = `Proof of Done — private workspace snapshot\nReal Fo MCP runs: ${runs}\nOwner-logged provider replies: ${replies}\nOptions approved by a person: ${approvals}\nHuman-verified outcomes: ${verified}\nSample scenarios excluded. Fo's internal phone and email tool calls are not visible to this app; provider replies must be checked against their original source.`;
    try { await navigator.clipboard.writeText(summary); toast('Safe, count-only snapshot copied.'); }
    catch { toast('Clipboard access unavailable.', true); }
    return;
  }
  const template = event.target.closest('[data-template]');
  if (template) {
    const key = template.dataset.template, form = $('#taskForm'), preset = templates[key];
    form.elements.title.value = preset.title; form.elements.description.value = preset.description;
    form.elements.doneWhen.value = preset.doneWhen || '';
    form.elements.category.value = preset.category || key; form.elements.budget.value = preset.budget;
    document.querySelectorAll('[data-template]').forEach(button => button.classList.toggle('selected', button === template));
    return;
  }
  const filter = event.target.closest('[data-filter],[data-nav]');
  if (filter) return setFilter(filter.dataset.filter || filter.dataset.nav);
  const select = event.target.closest('[data-select]');
  if (select) {
    state.selectedId = select.dataset.select;
    const selectedTask = state.tasks.find(item => item.id === state.selectedId);
    if (selectedTask) saveFoSeen(selectedTask, latestFoEvent(selectedTask));
    if (!visibleTasks(state.tasks).some(t => t.id === state.selectedId)) {
      state.filter = 'all'; state.search = ''; $('#taskSearch').value = '';
      document.querySelectorAll('[data-filter]').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
      document.querySelectorAll('[data-nav]').forEach(button => button.classList.toggle('active', button.dataset.nav === 'all'));
    }
    return render();
  }
  const approve = event.target.closest('[data-approve]');
  if (approve) return openAction('approve', approve.dataset.approve);
  const foAction = event.target.closest('[data-fo-intent]');
  if (foAction) return openFoAction(foAction.dataset.foIntent);
  if (event.target.closest('[data-fo-reply]')) {
    try { await api(`/api/tasks/${state.selectedId}/fo/reply`, { method: 'POST', body: '{}' }); await refresh(); toast('Fo reply checked.'); }
    catch (error) { toast(error.message, true); }
    return;
  }
  const action = event.target.closest('[data-action]');
  if (action) return openAction(action.dataset.action);
  if (event.target.closest('[data-copy-brief]')) {
    const task = state.tasks.find(t => t.id === state.selectedId);
    try { await navigator.clipboard.writeText(foBrief(task)); toast('Fo brief copied.'); }
    catch { toast('Clipboard access unavailable.', true); }
    return;
  }
  if (event.target.closest('[data-download-receipt]')) {
    try {
      const data = await api(`/api/tasks/${state.selectedId}/receipt`);
      const blob = new Blob([JSON.stringify(data.receipt, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `proof-of-done-${state.selectedId.slice(0, 8)}.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Completion receipt exported.');
    } catch (error) { toast(error.message, true); }
    return;
  }
  if (event.target.closest('[data-download-trace]')) {
    return downloadRunTrace(state.selectedId);
  }
  if (event.target.closest('[data-download-proof]')) {
    try {
      const { packet } = await api(`/api/tasks/${state.selectedId}/proof-packet`);
      const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `proof-packet-${state.selectedId.slice(0, 8)}.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Proof packet exported. Review it before sharing.');
    } catch (error) { toast(error.message, true); }
    return;
  }
  if (event.target.closest('[data-github-sync]')) {
    try { await api(`/api/tasks/${state.selectedId}/github/sync`, { method: 'POST', body: '{}' }); await refresh(); toast('GitHub issue status checked.'); }
    catch (error) { toast(error.message, true); }
    return;
  }
  if (event.target.closest('[data-demo]')) {
    if (!confirm('Run one simulated Fo step? No one will be contacted and no money spent.')) return;
    try { await api(`/api/tasks/${state.selectedId}/demo-next`, { method: 'POST', body: '{}' }); await refresh(); toast('Simulated step recorded.'); }
    catch (error) { toast(error.message, true); }
  }
});
async function downloadRunTrace(id) {
  try {
    const { trace } = await api(`/api/tasks/${id}/run-trace`);
    const blob = new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `fo-run-trace-${id.slice(0, 8)}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Redacted run trace exported. Review it before sharing.');
  } catch (error) { toast(error.message, true); }
}
$('#actionForm').addEventListener('change', event => {
  if (state.action === 'approve' && event.target.name === 'optionId') {
    const task = state.tasks.find(item => item.id === state.selectedId);
    if (task) updateApprovalExact(task);
  }
});
$('#judgeDialog').addEventListener('keydown', event => {
  if (event.key === 'ArrowRight' && state.judgeSlide < 4) { state.judgeSlide++; renderJudge(); }
  if (event.key === 'ArrowLeft' && state.judgeSlide > 0) { state.judgeSlide--; renderJudge(); }
});
$('#judgeDialog').addEventListener('close', () => { state.judgeTaskId = null; });
async function connectFo() {
  const buttons = [$('#connectFo'), $('#connectFoInline')]; buttons.forEach(button => button.disabled = true);
  try {
    const { authorizationUrl } = await api('/api/fo/connect', { method: 'POST', body: '{}' });
    window.location.assign(authorizationUrl);
  } catch (error) { toast(error.message, true); buttons.forEach(button => button.disabled = false); }
}
async function disconnectFoAccount() {
  try { await api('/api/fo/disconnect', { method: 'POST', body: '{}' }); await refresh(); toast('Fo disconnected from this workspace.'); }
  catch (error) { toast(error.message, true); }
}
$('#connectFo').addEventListener('click', connectFo);
$('#connectFoInline').addEventListener('click', connectFo);
$('#disconnectFo').addEventListener('click', disconnectFoAccount);
$('#disconnectFoInline').addEventListener('click', disconnectFoAccount);
$('#syncGitHub').addEventListener('click', async () => {
  const button = $('#syncGitHub');
  button.disabled = true;
  try {
    const result = await api('/api/github/sync', { method: 'POST', body: '{}' });
    await refresh();
    toast(result.imported ? `${result.imported} GitHub issue${result.imported === 1 ? '' : 's'} added.` : 'GitHub issues are up to date.');
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});
$('#foActionForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#foActionSubmit'); button.disabled = true; button.textContent = 'Fo is working…';
  try {
    await api(`/api/tasks/${state.selectedId}/fo/ask`, { method: 'POST', body: JSON.stringify({ intent: state.foIntent, message: event.target.elements.message?.value, authorized: true }) });
    $('#foActionDialog').close(); await refresh(); toast('Live Fo reply recorded.');
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; button.textContent = state.foIntent === 'message' ? 'Send reply to Fo ↗' : 'Send to Fo ↗'; }
});
$('#importFoForm').addEventListener('submit', async event => {
  event.preventDefault();
  const task = state.tasks.find(item => item.id === state.selectedId);
  if (!task) return;
  const values = Object.fromEntries(new FormData(event.target));
  values.observedAt = new Date(values.observedAt).toISOString();
  try {
    await api(`/api/tasks/${task.id}/fo/import-web-reply`, { method: 'POST', body: JSON.stringify(values) });
    $('#importFoDialog').close();
    await refresh();
    toast('Wajo web reply imported as an owner log.');
  } catch (error) { toast(error.message, true); }
});
$('#taskSearch').addEventListener('input', event => { state.search = event.target.value.trim().toLowerCase(); render(); });
$('#taskForm').elements.description.closest('label').insertAdjacentHTML('afterend', '<label>Done when <textarea name="doneWhen" rows="2" maxlength="400" placeholder="A specific result you can verify in the real world"></textarea></label>');
$('#taskForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const { task } = await api('/api/tasks', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) });
    state.selectedId = task.id; $('#taskDialog').close(); event.target.reset();
    document.querySelectorAll('[data-template]').forEach(button => button.classList.remove('selected'));
    await refresh(); toast('Task created.');
  } catch (error) { toast(error.message, true); }
});
$('#actionForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.target), values = Object.fromEntries(form);
  if (state.action === 'approve') values.overrideBudget = form.has('overrideBudget');
  if (state.action === 'complete') values.verified = form.has('verified');
  if (state.action === 'schedule_followup') values.autoFollowUp = form.has('autoFollowUp');
  if (values.nextFollowUp) values.nextFollowUp = new Date(values.nextFollowUp).toISOString();
  const task = state.tasks.find(t => t.id === state.selectedId);
  try {
    if (['complete', 'add_option'].includes(state.action) && values.photo?.size) values.photoData = await photoData(values.photo);
    if (values.receivedAt) values.receivedAt = new Date(values.receivedAt).toISOString();
    delete values.photo;
    await api(`/api/tasks/${state.selectedId}/action`, { method: 'POST', body: JSON.stringify({ ...values, type: state.action, actor: 'Team member', mode: task?.mode === 'demo' ? 'demo' : 'manual' }) });
    $('#actionDialog').close(); event.target.reset(); await refresh(); toast('Task updated.');
  } catch (error) { toast(error.message, true); }
});
async function photoData(file) {
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose a JPEG or PNG photo.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const data = canvas.toDataURL('image/jpeg', .78);
  if (data.length > 2_700_000) throw new Error('Photo is too large after resizing. Choose a smaller image.');
  return data;
}
$('#authToggle').addEventListener('click', () => setAuthMode(state.authMode === 'register' ? 'login' : 'register'));
$('#authForm').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = $('#authSubmit'); submit.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(event.target));
    const { user } = await api(`/api/auth/${state.authMode}`, { method: 'POST', body: JSON.stringify(values) });
    event.target.reset(); showApp(user); await refresh();
  } catch (error) { toast(error.message, true); }
  finally { submit.disabled = false; }
});
async function signOut() {
  try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); showAuth(); toast('Signed out.'); }
  catch (error) { toast(error.message, true); }
}
$('#logoutButton').addEventListener('click', signOut);
$('#mobileLogout').addEventListener('click', signOut);
const pageMain = document.querySelector('#appShell main');
const pageFooter = pageMain.querySelector('footer');
for (const selector of ['#attentionSection', '.workspace', '.hero', '.metrics', '.showcase']) pageMain.insertBefore(pageMain.querySelector(selector), pageFooter);
async function bootstrap() {
  const { user } = await api('/api/auth/session');
  if (!user) return showAuth();
  showApp(user); await refresh();
  if (location.hash === '#fo-connected') { toast('Fo connected to this workspace.'); history.replaceState(null, '', '/'); }
  if (location.hash.startsWith('#fo-error=')) { toast(decodeURIComponent(location.hash.slice(10)), true); history.replaceState(null, '', '/'); }
}
bootstrap().catch(error => { showAuth(); toast(error.message, true); });
setInterval(() => { if (state.user && !$('#judgeDialog').open) refresh().catch(error => toast(error.message, true)); }, 20_000);
