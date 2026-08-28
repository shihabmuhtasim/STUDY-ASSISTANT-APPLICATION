import type { StudyDocument } from '../types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_SESSION_KEY = 'study-assistant-drive-session';

interface DriveSession {
  userId: string;
  accessToken: string;
  expiresAt: number;
}

function authHeaders(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}

export function saveDriveSession(userId: string, accessToken: string) {
  const session: DriveSession = { userId, accessToken, expiresAt: Date.now() + 50 * 60 * 1_000 };
  window.sessionStorage.setItem(DRIVE_SESSION_KEY, JSON.stringify(session));
}

export function loadDriveSession(userId: string) {
  try {
    const session = JSON.parse(window.sessionStorage.getItem(DRIVE_SESSION_KEY) || 'null') as DriveSession | null;
    if (!session || session.userId !== userId || session.expiresAt <= Date.now()) {
      window.sessionStorage.removeItem(DRIVE_SESSION_KEY);
      return null;
    }
    return session.accessToken;
  } catch {
    window.sessionStorage.removeItem(DRIVE_SESSION_KEY);
    return null;
  }
}

export function clearDriveSession() {
  window.sessionStorage.removeItem(DRIVE_SESSION_KEY);
}

export async function validateDriveToken(accessToken: string) {
  const response = await fetch(`${DRIVE_API}/about?fields=user(emailAddress)`, { headers: authHeaders(accessToken) });
  return response.ok;
}

export async function documentBlob(document: StudyDocument) {
  if (document.fileData instanceof Blob) return document.fileData;
  const response = await fetch(document.fileData);
  return response.blob();
}

export async function uploadDocumentToDrive(document: StudyDocument, accessToken: string) {
  const blob = await documentBlob(document);
  const metadata = {
    name: document.originalFileName || `${document.title}.pdf`,
    mimeType: blob.type || 'application/pdf',
    appProperties: { studyAssistantId: document.id },
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const url = document.driveFileId
    ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(document.driveFileId)}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime`
    : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime`;
  const response = await fetch(url, {
    method: document.driveFileId ? 'PATCH' : 'POST',
    headers: authHeaders(accessToken),
    body: form,
  });
  if (!response.ok) throw new Error(`Google Drive upload failed (${response.status}).`);
  return response.json() as Promise<{ id: string; name: string; mimeType: string; size?: string }>;
}

export async function downloadDocumentFromDrive(fileId: string, accessToken: string) {
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) throw new Error(`Google Drive download failed (${response.status}).`);
  return response.blob();
}

export async function deleteDocumentFromDrive(fileId: string, accessToken: string) {
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  if (!response.ok && response.status !== 404) throw new Error(`Google Drive deletion failed (${response.status}).`);
}
