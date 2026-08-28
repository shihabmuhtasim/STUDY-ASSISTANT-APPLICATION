import type { StudyDocument } from '../types';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

function authHeaders(accessToken: string) {
  return { authorization: `Bearer ${accessToken}` };
}

export async function documentBlob(document: StudyDocument) {
  if (document.fileData instanceof Blob) return document.fileData;
  const response = await fetch(document.fileData);
  return response.blob();
}

export async function uploadDocumentToDrive(document: StudyDocument, accessToken: string) {
  const blob = await documentBlob(document);
  const metadata = {
    name: `${document.title}.pdf`,
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
