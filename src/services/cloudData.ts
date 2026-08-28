import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { firestore } from './auth';
import type { AIModelPreference, AnnotationStroke, PageNote, StudyDocument } from '../types';

export interface CloudDocumentMetadata {
  id: string;
  title: string;
  sourceFormat?: string;
  originalFileName?: string;
  driveFileId?: string;
  mimeType?: string;
  fileSize?: number;
  totalPages: number;
  createdAt: number;
  updatedAt: number;
}

export interface CloudPreferences {
  modelPreference: AIModelPreference;
  allowFallback: boolean;
  selectedConnectionId: string | null;
}

function clean<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function documentMetadata(document: StudyDocument): CloudDocumentMetadata {
  return clean({
    id: document.id,
    title: document.title,
    sourceFormat: document.sourceFormat,
    originalFileName: document.originalFileName,
    driveFileId: document.driveFileId,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    totalPages: document.totalPages,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  });
}

export async function saveCloudDocument(userId: string, document: StudyDocument) {
  await setDoc(doc(firestore, 'users', userId, 'documents', document.id), {
    ...documentMetadata(document),
    syncedAt: serverTimestamp(),
  }, { merge: true });
}

export async function loadCloudDocuments(userId: string) {
  const snapshot = await getDocs(collection(firestore, 'users', userId, 'documents'));
  return snapshot.docs.map((item) => item.data() as CloudDocumentMetadata);
}

export async function deleteCloudDocument(userId: string, documentId: string) {
  const pages = await getDocs(collection(firestore, 'users', userId, 'documents', documentId, 'pages'));
  const batch = writeBatch(firestore);
  pages.forEach((page) => batch.delete(page.ref));
  batch.delete(doc(firestore, 'users', userId, 'documents', documentId));
  await batch.commit();
}

export async function saveCloudPage(
  userId: string,
  documentId: string,
  pageNumber: number,
  note: PageNote,
  annotations: AnnotationStroke[],
) {
  await setDoc(doc(firestore, 'users', userId, 'documents', documentId, 'pages', String(pageNumber)), {
    pageNumber,
    note: clean(note),
    annotations: clean(annotations),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function loadCloudWorkspace(userId: string, documentId: string) {
  const snapshot = await getDocs(collection(firestore, 'users', userId, 'documents', documentId, 'pages'));
  const notes: Record<number, PageNote> = {};
  const annotations: Record<number, AnnotationStroke[]> = {};
  snapshot.forEach((item) => {
    const data = item.data() as { pageNumber?: number; note?: PageNote; annotations?: AnnotationStroke[] };
    const pageNumber = Number(data.pageNumber || item.id);
    if (!Number.isInteger(pageNumber) || pageNumber < 1) return;
    if (data.note) notes[pageNumber] = data.note;
    if (Array.isArray(data.annotations)) annotations[pageNumber] = data.annotations;
  });
  return { notes, annotations };
}

export async function loadCloudPreferences(userId: string): Promise<CloudPreferences | null> {
  const snapshot = await getDocs(collection(firestore, 'users', userId, 'settings'));
  const preferences = snapshot.docs.find((item) => item.id === 'preferences');
  return preferences ? preferences.data() as CloudPreferences : null;
}

export async function saveCloudPreferences(userId: string, preferences: CloudPreferences) {
  await setDoc(doc(firestore, 'users', userId, 'settings', 'preferences'), {
    ...clean(preferences),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function clearCloudSettings(userId: string) {
  await deleteDoc(doc(firestore, 'users', userId, 'settings', 'preferences'));
}
