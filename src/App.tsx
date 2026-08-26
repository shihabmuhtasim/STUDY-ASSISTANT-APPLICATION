'use client';

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Library } from './components/Library';
import dynamic from 'next/dynamic';
import { AccountIdentity, AccountSummary, StudyDocument } from './types';
import { get, set, del } from 'idb-keyval';
import { AppErrorBoundary } from './components/AppErrorBoundary';

const StudyInterface = dynamic(
  () => import('./components/StudyInterface').then((module) => module.StudyInterface),
  { ssr: false },
);

interface AppProps {
  initialAccount: AccountIdentity | null;
}

export default function App({ initialAccount }: AppProps) {
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [currentDocument, setCurrentDocument] = useState<StudyDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [account, setAccount] = useState<AccountSummary | AccountIdentity | null>(initialAccount);
  const [storageError, setStorageError] = useState<string | null>(null);

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
        setIsLoading(false);
      }
    }
    loadDocs();
  }, []);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  const handleAddDocument = async (doc: StudyDocument) => {
    const newDocs = [...documents, doc];
    setDocuments(newDocs);
    try {
      await set('study_documents', newDocs);
    } catch (error) {
      console.error('Failed to save document', error);
      setStorageError('This document could not be saved on the device. Check browser storage permissions.');
    }
  };

  const handleDeleteDocument = async (id: string) => {
    const newDocs = documents.filter(d => d.id !== id);
    setDocuments(newDocs);
    try {
      await set('study_documents', newDocs);
      await del(`notes_${id}`);
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
    } catch (error) {
      console.error('Failed to update document', error);
      setStorageError('The document update could not be saved on this device.');
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading...</div>;
  }

  return (
    <AppErrorBoundary>
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {storageError && (
        <div role="alert" className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-900">
          {storageError}
          <button type="button" onClick={() => setStorageError(null)} className="ml-3 font-semibold underline">Dismiss</button>
        </div>
      )}
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
        />
      )}
      </div>
    </AppErrorBoundary>
  );
}
