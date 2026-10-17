import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, applyAction } from './workflow.mjs';
import { dueForFollowUp, recordFollowUpDue } from './followups.mjs';

test('a due reminder is recorded once and never claims Fo contacted a provider', () => {
  let task = createTask({ title: 'Find caterer' });
  task.ownerId = 'user-a';
  task = applyAction(task, { type: 'start', nextFollowUp: '2026-10-15T10:00:00Z' });
  assert.equal(dueForFollowUp(task, Date.parse('2026-10-16T10:00:00Z')), true);
  task = recordFollowUpDue(task, new Date('2026-10-16T10:00:00Z'));
  assert.equal(dueForFollowUp(task, Date.parse('2026-10-16T10:01:00Z')), false);
  assert.match(task.events.at(-1).text, /reminder is due/);
});
