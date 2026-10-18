import test from 'node:test';
import assert from 'node:assert/strict';
import { vaultKey, sealFoConnection, openFoConnection } from './fo-vault.mjs';

test('Fo connection vault round-trips without storing token plaintext', () => {
  const key = vaultKey('workspace-password', 'unique-user-salt');
  const connection = { tokens: { access_token: 'private-fo-token' }, tools: [{ name: 'ask_fo' }] };
  const sealed = sealFoConnection(connection, key);
  assert.deepEqual(openFoConnection(sealed, key), connection);
  assert.equal(JSON.stringify(sealed).includes('private-fo-token'), false);
  assert.throws(() => openFoConnection(sealed, vaultKey('other-password', 'unique-user-salt')));
  assert.throws(() => openFoConnection({ ...sealed, data: 'AAAA' }, key));
});
