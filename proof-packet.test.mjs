import test from 'node:test';
import assert from 'node:assert/strict';
import { createTask, applyAction, recordFoExchange } from './workflow.mjs';
import { recordMcpCall } from './run-trace.mjs';
import { exportProofPacket } from './proof-packet.mjs';

test('quote-only Fo task can be verified without a booking and exports a sourced proof packet', () => {
  let task = createTask({ title: 'Get quote from print@example.com', doneWhen: 'A vendor sends an itemized written quote that a person checks.' });
  const reply = { text: 'Quote request sent to print@example.com', status: 'complete', conversationId: 'private-conversation' };
  task = recordMcpCall(recordFoExchange(task, { intent: 'research', prompt: 'Request quote from print@example.com', reply }), { tool: 'ask_fo', intent: 'research', message: 'Request quote from print@example.com', reply });
  task = applyAction(task, { type: 'message', direction: 'inbound', party: 'Print shop', channel: 'email', note: 'Quoted $27, including tax. Ready Monday.' });
  task = applyAction(task, { type: 'complete', evidence: 'I checked the written $27 quote.', verified: true, actor: 'Owner' });
  assert.equal(task.status, 'completed');
  assert.equal(task.booking, null);
  const packet = exportProofPacket(task);
  assert.equal(packet.evidenceState.foReports, 1);
  assert.equal(packet.evidenceState.providerRepliesLogged, 1);
  assert.equal(packet.evidenceState.humanVerified, true);
  assert.equal(packet.evidenceState.bookingRecorded, false);
  assert.equal(packet.mcpTrace.calls[0].tool, 'ask_fo');
  assert.doesNotMatch(JSON.stringify(packet), /print@example\.com|private-conversation/);
  assert.match(packet.limitations.at(-1), /owner logs/);
});

test('real completion needs a defined outcome and human evidence', () => {
  let task = createTask({ title: 'Get a quote' });
  task = applyAction(task, { type: 'start' });
  assert.throws(() => applyAction(task, { type: 'complete', evidence: 'A quote arrived', verified: true }), /Define the real-world outcome/);
  task = applyAction(task, { type: 'edit', title: task.title, doneWhen: 'A vendor provides a written quote.' });
  assert.throws(() => applyAction(task, { type: 'complete', evidence: 'A quote arrived' }), /person checked/);
});
