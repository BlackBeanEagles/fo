import { randomUUID } from 'node:crypto';

const supportedTools = new Set(['ask_fo', 'get_fo_reply']);

function redact(value) {
  return String(value ?? '')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, match => (match.match(/\d/g) || []).length >= 10 ? '[phone]' : match);
}

export function recordMcpCall(task, { tool, intent, message, reply, error, startedAt, finishedAt, requestConversationId }) {
  if (!supportedTools.has(tool)) throw new Error('Unsupported Fo tool.');
  const next = structuredClone(task);
  const start = new Date(startedAt || Date.now());
  const end = new Date(finishedAt || Date.now());
  next.mcpCalls = [...(next.mcpCalls || []), {
    id: randomUUID(), tool, intent: String(intent || ''),
    startedAt: start.toISOString(), finishedAt: end.toISOString(),
    durationMs: Math.max(0, end.getTime() - start.getTime()),
    message: tool === 'ask_fo' ? String(message || '').slice(0, 8000) : null,
    requestConversation: requestConversationId ? 'existing' : 'new',
    conversationId: reply?.conversationId || task.fo?.externalId || null,
    resultStatus: error ? 'error' : String(reply?.status || 'reply_received'),
    result: error ? String(error.message || error).slice(0, 500) : String(reply?.text || '').slice(0, 12000),
    source: 'app_mcp'
  }];
  return next;
}

export function runStats(tasks) {
  const realRuns = tasks.filter(task => task.mode !== 'demo' && (task.events?.some(event => event.kind === 'fo_request' && event.mode === 'live') || task.mcpCalls?.some(call => call.tool === 'ask_fo')));
  return {
    runs: realRuns.length,
    verified: realRuns.filter(task => task.status === 'completed' && task.receipt?.evidence && task.receipt?.verifiedByHuman === true).length,
    inProgress: realRuns.filter(task => !['completed', 'cancelled'].includes(task.status)).length
  };
}

export function exportRunTrace(task) {
  const firstExactCall = task.mcpCalls?.[0]?.startedAt || null;
  const legacyEvents = (task.events || []).filter(event => ['fo_request', 'fo_reply'].includes(event.kind) && (!firstExactCall || event.at < firstExactCall));
  const legacyCalls = legacyEvents.length > 0;
  const historical = legacyEvents.map(event => ({
    tool: event.kind === 'fo_request' ? 'ask_fo' : 'unattributed Fo response',
    intent: event.intent || null, startedAt: event.at,
    arguments: event.kind === 'fo_request' ? { message: redact(event.text), conversation: 'new or existing' } : null,
    resultStatus: 'not recorded', result: event.kind === 'fo_reply' ? redact(event.text) : null,
    source: 'legacy_task_event'
  }));
  const exact = (task.mcpCalls || []).map(call => ({
        tool: call.tool, intent: call.intent, startedAt: call.startedAt,
        durationMs: call.durationMs, arguments: call.tool === 'ask_fo'
          ? { message: redact(call.message), conversation: call.requestConversation || 'unknown' }
          : { conversation: '[task conversation]' },
        resultStatus: call.resultStatus, result: redact(call.result), source: call.source
      }));
  const calls = [...historical, ...exact];
  return {
    format: 'proof-of-done-run-trace-v1',
    task: { id: task.id, title: task.title, status: task.status, mode: task.mode },
    outcome: task.status === 'completed' && task.receipt?.evidence && task.receipt?.verifiedByHuman === true ? 'human verified' : 'not verified',
    calls,
    limitations: legacyCalls
      ? ['This run predates exact MCP call logging. Fo responses recorded by the app are shown, but later tool names and the direct Wajo chat approval cannot be reconstructed from these events.', 'Fo internal email and phone tool calls are not exposed by this app. Vendor actions are Fo-reported until independently verified.']
      : ['This is the app-to-Fo MCP trace. Fo internal email and phone tool calls are not exposed by this app. Vendor actions are Fo-reported until independently verified.']
  };
}
