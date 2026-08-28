'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Library } from './components/Library';
import dynamic from 'next/dynamic';
import { AccountIdentity, AccountSummary, StudyDocument } from './types';
import { get, set, del } from 'idb-keyval';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { SiteNavigation } from './components/SiteNavigation';
import { SiteInfoModal } from './components/SiteInfoModal';
import { AuthModal } from './components/AuthModal';
import { accountSummaryFromFirebaseUser, signOutAccount, subscribeToAccount } from './services/auth';
import { connectGoogleDrive } from './services/auth';
import { deleteCloudDocument, loadCloudDocuments, saveCloudDocument } from './services/cloudData';
import { deleteDocumentFromDrive, downloadDocumentFromDrive, uploadDocumentToDrive } from './services/googleDrive';

const StudyInterface = dynamic(
  () => import('./components/StudyInterface').then((module) => module.StudyInterface),
  { ssr: false },
);

interface AppProps {
  initialAccount: AccountIdentity | null;
}

export default function App({ initialAccount }: AppProps) {
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [currentDocument, setCurrentDocument] = useState<StudyDocument | null>(null);
  const [account, setAccount] = useState<AccountSummary | AccountIdentity | null>(initialAccount);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [infoView, setInfoView] = useState<'plans' | 'contact' | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const cloudLoadedFor = useRef<string | null>(null);

  const refreshAccount = useCallback(async () => {
    if (!initialAccount) return;
    try {
      const response = await fetch('/api/account', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json() as { account: AccountSummary | null };
      setAccount(data.account || initialAccount);
    } catch (error) {
      console.error('Failed to refresh account', error);
    }
  }, [initialAccount]);

  useEffect(() => {
    async function loadDocs() {
      try {
        const savedDocs = await get('study_documents');
        if (savedDocs) {
          setDocuments(savedDocs);
        }
      } catch (e) {
        console.error("Failed to load documents from IndexedDB", e);
        setStorageError('Local storage is unavailable. New documents may not persist after you close this tab.');
      } finally {
        setDocumentsLoaded(true);
      }
    }
    loadDocs();
  }, []);

  useEffect(() => {
    if (!account || !documentsLoaded || cloudLoadedFor.current === account.userId) return;
    cloudLoadedFor.current = account.userId;
    loadCloudDocuments(account.userId)
      .then((cloudDocuments) => {
        setDocuments((current) => {
          const merged = current.map((local) => {
            const cloud = cloudDocuments.find((item) => item.id === local.id);
            return cloud ? { ...local, ...cloud, fileData: local.fileData, cloudStatus: cloud.driveFileId ? 'synced' as const : 'local' as const } : { ...local, cloudStatus: 'local' as const };
          });
          Promise.all(merged.map((document) => saveCloudDocument(account.userId, document)))
            .catch((error) => console.error('Failed to migrate local library metadata', error));
          return merged;
        });
      })
      .catch((error) => {
        console.error('Failed to load cloud library', error);
        setStorageError('Your cloud library could not be loaded. Local documents are still available.');
      });
  }, [account, documentsLoaded]);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    return subscribeToAccount((user) => {
      if (!user) {
        setAccount(null);
        return;
      }
      accountSummaryFromFirebaseUser(user)
        .then((nextAccount) => {
          setAccount(nextAccount);
          setAuthOpen(false);
        })
        .catch((error) => {
          console.error('Failed to load account profile', error);
          setStorageError('Your Google account is connected, but the profile could not be loaded.');
        });
    });
  }, []);

  const handleAddDocument = async (doc: StudyDocument) => {
    let nextDocument: StudyDocument = { ...doc, mimeType: doc.fileData instanceof Blob ? doc.fileData.type : 'application/pdf', fileSize: doc.fileData instanceof Blob ? doc.fileData.size : undefined, cloudStatus: driveToken ? 'syncing' : 'local' };
    if (account) saveCloudDocument(account.userId, nextDocument).catch((error) => console.error('Failed to save cloud metadata', error));
    if (account && driveToken) {
      try {
        const driveFile = await uploadDocumentToDrive(nextDocument, driveToken);
        nextDocument = { ...nextDocument, driveFileId: driveFile.id, mimeType: driveFile.mimeType, fileSize: Number(driveFile.size) || nextDocument.fileSize, cloudStatus: 'synced' };
        await saveCloudDocument(account.userId, nextDocument);
      } catch (error) {
        console.error('Drive upload failed', error);
        nextDocument = { ...nextDocument, cloudStatus: 'error' };
        setCloudMessage('The document is available locally, but Google Drive upload failed. Reconnect Drive to retry.');
      }
    }
    const newDocs = [...documents, nextDocument];
    setDocuments(newDocs);
    try {
      await set('study_documents', newDocs);
    } catch (error) {
      console.error('Failed to save document', error);
      setStorageError('This document could not be saved on the device. Check browser storage permissions.');
    }
  };

  const handleDeleteDocument = async (id: string) => {
    const removed = documents.find((document) => document.id === id);
    const newDocs = documents.filter(d => d.id !== id);
    setDocuments(newDocs);
    try {
      await set('study_documents', newDocs);
      await del(`notes_${id}`);
      await del(`annotations_${id}`);
      if (account) await deleteCloudDocument(account.userId, id);
      if (removed?.driveFileId && driveToken) await deleteDocumentFromDrive(removed.driveFileId, driveToken);
    } catch (error) {
      console.error('Failed to delete local document data', error);
      setStorageError('The document was removed from this view, but some local data may remain.');
    }
  };

  const handleUpdateDocument = async (updated: StudyDocument) => {
    const newDocs = documents.map((item) => item.id === updated.id ? updated : item);
    setDocuments(newDocs);
    setCurrentDocument((current) => current?.id === updated.id ? updated : current);
    try {
      await set('study_documents', newDocs);
      if (account) await saveCloudDocument(account.userId, updated);
    } catch (error) {
      console.error('Failed to update document', error);
      setStorageError('The document update could not be saved on this device.');
    }
  };

  const handleConnectDrive = async () => {
    if (!account || driveBusy) return;
    const confirmed = window.confirm(
      'Connect Google Drive and synchronize your Study Assistant library? Existing documents in this browser will be uploaded to your own Google Drive account.',
    );
    if (!confirmed) return;
    setDriveBusy(true);
    setCloudMessage('Connecting Google Drive and synchronizing your library…');
    try {
      const token = await connectGoogleDrive();
      setDriveToken(token);
      const cloudDocuments = await loadCloudDocuments(account.userId);
      const localById = new Map(documents.map((document) => [document.id, document]));
      const synchronized: StudyDocument[] = [];

      for (const local of documents) {
        let next: StudyDocument = { ...local, cloudStatus: 'syncing' };
        if (!next.driveFileId) {
          const uploaded = await uploadDocumentToDrive(next, token);
          next = { ...next, driveFileId: uploaded.id, mimeType: uploaded.mimeType, fileSize: Number(uploaded.size) || next.fileSize, cloudStatus: 'synced' };
        } else {
          next.cloudStatus = 'synced';
        }
        await saveCloudDocument(account.userId, next);
        synchronized.push(next);
      }

      for (const cloud of cloudDocuments) {
        if (localById.has(cloud.id) || !cloud.driveFileId) continue;
        const fileData = await downloadDocumentFromDrive(cloud.driveFileId, token);
        synchronized.push({ ...cloud, fileData, cloudStatus: 'synced' });
      }

      setDocuments(synchronized);
      await set('study_documents', synchronized);
      setCloudMessage(`Google Drive connected. ${synchronized.length} document${synchronized.length === 1 ? '' : 's'} synchronized.`);
    } catch (error) {
      console.error('Google Drive synchronization failed', error);
      setCloudMessage(error instanceof Error ? error.message : 'Google Drive could not be connected.');
    } finally {
      setDriveBusy(false);
    }
  };

  return (
    <AppErrorBoundary>
      <div className={`${currentDocument ? 'h-screen overflow-hidden' : 'min-h-screen'} flex flex-col bg-slate-50 font-sans text-slate-900`}>
      <SiteNavigation
        account={account}
        onLibrary={() => setCurrentDocument(null)}
        onPlans={() => setInfoView('plans')}
        onContact={() => setInfoView('contact')}
        onAuth={() => setAuthOpen(true)}
        onSignOut={() => { signOutAccount().catch(() => undefined); setAccount(null); setDriveToken(null); cloudLoadedFor.current = null; }}
      />
      {storageError && (
        <div role="alert" className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-900">
          {storageError}
          <button type="button" onClick={() => setStorageError(null)} className="ml-3 font-semibold underline">Dismiss</button>
        </div>
      )}
      <div className={currentDocument ? 'min-h-0 flex-1' : 'flex-1'}>
      {currentDocument ? (
        <StudyInterface
          document={currentDocument}
          onBack={() => setCurrentDocument(null)}
          account={account}
          onAccountChange={setAccount}
          onUpdateDocument={handleUpdateDocument}
        />
      ) : (
        <Library
          documents={documents}
          onOpenDocument={setCurrentDocument}
          onAddDocument={handleAddDocument}
          onDeleteDocument={handleDeleteDocument}
          onUpdateDocument={handleUpdateDocument}
          account={account}
          onRequireAuth={() => setAuthOpen(true)}
          driveConnected={Boolean(driveToken)}
          driveBusy={driveBusy}
          cloudMessage={cloudMessage}
          onConnectDrive={handleConnectDrive}
        />
      )}
      </div>
      <SiteInfoModal view={infoView} onClose={() => setInfoView(null)} />
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    </AppErrorBoundary>
  );
}
