import { env } from 'cloudflare:workers';
import type { CustomAIConnection } from '../src/types';
import type { VerifiedFirebaseUser } from './firebaseUser';

const PROJECT_ID = 'ai-pdf-study-assistant';
const FIRESTORE_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

interface StoredConnection {
  connection: CustomAIConnection;
  encryptedApiKey: string;
}

function documentUrl(userId: string, connectionId?: string) {
  const base = `${FIRESTORE_ROOT}/users/${encodeURIComponent(userId)}/aiConnections`;
  return connectionId ? `${base}/${encodeURIComponent(connectionId)}` : base;
}

function headers(user: VerifiedFirebaseUser) {
  return { authorization: `Bearer ${user.idToken}`, 'content-type': 'application/json' };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  if (!env.USER_DATA_ENCRYPTION_KEY) throw new Error('USER_DATA_ENCRYPTION_KEY is not configured.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(env.USER_DATA_ENCRYPTION_KEY));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptApiKey(apiKey: string, owner: string, connectionId: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: new TextEncoder().encode(`${owner}:${connectionId}`),
  }, await encryptionKey(), new TextEncoder().encode(apiKey));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return bytesToBase64(combined);
}

async function decryptApiKey(value: string, owner: string, connectionId: string) {
  const combined = base64ToBytes(value);
  if (combined.length < 29) throw new Error('Stored API key is invalid.');
  const decrypted = await crypto.subtle.decrypt({
    name: 'AES-GCM',
    iv: combined.slice(0, 12),
    additionalData: new TextEncoder().encode(`${owner}:${connectionId}`),
  }, await encryptionKey(), combined.slice(12));
  return new TextDecoder().decode(decrypted);
}

function decodeDocument(data: unknown): StoredConnection | null {
  const fields = (data as { fields?: Record<string, { stringValue?: string }> })?.fields;
  if (!fields?.payload?.stringValue || !fields.encryptedApiKey?.stringValue) return null;
  try {
    return {
      connection: JSON.parse(fields.payload.stringValue) as CustomAIConnection,
      encryptedApiKey: fields.encryptedApiKey.stringValue,
    };
  } catch {
    return null;
  }
}

export async function listConnections(user: VerifiedFirebaseUser) {
  const response = await fetch(documentUrl(user.uid), { headers: headers(user) });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Could not load connections (${response.status}).`);
  const data = await response.json() as { documents?: unknown[] };
  return (data.documents || []).map(decodeDocument).filter(Boolean).map((stored) => stored!.connection);
}

export async function getStoredConnection(user: VerifiedFirebaseUser, connectionId: string) {
  const response = await fetch(documentUrl(user.uid, connectionId), { headers: headers(user) });
  if (!response.ok) return null;
  return decodeDocument(await response.json());
}

export async function saveConnection(user: VerifiedFirebaseUser, connection: CustomAIConnection) {
  const existing = await getStoredConnection(user, connection.id);
  const suppliedKey = connection.apiKey?.trim();
  if (!suppliedKey && !existing) throw new Error('An API key is required.');
  const encryptedApiKey = suppliedKey
    ? await encryptApiKey(suppliedKey, user.uid, connection.id)
    : existing!.encryptedApiKey;
  const keyHint = suppliedKey ? suppliedKey.slice(-4) : existing!.connection.keyHint;
  const safeConnection: CustomAIConnection = {
    id: connection.id,
    name: connection.name,
    service: connection.service,
    provider: connection.provider,
    model: connection.model,
    apiKey: '',
    ...(connection.baseUrl ? { baseUrl: connection.baseUrl } : {}),
    keyHint,
    isStored: true,
  };
  const response = await fetch(documentUrl(user.uid, connection.id), {
    method: 'PATCH',
    headers: headers(user),
    body: JSON.stringify({ fields: {
      payload: { stringValue: JSON.stringify(safeConnection) },
      encryptedApiKey: { stringValue: encryptedApiKey },
      updatedAt: { timestampValue: new Date().toISOString() },
    } }),
  });
  if (!response.ok) throw new Error(`Could not save connection (${response.status}).`);
  return safeConnection;
}

export async function removeConnection(user: VerifiedFirebaseUser, connectionId: string) {
  const response = await fetch(documentUrl(user.uid, connectionId), { method: 'DELETE', headers: headers(user) });
  if (!response.ok && response.status !== 404) throw new Error(`Could not delete connection (${response.status}).`);
}

export async function connectionWithDecryptedKey(user: VerifiedFirebaseUser, connectionId: string) {
  const stored = await getStoredConnection(user, connectionId);
  if (!stored) return null;
  return {
    ...stored.connection,
    apiKey: await decryptApiKey(stored.encryptedApiKey, user.uid, connectionId),
  };
}
