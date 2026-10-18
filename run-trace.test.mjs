import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, recordFoExchange, applyAction } from './workflow.mjs';
import { exportRunTrace, recordMcpCall, runStats } from './run-trace.mjs';

test('run trace records exact app MCP calls and redacts contact details', () => {
  const task = createTask({ title: 'Get a print quote' });
  task.ownerId = 'owner-a';
  const reply = { status: 'complete', text: 'Sent to print@example.com. Call +1 415 555 1212.', conversationId: 'private-conversation' };
  const updated = recordMcpCall(recordFoExchange(task, { intent: 'research', prompt: 'Email print@example.com', reply }), {
    tool: 'ask_fo', intent: 'research', message: 'Email print@example.com by 2026-10-19', reply,
    startedAt: '2026-10-18T15:00:00.000Z', finishedAt: '2026-10-18T15:00:02.000Z'
  });
  const trace = exportRunTrace(updated);
  assert.equal(trace.calls[0].tool, 'ask_fo');
  assert.equal(trace.calls[0].durationMs, 2000);
  assert.equal(trace.calls[0].arguments.conversation, 'new');
  assert.match(trace.calls[0].arguments.message, /\[email\]/);
  assert.match(trace.calls[0].arguments.message, /2026-10-19/);
  assert.doesNotMatch(JSON.stringify(trace), /print@example\.com|private-conversation|415 555 1212|owner-a/);
  assert.equal(trace.outcome, 'not verified');
  assert.deepEqual(runStats([updated]), { runs: 1, verified: 0, inProgress: 1 });
  const followup = recordMcpCall(updated, { tool: 'ask_fo', intent: 'recover', message: 'Check again', reply, requestConversationId: 'private-conversation' });
  assert.equal(exportRunTrace(followup).calls[1].arguments.conversation, 'existing');
});

test('legacy runs are labeled partial and failed attempts count without false success', () => {
  const task = createTask({ title: 'Get a quote', doneWhen: 'A person verifies the print quote.' });
  const legacy = recordFoExchange(task, { intent: 'research', prompt: 'Find a quote', reply: { status: 'working', text: 'Still working', conversationId: 'abc' } });
  assert.match(exportRunTrace(legacy).limitations[0], /predates exact MCP call logging/);
  const continued = recordMcpCall(legacy, { tool: 'get_fo_reply', intent: 'check', reply: { status: 'complete', text: 'Quote arrived', conversationId: 'abc' }, startedAt: '2026-10-19T15:00:00.000Z' });
  assert.deepEqual(exportRunTrace(continued).calls.map(call => call.tool), ['ask_fo', 'unattributed Fo response', 'get_fo_reply']);
  const failed = recordMcpCall(createTask({ title: 'Retry' }), { tool: 'ask_fo', intent: 'research', message: 'Find a quote', error: new Error('Timeout') });
  assert.equal(runStats([legacy, failed]).runs, 2);
  assert.equal(runStats([legacy, failed]).verified, 0);
  const quoted = applyAction(legacy, { type: 'add_option', vendor: 'Shop', price: 20 });
  const approved = applyAction(quoted, { type: 'approve', optionId: quoted.options[0].id });
  const booked = applyAction(approved, { type: 'book', confirmation: 'Confirmation #123' });
  const completed = applyAction(booked, { type: 'complete', evidence: 'Photo of collected print', verified: true });
  assert.deepEqual(runStats([completed, failed]), { runs: 2, verified: 1, inProgress: 1 });
});
