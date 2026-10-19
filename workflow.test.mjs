import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, applyAction, recordFoExchange, recordImportedFoReply } from './workflow.mjs';
import { exportProofPacket } from './proof-packet.mjs';

test('a booking is not treated as completed without human evidence', () => {
  let task = createTask({ title: 'Repair projector', doneWhen: 'A teammate tests the repaired projector.', budget: 150 });
  task = applyAction(task, { type: 'start' });
  task = applyAction(task, { type: 'add_option', vendor: 'Repair Co', price: 120 });
  task = applyAction(task, { type: 'approve', optionId: task.options[0].id, actor: 'Owner' });
  task = applyAction(task, { type: 'book', confirmation: 'Appointment #123' });
  assert.equal(task.status, 'booked');
  assert.equal(task.receipt, null);
  assert.throws(() => applyAction(task, { type: 'complete' }), /evidence/);
  assert.throws(() => applyAction(task, { type: 'complete', evidence: 'Repaired and tested.' }), /person checked/);
  task = applyAction(task, { type: 'complete', evidence: 'Repaired and tested.', verified: true, actor: 'Owner' });
  assert.equal(task.status, 'completed');
  assert.equal(task.receipt.completedBy, 'Owner');
});

test('over-budget choices need an explicit override', () => {
  let task = createTask({ title: 'Book a repair', budget: 100 });
  task = applyAction(task, { type: 'start' });
  task = applyAction(task, { type: 'add_option', vendor: 'Repair Co', price: 140, source: 'Provider email received by owner' });
  assert.equal(task.options[0].source, 'Provider email received by owner');
  assert.throws(() => applyAction(task, { type: 'approve', optionId: task.options[0].id }), /exceeds the budget/);
  task = applyAction(task, { type: 'approve', optionId: task.options[0].id, overrideBudget: true });
  assert.equal(task.status, 'approved');
});

test('a follow-up preserves the task and its history', () => {
  let task = createTask({ title: 'Find vendor' });
  task = applyAction(task, { type: 'start' });
  task = applyAction(task, { type: 'followup', note: 'Called; no answer.', nextFollowUp: '2026-10-18T10:00' });
  assert.equal(task.status, 'working');
  assert.equal(task.nextFollowUp, '2026-10-18T10:00');
  assert.equal(task.events.at(-1).kind, 'followup');
});

test('conversation records direction and schedules a reminder without claiming contact', () => {
  let task = createTask({ title: 'Repair projector' });
  task = applyAction(task, { type: 'start' });
  task = applyAction(task, { type: 'message', direction: 'inbound', party: 'Repair Co', channel: 'call', note: 'Can visit Thursday.' });
  assert.equal(task.events.at(-1).direction, 'inbound');
  assert.equal(task.events.at(-1).party, 'Repair Co');
  task = applyAction(task, { type: 'schedule_followup', nextFollowUp: '2026-10-18T10:00:00Z', autoFollowUp: false });
  assert.equal(task.autoFollowUp, false);
  assert.match(task.events.at(-1).text, /Reminder scheduled/);
});

test('owner can revise an imported task brief without changing its source or approval state', () => {
  let task = createTask({ title: 'Print poster' }, { type: 'github', owner: 'BlackBeanEagles', repo: 'fo', issue: 1 });
  task = applyAction(task, { type: 'edit', title: 'Print A3 poster', description: 'Pickup in downtown by Friday', doneWhen: 'Poster collected and photographed', budget: '30', deadline: '2026-10-19', actor: 'owner' });
  assert.equal(task.description, 'Pickup in downtown by Friday');
  assert.equal(task.doneWhen, 'Poster collected and photographed');
  assert.equal(task.budget, 30);
  assert.equal(task.source.issue, 1);
  assert.equal(task.status, 'new');
  assert.equal(task.events.at(-1).kind, 'edit');
  assert.throws(() => applyAction(task, { type: 'edit', title: '  ', budget: '30' }), /title/);
});

test('an owner-imported Wajo reply remains distinct from MCP and provider evidence', () => {
  const conversationId = 'dcfdcc76-b48a-4439-ad99-4443717704a5';
  const reply = { status: 'complete', text: 'The run finished without a textual reply.', conversationId };
  const task = recordFoExchange(createTask({ title: 'Get a quote', doneWhen: 'A provider sends a quote.' }), { intent: 'research', prompt: 'Get a quote', reply });
  const sourceUrl = `https://wajo.ai/fo/c/${conversationId}`;
  assert.throws(() => recordImportedFoReply(task, { text: 'Provider confirmed', sourceUrl: 'https://elsewhere.example', observedAt: new Date().toISOString() }), /original Wajo/);
  const imported = recordImportedFoReply(task, { text: 'Fo needs a delivery date before contacting anyone.', sourceUrl, observedAt: new Date().toISOString(), actor: 'owner' });
  assert.equal(imported.fo.lastResponse, reply.text);
  assert.equal(imported.fo.webReply.text, 'Fo needs a delivery date before contacting anyone.');
  const packet = exportProofPacket(imported);
  assert.equal(packet.evidenceState.foReports, 0);
  assert.equal(packet.evidenceState.ownerImportedFoReplies, 1);
  assert.equal(packet.evidenceState.providerRepliesLogged, 0);
  assert.equal(packet.milestones.at(-1).source, 'Wajo web reply imported by owner');
});
