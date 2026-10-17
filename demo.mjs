import { createTask, applyAction } from './workflow.mjs';

const demo = { actor: 'Fo demo', mode: 'demo' };

export function createDemoWorkspace() {
  const repair = createTask({
    title: 'Fix the office projector', category: 'repair', priority: 'urgent', budget: 180,
    description: 'Screen flickers during presentations. Find someone available this week. Ask before booking.'
  }, { type: 'demo' });
  let a = applyAction(repair, { type: 'start', note: 'Simulated: Fo called local repair shops and asked for availability.', channel: 'call', ...demo });
  a = applyAction(a, { type: 'message', party: 'Demo Device Clinic', direction: 'inbound', note: 'We can visit tomorrow between 2 and 4 PM. Diagnostics are included.', channel: 'call', ...demo });
  a = applyAction(a, { type: 'add_option', vendor: 'Demo Device Clinic', price: 145, availability: 'Tomorrow, 2–4 PM', details: 'Diagnostics and on-site visit. Simulated quote.', channel: 'call', ...demo });
  a = applyAction(a, { type: 'message', party: 'Demo AV Rescue', direction: 'inbound', note: 'Friday at 9 AM is open. Replacement cable is included.', channel: 'email', ...demo });
  a = applyAction(a, { type: 'add_option', vendor: 'Demo AV Rescue', price: 175, availability: 'Friday, 9 AM', details: 'Includes replacement cable. Simulated quote.', channel: 'call', ...demo });
  a.mode = 'demo';

  const lunch = createTask({
    title: 'Arrange team lunch for 12', category: 'event', priority: 'normal', budget: 250,
    description: 'Vegetarian options needed. Delivery by noon. Collect a quote and ask before ordering.'
  }, { type: 'demo' });
  let b = applyAction(lunch, { type: 'start', note: 'Simulated: Fo emailed caterers and gathered dietary requirements.', nextFollowUp: new Date(Date.now() - 60_000).toISOString(), channel: 'email', ...demo });
  b = applyAction(b, { type: 'message', party: 'Demo Lunch Studio', direction: 'outbound', note: 'Asked for a vegetarian-friendly menu and delivery before noon.', channel: 'email', ...demo });
  b.mode = 'demo';

  const supplies = createTask({
    title: 'Restock the office fridge', category: 'purchase', priority: 'normal', budget: 90,
    description: 'Water, sparkling drinks, fruit, and snacks for the Monday meeting.'
  }, { type: 'demo' });
  let c = applyAction(supplies, { type: 'start', note: 'Simulated: Fo compared local grocery delivery options.', channel: 'web', ...demo });
  c = applyAction(c, { type: 'add_option', vendor: 'Demo Market Delivery', price: 78, availability: 'Monday, 8–9 AM', details: 'All requested items in stock. Simulated quote.', channel: 'web', ...demo });
  c = applyAction(c, { type: 'approve', optionId: c.options[0].id, actor: 'Demo team member', mode: 'demo', channel: 'human' });
  c = applyAction(c, { type: 'book', confirmation: 'DEMO-ORDER-248 (simulated)', channel: 'purchase', ...demo });
  c.mode = 'demo';
  return [a, b, c];
}

export function demoActionFor(task) {
  const preset = {
    repair: { vendor: 'Demo Device Clinic', price: 145, availability: 'Tomorrow, 2–4 PM', details: 'Simulated quote after a vendor call.' },
    event: { vendor: 'Demo Lunch Studio', price: 210, availability: 'Tomorrow, noon', details: 'Vegetarian options included. Simulated email quote.' },
    purchase: { vendor: 'Demo Market Delivery', price: 78, availability: 'Monday, 8–9 AM', details: 'Simulated delivery quote.' },
    other: { vendor: 'Demo Provider', price: 120, availability: 'Tomorrow', details: 'Simulated option.' }
  }[task.category || 'other'];
  if (task.status === 'new') return { type: 'start', note: 'Simulated: Fo began researching and contacting providers.', channel: task.category === 'event' ? 'email' : task.category === 'repair' ? 'call' : 'web', ...demo };
  if (task.status === 'working') return { type: 'add_option', ...preset, channel: task.category === 'event' ? 'email' : task.category === 'repair' ? 'call' : 'web', ...demo };
  if (task.status === 'approved') return { type: 'book', confirmation: 'DEMO-CONFIRMATION-001 (simulated)', channel: task.category === 'purchase' ? 'purchase' : 'web', ...demo };
  return null;
}
