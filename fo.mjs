import { randomBytes } from 'node:crypto';
import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const serverUrl = new URL('https://mcp.api.wajo.ai/fo');
const connections = new Map();
const pending = new Map();
const ttl = 10 * 60 * 1000;

export function connectionStatus(userId) {
  const record = connections.get(userId);
  return { connected: !!record?.verified, pending: !!record?.authorizationUrl, tools: record?.tools || [] };
}

export function exportFoConnection(userId) {
  const record = connections.get(userId);
  if (!record?.verified || !record.tokens) return null;
  return {
    redirectUrl: record.redirectUrl.href,
    tokens: record.tokens,
    clientInformation: record.clientInformation,
    tools: record.tools
  };
}

export function restoreFoConnection(userId, saved) {
  if (!saved?.tokens || !saved?.redirectUrl || !Array.isArray(saved.tools)) throw new Error('Saved Fo connection is incomplete.');
  const redirectUrl = new URL(saved.redirectUrl);
  if (!['127.0.0.1', 'localhost'].includes(redirectUrl.hostname) || redirectUrl.pathname !== '/api/fo/callback') throw new Error('Saved Fo redirect is invalid.');
  connections.set(userId, {
    state: null, startedAt: 0, redirectUrl, tokens: saved.tokens,
    clientInformation: saved.clientInformation || null, verifier: null,
    authorizationUrl: null, verified: true, tools: saved.tools
  });
}

export async function beginFoConnection(userId, redirectUrl) {
  const state = randomBytes(32).toString('base64url');
  const record = { state, startedAt: Date.now(), redirectUrl: new URL(redirectUrl), tokens: null, clientInformation: null, verifier: null, authorizationUrl: null, verified: false, tools: [] };
  connections.set(userId, record);
  pending.set(state, userId);
  const result = await auth(provider(record), { serverUrl });
  if (result !== 'REDIRECT' || !record.authorizationUrl) throw new Error('Fo did not provide an authorization page.');
  return record.authorizationUrl;
}

export async function completeFoConnection(state, code) {
  const userId = pending.get(state);
  const record = userId && connections.get(userId);
  pending.delete(state);
  if (!record || record.state !== state || Date.now() - record.startedAt > ttl || !code) throw new Error('Fo authorization expired. Start the connection again.');
  await auth(provider(record), { serverUrl, authorizationCode: code });
  record.authorizationUrl = null;
  record.verifier = null;
  record.state = null;
  await withClient(userId, async client => {
    const list = await client.listTools();
    record.tools = list.tools.map(tool => ({ name: tool.name, description: tool.description || '' }));
    if (!list.tools.some(tool => tool.name === 'ask_fo')) throw new Error('This Fo account did not expose ask_fo. Check hackathon MCP access.');
  });
  record.verified = true;
  return userId;
}

export function disconnectFo(userId) {
  const record = connections.get(userId);
  if (record?.state) pending.delete(record.state);
  connections.delete(userId);
}

function provider(record) {
  return {
    get redirectUrl() { return record.redirectUrl; },
    get clientMetadata() { return {
      client_name: 'Proof of Done',
      redirect_uris: [record.redirectUrl.href],
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: 'mcp'
    }; },
    state: () => record.state,
    clientInformation: () => record.clientInformation,
    saveClientInformation: info => { record.clientInformation = info; },
    tokens: () => record.tokens,
    saveTokens: tokens => { record.tokens = tokens; },
    redirectToAuthorization: url => { record.authorizationUrl = url.href; },
    saveCodeVerifier: verifier => { record.verifier = verifier; },
    codeVerifier: () => record.verifier
  };
}

async function withClient(userId, callback) {
  const record = connections.get(userId);
  if (!record?.tokens) throw new Error('Connect your Fo account first.');
  const client = new Client({ name: 'proof-of-done', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(serverUrl, { authProvider: provider(record) });
  try {
    await client.connect(transport);
    return await callback(client);
  } finally {
    await client.close().catch(() => {});
  }
}

function responseOf(result) {
  const parts = (result.content || []).filter(item => item.type === 'text').map(item => item.text);
  const raw = parts.join('\n');
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  if (result.isError) throw new Error(raw.slice(0, 500) || 'Fo returned an error.');
  const value = parsed?.structuredContent || result.structuredContent || parsed || {};
  return {
    text: String(value.response || value.reply || value.message || raw).slice(0, 12000),
    status: String(value.status || ''),
    conversationId: String(value.conversationId || value.conversation_id || value.conversation?.id || '').slice(0, 200) || null
  };
}

export function askFoArguments(message, conversationId, properties) {
  const args = { message };
  if (conversationId) {
    if (!('conversationId' in properties)) throw new Error('Fo does not support an explicit conversation ID. Reconnect before continuing this task.');
    args.conversationId = conversationId;
  } else {
    if (!('newConversation' in properties)) throw new Error('Fo does not support starting an isolated conversation. Reconnect before creating a new task.');
    args.newConversation = true;
  }
  return args;
}

export async function askFo(userId, message, conversationId = null) {
  if (!message || message.length > 8000) throw new Error('Enter a Fo request under 8,000 characters.');
  return withClient(userId, async client => {
    const list = await client.listTools();
    const tool = list.tools.find(item => item.name === 'ask_fo');
    if (!tool) throw new Error('Fo did not expose ask_fo. Reconnect and check your MCP access.');
    const args = askFoArguments(message, conversationId, tool.inputSchema?.properties || {});
    return responseOf(await client.callTool({ name: tool.name, arguments: args }));
  });
}

export async function getFoReply(userId, conversationId) {
  if (!conversationId) throw new Error('No Fo conversation exists for this task.');
  return withClient(userId, async client => {
    const list = await client.listTools();
    const tool = list.tools.find(item => item.name === 'get_fo_reply');
    if (!tool) throw new Error('Fo did not expose get_fo_reply.');
    const properties = tool.inputSchema?.properties || {};
    const key = ['conversationId', 'conversation_id', 'id'].find(item => item in properties);
    if (!key) throw new Error('Fo reply tool does not describe a conversation ID argument.');
    const result = await client.callTool({ name: tool.name, arguments: { [key]: conversationId } });
    return responseOf(result);
  });
}
