/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Library } from './components/Library';
import { StudyInterface } from './components/StudyInterface';
import { StudyDocument } from './types';
import { get, set, del } from 'idb-keyval';

export default function App() {
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [currentDocument, setCurrentDocument] = useState<StudyDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDocs() {
      try {
        const savedDocs = await get('study_documents');
        if (savedDocs) {
          setDocuments(savedDocs);
        }
      } catch (e) {
        console.error("Failed to load documents from IndexedDB", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadDocs();
  }, []);

  const handleAddDocument = async (doc: StudyDocument) => {
    const newDocs = [...documents, doc];
    setDocuments(newDocs);
    await set('study_documents', newDocs);
  };

  const handleDeleteDocument = async (id: string) => {
    const newDocs = documents.filter(d => d.id !== id);
    setDocuments(newDocs);
    await set('study_documents', newDocs);
    await del(`notes_${id}`);
  };

  if (isLoading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {currentDocument ? (
        <StudyInterface
          document={currentDocument}
          onBack={() => setCurrentDocument(null)}
        />
      ) : (
        <Library
          documents={documents}
          onOpenDocument={setCurrentDocument}
          onAddDocument={handleAddDocument}
          onDeleteDocument={handleDeleteDocument}
        />
      )}
    </div>
  );
}

