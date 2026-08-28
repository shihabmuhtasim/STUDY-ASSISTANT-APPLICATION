'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Library } from './components/Library';
import dynamic from 'next/dynamic';
import { AccountIdentity, AccountSummary, StudyDocument } from './types';
import { get, del, set as setStored } from 'idb-keyval';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { SiteNavigation } from './components/SiteNavigation';
import { SiteInfoModal } from './components/SiteInfoModal';
import { AuthModal } from './components/AuthModal';
import { accountSummaryFromFirebaseUser, signOutAccount, subscribeToAccount } from './services/auth';
import { connectGoogleDrive } from './services/auth';
import { deleteCloudDocument, loadCloudDocuments, loadDriveConnection, saveCloudDocument, saveDriveConnection } from './services/cloudData';
import { clearDriveSession, deleteDocumentFromDrive, downloadDocumentFromDrive, loadDriveSession, saveDriveSession, uploadDocumentToDrive, validateDriveToken } from './services/googleDrive';

const StudyInterface = dynamic(
  () => import('./components/StudyInterface').then((module) => module.StudyInterface),
  { ssr: false },
);

interface AppProps {
  initialAccount: AccountIdentity | null;
}

const localLibraryKey = (userId: string) => `study_documents_${userId}`;

export default function App({ initialAccount }: AppProps) {
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [currentDocument, setCurrentDocument] = useState<StudyDocument | null>(null);
  const [account, setAccount] = useState<AccountSummary | AccountIdentity | null>(initialAccount);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [infoView, setInfoView] = useState<'plans' | 'contact' | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveLinked, setDriveLinked] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState<string | null>(null);
  const cloudLoadedFor = useRef<string | null>(null);
  const driveSyncedFor = useRef<string | null>(null);
  const legacyDocuments = useRef<StudyDocument[]>([]);

  const persistLocalDocuments = useCallback(async (userId: string, nextDocuments: StudyDocument[]) => {
    await setStored(localLibraryKey(userId), nextDocuments);
    legacyDocuments.current = nextDocuments;
  }, []);

  useEffect(() => {
    const userId = account?.userId;
    let cancelled = false;
    setDocumentsLoaded(false);
    if (!userId) {
      legacyDocuments.current = [];
      setDocuments([]);
      setDocumentsLoaded(true);
      return;
    }
    async function loadDocs() {
      try {
        const [savedDocs, oldSavedDocs] = await Promise.all([
          get(localLibraryKey(userId!)),
          get('study_documents'),
        ]);
        const scoped = Array.isArray(savedDocs) ? savedDocs as StudyDocument[] : [];
        const legacy = Array.isArray(oldSavedDocs) ? oldSavedDocs as StudyDocument[] : [];
        const byId = new Map(scoped.map((document) => [document.id, document]));
        legacy.forEach((document) => { if (!byId.has(document.id)) byId.set(document.id, document); });
        const restored = [...byId.values()];
        if (cancelled) return;
        legacyDocuments.current = restored;
        setDocuments(restored);
        if (legacy.length) {
          await setStored(localLibraryKey(userId!), restored);
          await del('study_documents');
        }
      } catch (error) {
        console.error('Failed to load documents from IndexedDB', error);
        if (!cancelled) setStorageError('Your local document library could not be read. Cloud synchronization remains optional.');
      } finally {
        if (!cancelled) setDocumentsLoaded(true);
      }
    }
    loadDocs();
    return () => { cancelled = true; };
  }, [account?.userId]);

  useEffect(() => {
    if (!account || !documentsLoaded || cloudLoadedFor.current === account.userId) return;
    cloudLoadedFor.current = account.userId;
    loadCloudDocuments(account.userId)
      .then((cloudDocuments) => {
        setDocuments((current) => {
          const localDocuments = current.length ? current : legacyDocuments.current;
          const merged = localDocuments.map((local) => {
            const cloud = cloudDocuments.find((item) => item.id === local.id);
            return cloud ? { ...local, ...cloud, fileData: local.fileData, cloudStatus: cloud.driveFileId ? 'synced' as const : 'local' as const } : { ...local, cloudStatus: 'local' as const };
          });
          Promise.all(merged.map((document) => saveCloudDocument(account.userId, document)))
            .catch((error) => console.error('Failed to migrate local library metadata', error));
          persistLocalDocuments(account.userId, merged)
            .catch((error) => console.error('Failed to persist merged local library', error));
          return merged;
        });
      })
      .catch((error) => {
        console.error('Failed to load cloud library', error);
        setStorageError('Your cloud library could not be loaded. Local documents are still available.');
      });
  }, [account, documentsLoaded, persistLocalDocuments]);

  useEffect(() => {
    return subscribeToAccount((user) => {
      if (!user) {
        setAccount(null);
        setDocuments([]);
        setDriveToken(null);
        setDriveLinked(false);
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

  const synchronizeDrive = useCallback(async (token: string, announce = true) => {
    if (!account) return;
    setDriveBusy(true);
    try {
      const cloudDocuments = await loadCloudDocuments(account.userId);
      const synchronizedById = new Map<string, StudyDocument>();
      const localDocuments = new Map<string, StudyDocument>();
      legacyDocuments.current.forEach((document) => localDocuments.set(document.id, document));
      documents.forEach((document) => localDocuments.set(document.id, document));

      for (const local of localDocuments.values()) {
        if (!local.fileData) continue;
        let next: StudyDocument = { ...local, cloudStatus: 'syncing' };
        if (!next.driveFileId) {
          const uploaded = await uploadDocumentToDrive(next, token);
          next = { ...next, driveFileId: uploaded.id, mimeType: uploaded.mimeType, fileSize: Number(uploaded.size) || next.fileSize, cloudStatus: 'synced' };
        } else {
          next.cloudStatus = 'synced';
        }
        await saveCloudDocument(account.userId, next);
        synchronizedById.set(next.id, next);
      }

      for (const cloud of cloudDocuments) {
        if (synchronizedById.has(cloud.id) || !cloud.driveFileId) continue;
        const fileData = await downloadDocumentFromDrive(cloud.driveFileId, token);
        synchronizedById.set(cloud.id, { ...cloud, fileData, cloudStatus: 'synced' });
      }

      const synchronized = [...synchronizedById.values()].sort((a, b) => b.updatedAt - a.updatedAt);
      setDocuments(synchronized);
      await persistLocalDocuments(account.userId, synchronized);
      if (announce) setCloudMessage(`Google Drive synchronized. ${synchronized.length} document${synchronized.length === 1 ? '' : 's'} available.`);
    } finally {
      setDriveBusy(false);
    }
  }, [account, documents, persistLocalDocuments]);

  useEffect(() => {
    const userId = account?.userId;
    if (!userId) {
      setDriveLinked(false);
      setDriveToken(null);
      return;
    }
    let cancelled = false;
    driveSyncedFor.current = null;
    loadDriveConnection(userId)
      .then(async (status) => {
        if (cancelled) return;
        setDriveLinked(status.connected);
        const sessionToken = loadDriveSession(userId);
        if (sessionToken && await validateDriveToken(sessionToken)) {
          if (!cancelled) setDriveToken(sessionToken);
          return;
        }
        clearDriveSession();
        setDriveToken(null);
      })
      .catch((error) => console.error('Failed to restore Google Drive connection', error));
    return () => { cancelled = true; };
  }, [account?.userId]);

  useEffect(() => {
    if (!account || !documentsLoaded || !driveToken) return;
    const syncKey = `${account.userId}:${driveToken}`;
    if (driveSyncedFor.current === syncKey) return;
    driveSyncedFor.current = syncKey;
    synchronizeDrive(driveToken, false)
      .then(() => setCloudMessage('Google Drive reconnected and synchronized automatically.'))
      .catch((error) => {
        driveSyncedFor.current = null;
        setCloudMessage(error instanceof Error ? error.message : 'Google Drive synchronization failed.');
      });
  }, [account, documentsLoaded, driveToken, synchronizeDrive]);

  const handleAddDocument = async (doc: StudyDocument) => {
    if (!account) throw new Error('Sign in before adding a document.');
    let nextDocument: StudyDocument = {
      ...doc,
      mimeType: doc.fileData instanceof Blob ? doc.fileData.type : 'application/pdf',
      fileSize: doc.fileData instanceof Blob ? doc.fileData.size : undefined,
      cloudStatus: driveToken ? 'syncing' : 'local',
    };
    let newDocs = [...documents, nextDocument];
    setDocuments(newDocs);
    await persistLocalDocuments(account.userId, newDocs);
    try {
      await saveCloudDocument(account.userId, nextDocument);
    } catch (error) {
      console.error('Failed to save document metadata', error);
      setCloudMessage('The document is available on this device. Account metadata will synchronize when the cloud service is available.');
    }

    if (driveToken) {
      try {
        const driveFile = await uploadDocumentToDrive(nextDocument, driveToken);
        nextDocument = { ...nextDocument, driveFileId: driveFile.id, mimeType: driveFile.mimeType, fileSize: Number(driveFile.size) || nextDocument.fileSize, cloudStatus: 'synced' };
        newDocs = newDocs.map((item) => item.id === nextDocument.id ? nextDocument : item);
        setDocuments(newDocs);
        await persistLocalDocuments(account.userId, newDocs);
        await saveCloudDocument(account.userId, nextDocument);
      } catch (error) {
        nextDocument = { ...nextDocument, cloudStatus: 'error' };
        newDocs = newDocs.map((item) => item.id === nextDocument.id ? nextDocument : item);
        setDocuments(newDocs);
        await persistLocalDocuments(account.userId, newDocs);
        setCloudMessage('The document is available locally. Google Drive backup will retry when you resume sync.');
      }
    }
    return nextDocument;
  };

  const handleDeleteDocument = async (id: string) => {
    const removed = documents.find((document) => document.id === id);
    const newDocs = documents.filter(d => d.id !== id);
    setDocuments(newDocs);
    try {
      if (account) await persistLocalDocuments(account.userId, newDocs);
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
      if (account) {
        await persistLocalDocuments(account.userId, newDocs);
        await saveCloudDocument(account.userId, updated);
      }
    } catch (error) {
      console.error('Failed to update document', error);
      setStorageError('The document update could not be saved on this device.');
    }
  };

  const handleConnectDrive = async () => {
    if (!account || driveBusy) return;
    if (driveToken) {
      try {
        await synchronizeDrive(driveToken);
      } catch (error) {
        setCloudMessage(error instanceof Error ? error.message : 'Google Drive synchronization failed.');
      }
      return;
    }
    if (!driveLinked) {
      const confirmed = window.confirm(
        'Connect Google Drive and synchronize your Study Assistant library? Existing documents in this browser will be uploaded to your own Google Drive account.',
      );
      if (!confirmed) return;
    }
    setDriveBusy(true);
    setCloudMessage('Connecting Google Drive and synchronizing your library…');
    try {
      const token = await connectGoogleDrive();
      setDriveToken(token);
      setDriveLinked(true);
      saveDriveSession(account.userId, token);
      await saveDriveConnection(account.userId, true);
      driveSyncedFor.current = `${account.userId}:${token}`;
      await synchronizeDrive(token);
    } catch (error) {
      console.error('Google Drive synchronization failed', error);
      setCloudMessage(error instanceof Error ? error.message : 'Google Drive could not be connected.');
    } finally {
      setDriveBusy(false);
    }
  };

  const handleDisconnectDrive = async () => {
    if (!account || !driveLinked || driveBusy) return;
    if (!window.confirm('Disconnect Google Drive from this Study Assistant account? Your files will remain in Google Drive.')) return;
    clearDriveSession();
    setDriveToken(null);
    setDriveLinked(false);
    driveSyncedFor.current = null;
    await saveDriveConnection(account.userId, false);
    const localDocuments = documents.map((document) => ({ ...document, cloudStatus: 'local' as const }));
    setDocuments(localDocuments);
    await persistLocalDocuments(account.userId, localDocuments);
    setCloudMessage('Google Drive disconnected. Local documents remain available, and existing Drive files were not deleted.');
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
        onSignOut={() => { signOutAccount().catch(() => undefined); clearDriveSession(); setAccount(null); setDocuments([]); setDriveToken(null); setDriveLinked(false); cloudLoadedFor.current = null; driveSyncedFor.current = null; }}
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
          onUpgrade={() => setInfoView('plans')}
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
          driveLinked={driveLinked}
          driveBusy={driveBusy}
          cloudMessage={cloudMessage}
          onConnectDrive={handleConnectDrive}
          onDisconnectDrive={handleDisconnectDrive}
        />
      )}
      </div>
      <SiteInfoModal view={infoView} onClose={() => setInfoView(null)} />
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </div>
    </AppErrorBoundary>
  );
}
