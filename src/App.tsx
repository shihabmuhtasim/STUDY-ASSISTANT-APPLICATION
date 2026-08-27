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
import { SiteNavigation } from './components/SiteNavigation';
import { SiteInfoModal } from './components/SiteInfoModal';
import { AuthModal } from './components/AuthModal';
import { accountFromSupabaseUser, signOutAccount, supabase } from './services/auth';

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
  const [account, setAccount] = useState<AccountSummary | AccountIdentity | null>(initialAccount);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [infoView, setInfoView] = useState<'plans' | 'contact' | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

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
      }
    }
    loadDocs();
  }, []);

  useEffect(() => {
    refreshAccount();
  }, [refreshAccount]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setAccount(accountFromSupabaseUser(data.user));
    }).catch(() => undefined);
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccount(session?.user ? accountFromSupabaseUser(session.user) : null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

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
      await del(`annotations_${id}`);
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

  return (
    <AppErrorBoundary>
      <div className={`${currentDocument ? 'h-screen overflow-hidden' : 'min-h-screen'} flex flex-col bg-slate-50 font-sans text-slate-900`}>
      <SiteNavigation
        account={account}
        onLibrary={() => setCurrentDocument(null)}
        onPlans={() => setInfoView('plans')}
        onContact={() => setInfoView('contact')}
        onAuth={() => setAuthOpen(true)}
        onSignOut={() => { signOutAccount().catch(() => undefined); setAccount(null); }}
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
        />
      )}
      </div>
      <SiteInfoModal view={infoView} onClose={() => setInfoView(null)} />
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onAuthenticated={setAccount} />
      </div>
    </AppErrorBoundary>
  );
}
