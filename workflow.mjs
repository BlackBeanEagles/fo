import { randomUUID } from 'node:crypto';

const active = new Set(['new', 'working', 'awaiting_approval', 'approved', 'booked', 'blocked']);

export function createTask(input, source = { type: 'app' }) {
  const title = clean(input.title, 160);
  if (!title) throw new Error('A task title is required.');
  const now = new Date().toISOString();
  const category = ['repair', 'event', 'purchase', 'other'].includes(input.category) ? input.category : 'other';
  const priority = ['normal', 'urgent'].includes(input.priority) ? input.priority : 'normal';
  return {
    id: randomUUID(), title, description: clean(input.description, 2000), doneWhen: clean(input.doneWhen, 400),
    category, priority,
    budget: input.budget === '' || input.budget == null ? null : parseMoney(input.budget),
    deadline: clean(input.deadline, 40) || null, source,
    status: 'new', mode: 'manual', options: [], approvedOptionId: null,
    booking: null, receipt: null, nextFollowUp: null, autoFollowUp: false, followUpAlertedFor: null,
    fo: { status: 'not_sent', externalId: null, lastSyncedAt: null },
    createdAt: now, updatedAt: now,
    events: [{ id: randomUUID(), at: now, actor: 'system', kind: 'created', text: 'Task created.' }]
  };
}

export function applyAction(task, action) {
  if (!active.has(task.status)) throw new Error('This task is closed.');
  const now = new Date().toISOString();
  const actor = clean(action.actor, 80) || 'teammate';
  const note = clean(action.note, 1000);
  const next = structuredClone(task);
  let text;
  switch (action.type) {
    case 'edit': {
      requireStatus(task, ['new', 'working', 'blocked', 'awaiting_approval']);
      const title = clean(action.title, 160);
      if (!title) throw new Error('A task title is required.');
      next.title = title;
      next.description = clean(action.description, 2000);
      next.doneWhen = clean(action.doneWhen, 400);
      next.category = ['repair', 'event', 'purchase', 'other'].includes(action.category) ? action.category : task.category;
      next.priority = ['normal', 'urgent'].includes(action.priority) ? action.priority : task.priority;
      next.budget = action.budget === '' || action.budget == null ? null : parseMoney(action.budget);
      next.deadline = clean(action.deadline, 40) || null;
      text = 'Task brief and limits updated. Review the current details before sending another Fo action.';
      break;
    }
    case 'start':
      requireStatus(task, ['new', 'blocked']);
      next.status = 'working';
      next.nextFollowUp = action.nextFollowUp || null;
      next.followUpAlertedFor = null;
      text = note || 'Work started.';
      break;
    case 'add_option': {
      requireStatus(task, ['working', 'awaiting_approval']);
      const vendor = clean(action.vendor, 120);
      if (!vendor) throw new Error('Vendor or option name is required.');
      const price = parseMoney(action.price);
      const option = { id: randomUUID(), vendor, price, availability: clean(action.availability, 160), details: clean(action.details, 500), addedAt: now };
      next.options.push(option);
      next.status = 'awaiting_approval';
      text = `Option added: ${vendor} at $${price.toFixed(2)}.`;
      break;
    }
    case 'approve': {
      requireStatus(task, ['awaiting_approval']);
      const option = task.options.find(item => item.id === action.optionId);
      if (!option) throw new Error('Select a valid option.');
      if (task.budget !== null && option.price > task.budget && !action.overrideBudget) throw new Error('This option exceeds the budget. Explicit override required.');
      next.approvedOptionId = option.id;
      next.status = 'approved';
      text = `${actor} approved ${option.vendor} at $${option.price.toFixed(2)}${option.price > task.budget ? ' with a budget override' : ''}.`;
      break;
    }
    case 'book':
      requireStatus(task, ['approved']);
      if (!clean(action.confirmation, 300)) throw new Error('Booking confirmation is required.');
      next.booking = { confirmation: clean(action.confirmation, 300), at: now };
      next.status = 'booked';
      text = `Booking recorded: ${next.booking.confirmation}`;
      break;
    case 'complete':
      requireStatus(task, ['working', 'awaiting_approval', 'approved', 'booked']);
      if (task.mode !== 'demo' && !clean(task.doneWhen, 400)) throw new Error('Define the real-world outcome before verifying this task.');
      if (!clean(action.evidence, 1000)) throw new Error('Completion evidence is required.');
      if (task.mode !== 'demo' && action.verified !== true) throw new Error('Confirm that a person checked the real outcome before closing this task.');
      next.receipt = { evidence: clean(action.evidence, 1000), completedBy: actor, verifiedByHuman: task.mode !== 'demo', at: now };
      next.status = 'completed';
      text = `Outcome verified by ${actor}: ${next.receipt.evidence}`;
      break;
    case 'followup':
      requireStatus(task, ['working', 'awaiting_approval', 'approved', 'booked', 'blocked']);
      if (!note) throw new Error('Describe the follow-up or response.');
      next.nextFollowUp = action.nextFollowUp || null;
      next.followUpAlertedFor = null;
      text = `Follow-up: ${note}`;
      break;
    case 'message': {
      requireStatus(task, ['working', 'awaiting_approval', 'approved', 'booked', 'blocked']);
      if (!note) throw new Error('Describe the conversation.');
      const party = clean(action.party, 120) || 'Provider';
      const direction = action.direction === 'outbound' ? 'outbound' : 'inbound';
      text = `${direction === 'inbound' ? 'Reply from' : 'Contacted'} ${party}: ${note}`;
      next.nextFollowUp = action.nextFollowUp || task.nextFollowUp;
      if (action.nextFollowUp) next.followUpAlertedFor = null;
      break;
    }
    case 'schedule_followup': {
      requireStatus(task, ['working', 'awaiting_approval', 'approved', 'booked', 'blocked']);
      const followUpAt = new Date(action.nextFollowUp);
      if (!Number.isFinite(followUpAt.getTime())) throw new Error('Enter a valid follow-up date.');
      next.nextFollowUp = followUpAt.toISOString();
      next.autoFollowUp = action.autoFollowUp === true;
      next.followUpAlertedFor = null;
      text = `${next.autoFollowUp ? 'Fo follow-up' : 'Reminder'} scheduled for ${followUpAt.toLocaleString('en-US', { timeZone: 'UTC' })} UTC.`;
      break;
    }
    case 'block':
      requireStatus(task, ['working', 'awaiting_approval', 'approved', 'booked']);
      if (!note) throw new Error('Describe what is blocked.');
      next.status = 'blocked';
      text = `Blocked: ${note}`;
      break;
    case 'cancel':
      next.status = 'cancelled';
      text = note || 'Task cancelled.';
      break;
    default: throw new Error('Unknown action.');
  }
  next.updatedAt = now;
  const channel = ['call', 'email', 'web', 'purchase', 'human'].includes(action.channel) ? action.channel : null;
  const event = { id: randomUUID(), at: now, actor, kind: action.type, text, mode: action.mode || 'manual', channel };
  if (action.type === 'message') {
    event.party = clean(action.party, 120) || 'Provider';
    event.direction = action.direction === 'outbound' ? 'outbound' : 'inbound';
  }
  next.events.push(event);
  return next;
}

