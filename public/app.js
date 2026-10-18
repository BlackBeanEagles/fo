const $ = selector => document.querySelector(selector);
const state = { tasks: [], selectedId: null, filter: 'all', search: '', action: null, foIntent: null, user: null, authMode: 'register', foConnected: false, runs: { runs: 0, verified: 0, inProgress: 0 } };
const statusNames = { new: 'New', working: 'In progress', awaiting_approval: 'Needs approval', approved: 'Approved', booked: 'Booked', completed: 'Verified done', blocked: 'Blocked', cancelled: 'Cancelled' };
const categoryNames = { repair: 'Repair', event: 'Event', purchase: 'Purchase', other: 'Task' };
const categoryIcons = { repair: '🔧', event: '🥗', purchase: '🛒', other: '✳' };
const templates = {
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
  state.user = null; state.tasks = []; state.selectedId = null; state.filter = 'all'; state.search = ''; state.foConnected = false;
  $('#taskSearch').value = '';
  $('#appShell').hidden = true; $('#authScreen').hidden = false;
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  setFilter('all');
}
function showApp(user) {
  state.user = user; state.tasks = []; state.selectedId = null;
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
  state.runs = status.runs || { runs: 0, verified: 0, inProgress: 0 };
    $('#syncGitHub').hidden = !status.githubIssueSyncEnabled;
  renderFoConnection();
  if (!tasks.some(t => t.id === state.selectedId)) state.selectedId = tasks[0]?.id || null;
  render();
}
function renderFoConnection() {
  $('#foConnectionTitle').textContent = state.foConnected ? 'Fo is connected' : 'Connect your Fo account';
  $('#foConnectionText').textContent = state.foConnected ? 'Live Fo requests are available for your real tasks. Your connection is private to this workspace and lasts until this server restarts.' : 'Authorize your Wajo account to send a real task through Fo MCP.';
  $('#connectFo').hidden = state.foConnected;
  $('#disconnectFo').hidden = !state.foConnected;
  $('#connectFoInline').hidden = state.foConnected;
  $('#disconnectFoInline').hidden = !state.foConnected;
  $('#foInlineStatus').textContent = state.foConnected ? 'Fo connected · live actions ready' : 'Fo is not connected · demo steps are simulated';
  $('#modeDisclosure').innerHTML = state.foConnected ? `<strong>Live connection:</strong> ${state.runs.runs} real Fo run${state.runs.runs === 1 ? '' : 's'} · ${state.runs.verified} verified outcome${state.runs.verified === 1 ? '' : 's'}. Booking and completion still require proof.` : '<strong>Local mode:</strong> Connect Fo to make real requests. Sample scenarios remain simulated.';
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
  $('#sideApprovalCount').textContent = approval.length;
  $('#sideAttentionCount').textContent = attention.length;
  $('#taskCount').textContent = tasks.length;
  renderAttention(attention);
  renderList(tasks);
  const selected = tasks.find(t => t.id === state.selectedId);
  renderDetail(selected);
  renderConversations(selected);
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
    const match = state.filter === 'all' || (state.filter === 'active' && !['completed', 'cancelled'].includes(t.status)) || (state.filter === 'approval' && t.status === 'awaiting_approval') || (state.filter === 'attention' && needsAttention(t)) || (state.filter === 'done' && t.status === 'completed');
    const text = `${t.title} ${t.description} ${categoryNames[t.category] || ''}`.toLowerCase();
    return match && text.includes(state.search);
  });
}
function renderList(tasks) {
  const visible = visibleTasks(tasks);
  if (!visible.some(task => task.id === state.selectedId)) state.selectedId = visible[0]?.id || null;
  $('#taskList').innerHTML = visible.length ? visible.map(t => `<button type="button" class="task-item ${t.id === state.selectedId ? 'selected' : ''}" data-select="${esc(t.id)}"><div class="task-item-top"><span class="category-icon">${categoryIcons[t.category] || '✳'}</span><span class="task-item-copy"><strong>${esc(t.title)}</strong><small>${esc(categoryNames[t.category] || 'Task')} · ${niceDate(t.updatedAt)}</small></span><span class="task-item-arrow">↗</span></div><div class="task-item-bottom"><span class="status ${esc(t.status)}">${statusName(t.status)}</span>${t.priority === 'urgent' ? '<span class="priority-chip">URGENT</span>' : ''}${isDue(t) ? '<span class="due-chip">FOLLOW-UP DUE</span>' : ''}${t.mode === 'demo' ? '<span class="demo-chip">SIMULATED</span>' : ''}</div></button>`).join('') : `<div class="task-empty"><span>✳</span><strong>No matching tasks</strong><p>Try another search or filter.</p></div>`;
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
  if (task.status === 'booked') actions.push(actionButton('complete', 'Verify outcome ↗', 'primary'));
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
    }
  }
  if (!['completed', 'cancelled'].includes(task.status)) actions.push('<button type="button" class="quiet" data-copy-brief>Copy Fo brief</button>');
  if (task.mode === 'demo' && ['new', 'working', 'approved'].includes(task.status)) actions.push('<button type="button" class="quiet" data-demo>▶ Simulate next step</button>');
  if (!['completed', 'cancelled'].includes(task.status)) actions.push(actionButton('cancel', 'Cancel', 'quiet'));
  if (task.status === 'completed') actions.push('<button type="button" class="secondary" data-download-receipt>↓ Export receipt</button>');
  const hasRealRun = task.mode !== 'demo' && ((task.events || []).some(event => event.kind === 'fo_request' && event.mode === 'live') || task.mcpCalls?.some(call => call.tool === 'ask_fo'));
  if (hasRealRun) actions.push('<button type="button" class="secondary" data-download-trace>↓ Export run trace</button>');
  const lowestPrice = task.options.length ? Math.min(...task.options.map(option => option.price)) : null;
  const options = task.options.length ? [...task.options].sort((a, b) => a.price - b.price).map(o => {
    const budgetLabel = task.budget == null ? '' : o.price <= task.budget ? '<span class="quote-tag in-budget">Within budget</span>' : '<span class="quote-tag over-budget">Over budget</span>';
    const cheapest = o.price === lowestPrice ? '<span class="quote-tag lowest">Lowest price</span>' : `<span class="quote-delta">+${money(o.price - lowestPrice)} vs lowest</span>`;
    return `<div class="option comparison-option ${o.id === task.approvedOptionId ? 'chosen' : ''}"><div class="option-main"><div class="option-initial">${esc(o.vendor.slice(0, 1).toUpperCase())}</div><div><strong>${esc(o.vendor)} ${o.id === task.approvedOptionId ? '✓ Chosen' : ''}</strong><div class="quote-tags">${cheapest}${budgetLabel}</div><small>◷ ${esc(o.availability || 'Availability not recorded')}</small>${o.details ? `<p>${esc(o.details)}</p>` : ''}</div></div><div class="option-side"><b>${money(o.price)}</b>${task.status === 'awaiting_approval' ? `<button type="button" data-approve="${esc(o.id)}">Choose ↗</button>` : ''}</div></div>`;
  }).join('') : '<div class="subtle-empty">No options recorded yet. Add one when Fo returns a quote.</div>';
  const timeline = [...task.events].reverse().map(e => `<li><div class="timeline-dot"></div><div><p>${esc(e.text)} ${e.mode === 'demo' ? '<span class="demo-chip">SIMULATED</span>' : ''}</p><small>${e.channel ? `<span class="channel-chip ${esc(e.channel)}">${esc(e.channel.toUpperCase())}</span> ` : ''}${esc(e.actor)} · ${niceDate(e.at)}</small></div></li>`).join('');
  const foPanel = task.fo?.lastResponse ? `<div class="fo-result"><div class="fo-result-top"><strong>Fo’s latest reply</strong><span>LIVE MCP · ${esc(task.fo.status)}</span></div><p>${esc(task.fo.lastResponse)}</p><small>Updated ${niceDate(task.fo.lastSyncedAt)}</small><div class="fo-result-note">Fo’s report is evidence of progress. Verify quotes, booking confirmations, and physical completion separately.</div></div>` : '';
  panel.innerHTML = `<div class="detail-inner"><div class="detail-header"><div class="eyebrow">TASK ${esc(task.id.slice(0, 8).toUpperCase())} ${task.mode === 'demo' ? '· SIMULATED SCENARIO' : ''}</div><div class="detail-heading"><div><div class="detail-category">${categoryIcons[task.category] || '✳'} ${esc(categoryNames[task.category] || 'Task')}</div><h2>${esc(task.title)}</h2></div><span class="status ${esc(task.status)}">${statusName(task.status)}</span></div><p>${esc(task.description || 'No details provided.')}</p></div>${stageMarkup(task)}${foPanel}${task.status === 'blocked' ? '<div class="state-banner blocked">This task is blocked. Review the activity and start a new path.</div>' : ''}${isDue(task) ? '<div class="state-banner due">Follow-up is due. Record the response or ask Fo to check back.</div>' : ''}<div class="fact-row"><div><small>BUDGET</small><strong>${money(task.budget)}</strong></div><div><small>DEADLINE</small><strong>${esc(task.deadline || 'Not set')}</strong></div><div><small>PRIORITY</small><strong>${task.priority === 'urgent' ? 'Urgent' : 'Normal'}</strong></div><div><small>SOURCE</small><strong>${task.source?.type === 'github' ? 'GitHub #' + esc(task.source.issue) : task.source?.type === 'demo' ? 'Demo scenario' : 'Direct request'}</strong></div></div><div class="detail-section"><div class="detail-section-head"><h3>Next move</h3><small>${task.nextFollowUp ? 'Follow up ' + niceDate(task.nextFollowUp) : 'Stay in control'}</small></div><div class="action-bar">${actions.join('') || '<span class="subtle-empty">No further action required.</span>'}</div></div><div class="detail-section"><div class="detail-section-head"><h3>Options</h3><small>${task.options.length} found</small></div>${options}</div>${task.booking ? `<div class="detail-section"><div class="detail-section-head"><h3>Booking</h3><small>${niceDate(task.booking.at)}</small></div><div class="receipt booking"><span>◇</span><div><strong>${task.status === 'completed' ? 'Booking confirmed' : 'Booked · outcome pending'}</strong><p>${esc(task.booking.confirmation)}</p></div></div></div>` : ''}${task.receipt ? `<div class="detail-section"><div class="detail-section-head"><h3>Proof of done</h3><small>${niceDate(task.receipt.at)}</small></div><div class="receipt complete"><span>✓</span><div><strong>Verified by ${esc(task.receipt.completedBy)}</strong><p>${esc(task.receipt.evidence)}</p></div></div>${task.receipt.photoFile ? `<img class="proof-photo" src="/api/tasks/${esc(task.id)}/evidence" alt="Private photo evidence for this task">` : ''}</div>` : ''}<div class="detail-section"><div class="detail-section-head"><h3>Every step, on record</h3><small>${task.events.length} events</small></div><ul class="timeline">${timeline}</ul></div></div>`;
  const contract = document.createElement('div');
  contract.className = 'fo-result outcome-contract';
  contract.innerHTML = `<div class="fo-result-top"><strong>Definition of done</strong><span>${task.doneWhen ? 'OWNER SET' : 'NEEDS DEFINITION'}</span></div><p>${esc(task.doneWhen || 'Add a concrete success check in Edit brief before closing this issue.')}</p><div class="fo-result-note">A Fo status of complete means its request finished. The issue closes only after a person verifies the outcome and records evidence.</div>`;
  panel.querySelector('.fact-row').before(contract);
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
  add_option: ['Add an option', 'Record a quote or proposal.', `<label>Vendor or option name<input name="vendor" required placeholder="Reliable Repair Co."></label><div class="form-row"><label>Price (USD)<input name="price" type="number" min="0" step="0.01" required></label><label>Availability<input name="availability" placeholder="Friday, 2 PM"></label></div><label>Details<input name="details" placeholder="Includes parts and labor"></label>`],
  approve: ['Approve an option', 'A person authorizes the next step.', ''],
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
  if (type === 'approve') $('#actionFields').innerHTML = `<p class="approval-intro">Choose the quote you authorize. Booking still needs a confirmed result.</p><div class="approval-choices">${[...task.options].sort((a, b) => a.price - b.price).map((o, index) => `<label class="approval-choice"><input type="radio" name="optionId" value="${esc(o.id)}" ${o.id === (optionId || task.options[0]?.id) ? 'checked' : ''} required><span><strong>${esc(o.vendor)}</strong><small>${esc(o.availability || 'Timing not recorded')}${task.budget != null && o.price > task.budget ? ' · OVER BUDGET' : ''}</small></span><b>${money(o.price)}</b></label>`).join('')}</div>${task.budget != null && task.options.some(o => o.price > task.budget) ? '<label class="check budget-override"><input name="overrideBudget" type="checkbox"> I approve going over budget if that quote is chosen</label>' : ''}`;
  $('#actionDialog').showModal();
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
  const chosen = task.options.find(item => item.id === task.approvedOptionId);
  state.foIntent = intent;
  $('#foActionTitle').textContent = intent === 'message' ? 'Reply to Fo' : intent === 'book' ? 'Arrange the approved option' : intent === 'recover' ? 'Recover from a setback' : 'Find real options';
  const scope = intent === 'book'
    ? `Fo may arrange only ${chosen?.vendor || 'the approved vendor'} at up to ${money(chosen?.price)}. No deposit or card details. Any change needs new approval.`
    : intent === 'message'
      ? 'Your exact reply goes to this task’s existing Fo conversation. This reply cannot authorize booking, purchase, or payment; use the approved booking flow for that.'
      : 'Fo may contact up to three distinct providers total for this task for quotes and availability. It should identify itself as an AI assistant, respect refusals, and avoid repeated unsolicited follow-ups. Fo may not book, buy, or spend.';
  $('#foActionSummary').innerHTML = intent === 'message'
    ? `<div><small>TASK</small><strong>${esc(task.title)}</strong></div><div><small>FO’S LATEST REPLY</small><p>${esc(task.fo?.lastResponse || 'No reply yet.')}</p></div><label>Your reply to Fo<textarea name="message" rows="4" maxlength="2000" required placeholder="Answer Fo’s question or ask for a precise update"></textarea></label><div><small>PERMITTED ACTION</small><p>${esc(scope)}</p></div>`
    : `<div><small>TASK</small><strong>${esc(task.title)}</strong></div><div><small>DETAILS SHARED WITH FO</small><p>${esc(task.description || 'No details added')}</p></div><div><small>DONE WHEN</small><p>${esc(task.doneWhen || 'Not defined yet')}</p></div><div><small>BUDGET</small><strong>${money(task.budget)}</strong></div><div><small>PERMITTED ACTION</small><p>${esc(scope)}</p></div>`;
  $('#foActionForm').reset();
  $('#foActionSubmit').textContent = intent === 'message' ? 'Send reply to Fo ↗' : 'Send to Fo ↗';
  $('#foActionDialog').showModal();
}

