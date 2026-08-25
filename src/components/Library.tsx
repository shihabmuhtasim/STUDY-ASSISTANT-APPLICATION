import React, { useState, useRef } from 'react';
import { Upload, FileText, Trash2, Clock, ChevronRight } from 'lucide-react';
import { StudyDocument } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface LibraryProps {
  documents: StudyDocument[];
  onOpenDocument: (doc: StudyDocument) => void;
  onAddDocument: (doc: StudyDocument) => void;
  onDeleteDocument: (id: string) => void;
}

export function Library({ documents, onOpenDocument, onAddDocument, onDeleteDocument }: LibraryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      processFile(file);
    } else {
      alert("Please upload a PDF file.");
    }
  };

  const processFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      const newDoc: StudyDocument = {
        id: uuidv4(),
        title: file.name.replace('.pdf', ''),
        fileData: base64,
        totalPages: 0, // We'll get this when it loads in the viewer
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      onAddDocument(newDoc);
      onOpenDocument(newDoc);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 md:p-12">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">Study Assistant</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Upload your lecture slides or study notes. We'll help you break them down page by page, generating concise notes and answering your questions.
        </p>
      </div>

      <div
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-200 cursor-pointer mb-12
          ${isDragging 
            ? 'border-indigo-500 bg-indigo-50' 
            : 'border-slate-300 bg-white hover:border-indigo-400 hover:bg-slate-50'
          }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Upload size={28} />
        </div>
        <h3 className="text-xl font-semibold text-slate-800 mb-2">Upload a PDF</h3>
        <p className="text-slate-500 mb-6">Drag and drop your file here, or click to browse</p>
        <button className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
          Select PDF File
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="application/pdf"
          className="hidden"
        />
      </div>

      {documents.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold text-slate-800 mb-6 flex items-center gap-2">
            <Clock size={20} className="text-slate-400" />
            Recent Documents
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {documents.sort((a, b) => b.createdAt - a.createdAt).map(doc => (
              <div 
                key={doc.id}
                className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-all group cursor-pointer flex flex-col"
                onClick={() => onOpenDocument(doc)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center shrink-0">
                    <FileText size={20} />
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete this document and all its notes?')) {
                        onDeleteDocument(doc.id);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <h3 className="font-medium text-slate-900 mb-1 line-clamp-2" title={doc.title}>
                  {doc.title}
                </h3>
                <p className="text-xs text-slate-500 mt-auto pt-4 flex items-center justify-between">
                  <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                  <span className="flex items-center text-indigo-600 font-medium group-hover:translate-x-1 transition-transform">
                    Study <ChevronRight size={14} />
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
