import { randomUUID } from 'node:crypto';

const closed = new Set(['completed', 'cancelled']);

export function dueForFollowUp(task, now = Date.now()) {
  return Boolean(task.ownerId && task.nextFollowUp && !closed.has(task.status) &&
    task.followUpAlertedFor !== task.nextFollowUp &&
    new Date(task.nextFollowUp).getTime() <= now);
}

export function recordFollowUpDue(task, now = new Date()) {
  const next = structuredClone(task);
  next.followUpAlertedFor = task.nextFollowUp;
  next.updatedAt = now.toISOString();
  next.events.push({
    id: randomUUID(), at: now.toISOString(), actor: 'system', kind: 'followup_due',
    text: task.autoFollowUp ? 'Authorized Fo follow-up is due.' : 'Follow-up reminder is due. Review the latest reply and take the next step.',
    mode: 'system', channel: null
  });
  return next;
}
