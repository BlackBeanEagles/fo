import { exportRunTrace, redact } from './run-trace.mjs';

const usableFoReport = event => event.kind === 'fo_reply' && event.mode === 'live'
  && !!String(event.text || '').trim()
  && !/^The run finished without a textual reply\.?$/i.test(String(event.text || '').trim())
  && !/^Fo is still working on this\. Call get_fo_reply now;/i.test(String(event.text || '').trim());

export function exportProofPacket(task) {
  if (task.mode === 'demo') throw new Error('Simulated tasks have no real proof packet.');
  const trace = exportRunTrace(task);
  const providerReplies = (task.events || []).filter(event => event.kind === 'message' && event.direction === 'inbound');
  const foReports = (task.events || []).filter(usableFoReport);
  const ownerImportedFoReplies = (task.events || []).filter(event => event.kind === 'fo_web_import');
  const approved = task.options?.find(option => option.id === task.approvedOptionId) || null;
  const verified = task.status === 'completed' && task.receipt?.verifiedByHuman === true;
  const milestones = (task.events || []).map(event => ({
    at: event.at,
    kind: event.kind,
    source: event.kind === 'fo_web_import' ? 'Wajo web reply imported by owner' : event.kind === 'fo_reply' ? usableFoReport(event) ? 'Fo MCP report' : 'Fo MCP status only' : event.kind === 'message' && event.direction === 'inbound' ? 'Provider reply logged by owner' : event.kind === 'complete' ? 'Human attestation' : 'Workspace record',
    summary: redact(event.text)
  }));
  return {
    format: 'proof-of-done-packet-v1',
    generatedAt: new Date().toISOString(),
    task: { id: task.id, title: redact(task.title), status: task.status, source: task.source?.type || 'app' },
    outcomeContract: redact(task.doneWhen || ''),
    evidenceState: {
      foReports: foReports.length,
      ownerImportedFoReplies: ownerImportedFoReplies.length,
      providerRepliesLogged: providerReplies.length,
      quotes: (task.options || []).map(option => ({ vendor: redact(option.vendor), price: option.price, availability: redact(option.availability), source: redact(option.source || 'Owner entered'), receivedAt: option.receivedAt || null, providerExcerpt: redact(option.sourceMessage || ''), originalImageAttached: !!option.evidenceFile, originalLinkLogged: !!option.sourceUrl, ownerEntered: true })),
      approvedOption: approved ? { vendor: redact(approved.vendor), price: approved.price, availability: redact(approved.availability), source: redact(approved.source || 'Owner entered; original not attached') } : null,
      bookingRecorded: !!task.booking,
      humanVerified: verified,
      photoAttached: !!task.receipt?.photoFile
    },
    humanCheck: verified ? { at: task.receipt.at, evidence: redact(task.receipt.evidence) } : null,
    milestones,
    mcpTrace: trace,
    limitations: [...trace.limitations, 'Wajo web replies and provider evidence are owner logs, not fetched or authenticated by this app. Image contents and original links are not included in this export. Contact patterns are masked, but review this packet before sharing.']
  };
}
