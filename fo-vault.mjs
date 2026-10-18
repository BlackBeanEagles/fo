import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

export function vaultKey(password, userSalt) {
  return scryptSync(password, `proof-of-done-fo:${userSalt}`, 32);
}

export function sealFoConnection(connection, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(connection), 'utf8'), cipher.final()]);
  return { version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function openFoConnection(envelope, key) {
  if (envelope?.version !== 1) throw new Error('Unsupported Fo connection format.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
}
