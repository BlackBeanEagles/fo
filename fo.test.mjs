import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, applyAction, recordFoExchange, recordFoReply } from './workflow.mjs';
import { foPrompt } from './fo-prompt.mjs';

test('Fo cannot book without a specific human approved option', () => {
  const task = createTask({ title: 'Print one poster', budget: 40 });
  assert.throws(() => foPrompt(task, 'book'), /Approve a specific option/);
  const started = applyAction(task, { type: 'start' });
  const quoted = applyAction(started, { type: 'add_option', vendor: 'Print shop', price: 25 });
  const approved = applyAction(quoted, { type: 'approve', optionId: quoted.options[0].id });
  const prompt = foPrompt(approved, 'book', approved.options[0]);
  assert.match(prompt, /Print shop/);
  assert.match(prompt, /no more than \$25\.00/);
  assert.match(prompt, /If anything changes, stop and ask for new approval/);
});

test('A live Fo response preserves conversation identity without claiming completion', () => {
  const task = createTask({ title: 'Print one poster', description: 'Downtown pickup' });
  const sent = recordFoExchange(task, { intent: 'research', prompt: foPrompt(task, 'research'), reply: { text: 'Shop A can print by 3 pm.', status: 'working', conversationId: 'conversation-123' } });
  assert.equal(sent.status, 'working');
  assert.equal(sent.fo.externalId, 'conversation-123');
  assert.equal(sent.booking, null);
  assert.equal(sent.receipt, null);
  assert.equal(sent.events.at(-1).mode, 'live');
  const reply = recordFoReply(sent, { text: 'Shop B has no availability.', status: 'complete', conversationId: 'conversation-123' });
  assert.equal(reply.events.at(-1).conversationId, 'conversation-123');
  assert.equal(reply.status, 'working');
  assert.equal(recordFoReply(reply, { text: 'Shop B has no availability.', status: 'complete', conversationId: 'conversation-123' }), reply);
});
