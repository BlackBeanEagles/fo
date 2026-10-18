import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, applyAction } from './workflow.mjs';

test('a booking is not treated as completed without human evidence', () => {
  let task = createTask({ title: 'Repair projector', budget: 150 });
  task = applyAction(task, { type: 'start' });
  task = applyAction(task, { type: 'add_option', vendor: 'Repair Co', price: 120 });
  task = applyAction(task, { type: 'approve', optionId: task.options[0].id, actor: 'Owner' });
  task = applyAction(task, { type: 'book', confirmation: 'Appointment #123' });
  assert.equal(task.status, 'booked');
  assert.equal(task.receipt, null);
  assert.throws(() => applyAction(task, { type: 'complete' }), /evidence/);
  task = applyAction(task, { type: 'complete', evidence: 'Repaired and tested.', actor: 'Owner' });
  assert.equal(task.status, 'completed');
  assert.equal(task.receipt.completedBy, 'Owner');
});

test('over-budget choices need an explicit override', () => {
  let task = createTask({ title: 'Book a repair', budget: 100 });
  task = applyAction(task, { type: 'start' });
  task = applyAction(task, { type: 'add_option', vendor: 'Repair Co', price: 140 });
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
  task = applyAction(task, { type: 'edit', title: 'Print A3 poster', description: 'Pickup in downtown by Friday', budget: '30', deadline: '2026-10-19', actor: 'owner' });
  assert.equal(task.description, 'Pickup in downtown by Friday');
  assert.equal(task.budget, 30);
  assert.equal(task.source.issue, 1);
  assert.equal(task.status, 'new');
  assert.equal(task.events.at(-1).kind, 'edit');
  assert.throws(() => applyAction(task, { type: 'edit', title: '  ', budget: '30' }), /title/);
});