export function recordFoExchange(task, { intent, prompt, reply }) {
  if (!active.has(task.status) || task.mode === 'demo') throw new Error('Fo can only run on an open real task.');
  if (task.fo?.externalId && reply.conversationId && reply.conversationId !== task.fo.externalId) throw new Error('Fo returned a different conversation for this task. No reply was recorded.');
  const now = new Date().toISOString();
  const next = structuredClone(task);
  if (next.status === 'new' || next.status === 'blocked') next.status = 'working';
  next.fo = {
    status: reply.status || 'reply_received',
    externalId: reply.conversationId || task.fo?.externalId || null,
    lastSyncedAt: now,
    lastResponse: String(reply.text || '').slice(0, 12000)
  };
  next.updatedAt = now;
  next.events.push({ id: randomUUID(), at: now, actor: 'workspace owner', kind: 'fo_request', mode: 'live', text: String(prompt).slice(0, 8000), intent });
  next.events.push({ id: randomUUID(), at: now, actor: 'Fo', kind: 'fo_reply', mode: 'live', text: String(reply.text || '').slice(0, 12000), intent, conversationId: next.fo.externalId });
  return next;
}

export function recordFoReply(task, reply) {
  if (task.mode === 'demo' || !task.fo?.externalId) throw new Error('No live Fo conversation exists.');
  if (reply.conversationId && reply.conversationId !== task.fo.externalId) throw new Error('Fo returned a different conversation for this task. No reply was recorded.');
  const now = new Date().toISOString();
  const next = structuredClone(task);
  const text = String(reply.text || '').slice(0, 12000);
  if (text === task.fo.lastResponse && (reply.status || '') === task.fo.status) return task;
  next.fo = { ...task.fo, status: reply.status || task.fo.status, externalId: reply.conversationId || task.fo.externalId, lastSyncedAt: now, lastResponse: text };
  next.updatedAt = now;
  next.events.push({ id: randomUUID(), at: now, actor: 'Fo', kind: 'fo_reply', mode: 'live', text, conversationId: next.fo.externalId });
  return next;
}

export function recordFoFailure(task, message) {
  const next = structuredClone(task);
  const now = new Date().toISOString();
  next.updatedAt = now;
  next.events.push({ id: randomUUID(), at: now, actor: 'system', kind: 'fo_error', mode: 'system', text: `Fo follow-up failed: ${String(message).slice(0, 300)}. Review this task and retry manually.` });
  return next;
}

function requireStatus(task, allowed) {
  if (!allowed.includes(task.status)) throw new Error(`Cannot do that while task is ${task.status.replaceAll('_', ' ')}.`);
}
function clean(value, max) { return String(value ?? '').trim().slice(0, max); }
function parseMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1_000_000) throw new Error('Enter a valid nonnegative amount under $1,000,000.');
  return Math.round(number * 100) / 100;
}
