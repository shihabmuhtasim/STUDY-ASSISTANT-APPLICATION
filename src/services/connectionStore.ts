import type { CustomAIConnection } from '../types';
import { firebaseAuth } from './auth';

async function request(path: string, init: RequestInit = {}) {
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error('Sign in again to manage AI connections.');
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${await user.getIdToken()}`,
      ...init.headers,
    },
  });
  const data = await response.json().catch(() => ({})) as { error?: string; connections?: CustomAIConnection[]; connection?: CustomAIConnection };
  if (!response.ok) throw new Error(data.error || 'The AI connection request failed.');
  return data;
}

export async function loadSavedConnections() {
  return (await request('/api/user/connections')).connections || [];
}

export async function saveEncryptedConnection(connection: CustomAIConnection) {
  const data = await request('/api/user/connections', { method: 'POST', body: JSON.stringify({ connection }) });
  if (!data.connection) throw new Error('The saved connection was not returned.');
  return data.connection;
}

export async function deleteEncryptedConnection(id: string) {
  await request('/api/user/connections', { method: 'DELETE', body: JSON.stringify({ id }) });
}