document.addEventListener('click', async event => {
  const close = event.target.closest('[data-close]');
  if (close) return close.closest('dialog').close();
  if (event.target.closest('#newTask,#newTaskSide,#panelNew,#emptyNew')) return $('#taskDialog').showModal();
  if (event.target.closest('#seedDemo,#seedSide')) return seedDemo();
  if (event.target.closest('#viewAllAttention')) return setFilter('attention');
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
    try {
      const { trace } = await api(`/api/tasks/${state.selectedId}/run-trace`);
      const blob = new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `fo-run-trace-${state.selectedId.slice(0, 8)}.json`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Redacted run trace exported.');
    } catch (error) { toast(error.message, true); }
    return;
  }
  if (event.target.closest('[data-demo]')) {
    if (!confirm('Run one simulated Fo step? No one will be contacted and no money spent.')) return;
    try { await api(`/api/tasks/${state.selectedId}/demo-next`, { method: 'POST', body: '{}' }); await refresh(); toast('Simulated step recorded.'); }
    catch (error) { toast(error.message, true); }
  }
});
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
    if (state.action === 'complete' && values.photo?.size) values.photoData = await photoData(values.photo);
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
async function bootstrap() {
  const { user } = await api('/api/auth/session');
  if (!user) return showAuth();
  showApp(user); await refresh();
  if (location.hash === '#fo-connected') { toast('Fo connected to this workspace.'); history.replaceState(null, '', '/'); }
  if (location.hash.startsWith('#fo-error=')) { toast(decodeURIComponent(location.hash.slice(10)), true); history.replaceState(null, '', '/'); }
}
bootstrap().catch(error => { showAuth(); toast(error.message, true); });
setInterval(() => { if (state.user) refresh().catch(error => toast(error.message, true)); }, 20_000);
