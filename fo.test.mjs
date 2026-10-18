import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, applyAction, recordFoExchange, recordFoReply } from './workflow.mjs';
import { foPrompt } from './fo-prompt.mjs';
import { askFoArguments } from './fo.mjs';

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
  assert.throws(() => recordFoReply(sent, { text: 'Unrelated result', status: 'complete', conversationId: 'conversation-456' }), /different conversation/);
  assert.throws(() => recordFoExchange(sent, { intent: 'message', prompt: 'Continue', reply: { text: 'Unrelated result', status: 'complete', conversationId: 'conversation-456' } }), /different conversation/);
});

test('each task starts an isolated Fo conversation and follow-ups use its exact ID', () => {
  const schema = { message: {}, conversationId: {}, newConversation: {} };
  assert.deepEqual(askFoArguments('Find quotes', null, schema), { message: 'Find quotes', newConversation: true });
  assert.deepEqual(askFoArguments('Yes, send both', 'conversation-123', schema), { message: 'Yes, send both', conversationId: 'conversation-123' });
  assert.throws(() => askFoArguments('Find quotes', null, { message: {} }), /isolated conversation/);
  assert.throws(() => askFoArguments('Continue', 'conversation-123', { message: {} }), /explicit conversation ID/);
});
