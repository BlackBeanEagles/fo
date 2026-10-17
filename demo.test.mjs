import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoWorkspace, demoActionFor } from './demo.mjs';

test('demo workspace showcases distinct workflows without claiming real actions', () => {
  const tasks = createDemoWorkspace();
  assert.deepEqual(tasks.map(task => task.category), ['repair', 'event', 'purchase']);
  assert.deepEqual(tasks.map(task => task.status), ['awaiting_approval', 'working', 'booked']);
  assert.ok(tasks.every(task => task.mode === 'demo' && task.source.type === 'demo'));
  assert.ok(tasks.flatMap(task => task.events).filter(event => event.actor === 'Fo demo').every(event => event.mode === 'demo'));
  assert.ok(tasks.flatMap(task => task.events).some(event => event.channel === 'call'));
  assert.ok(tasks.flatMap(task => task.events).some(event => event.channel === 'email'));
  assert.ok(tasks.flatMap(task => task.events).some(event => event.channel === 'purchase'));
});

test('next demo action stays simulated', () => {
  const [, lunch] = createDemoWorkspace();
  const action = demoActionFor(lunch);
  assert.equal(action.mode, 'demo');
  assert.equal(action.channel, 'email');
});
