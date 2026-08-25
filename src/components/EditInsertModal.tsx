import React, { useState, useEffect } from 'react';
import { X, Check, Edit3, Eye, Sparkles, HelpCircle, Bold, Heading, List } from 'lucide-react';
import Markdown from 'react-markdown';

interface EditInsertModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptQuestion?: string;
  aiResponse: string;
  onConfirmInsert: (editedContent: string, questionHeader?: string) => void;
}

export function EditInsertModal({
  isOpen,
  onClose,
  promptQuestion = '',
  aiResponse,
  onConfirmInsert,
}: EditInsertModalProps) {
  const [editedContent, setEditedContent] = useState('');
  const [includeQuestion, setIncludeQuestion] = useState(true);
  const [questionHeader, setQuestionHeader] = useState('');
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    if (isOpen) {
      setEditedContent(aiResponse);
      setQuestionHeader(promptQuestion);
      setIncludeQuestion(!!promptQuestion.trim());
      setActiveTab('edit');
    }
  }, [isOpen, aiResponse, promptQuestion]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirmInsert(
      editedContent,
      includeQuestion && questionHeader.trim() ? questionHeader.trim() : undefined
    );
    onClose();
  };

  const insertFormat = (prefix: string, suffix: string = '') => {
    const textarea = document.getElementById('edit-note-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = editedContent.substring(start, end) || 'text';
    const replacement = `${prefix}${selectedText}${suffix}`;

    const newContent =
      editedContent.substring(0, start) + replacement + editedContent.substring(end);
    setEditedContent(newContent);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800 text-base">Edit & Format Note</h2>
              <p className="text-xs text-slate-500">Tweak AI response before adding it to page notes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-full transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Question Heading Toggle */}
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3.5 space-y-2">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeQuestion}
                onChange={(e) => setIncludeQuestion(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded-sm border-indigo-300 focus:ring-indigo-500"
              />
              <span className="text-xs font-semibold text-indigo-900 flex items-center gap-1.5">
                <HelpCircle size={14} className="text-indigo-600" />
                Include question heading on the note block
              </span>
            </label>

            {includeQuestion && (
              <input
                type="text"
                value={questionHeader}
                onChange={(e) => setQuestionHeader(e.target.value)}
                placeholder="Question / Topic heading..."
                className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
            )}
          </div>

          {/* Edit / Preview Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setActiveTab('edit')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'edit'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Edit3 size={14} />
                Edit Markdown
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  activeTab === 'preview'
                    ? 'bg-white text-slate-800 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Eye size={14} />
                Formatted Preview
              </button>
            </div>

            {activeTab === 'edit' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => insertFormat('**', '**')}
                  className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md"
                  title="Bold (**text**)"
                >
                  <Bold size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => insertFormat('### ')}
                  className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md"
                  title="Heading (### Header)"
                >
                  <Heading size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => insertFormat('* ')}
                  className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md"
                  title="Bullet list (* Item)"
                >
                  <List size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Editor Area */}
          {activeTab === 'edit' ? (
            <textarea
              id="edit-note-textarea"
              value={editedContent}
              onChange={(e) => setEditedContent(e.target.value)}
              placeholder="Refine or customize the note content..."
              className="w-full h-56 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-sans text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 leading-relaxed resize-none"
            />
          ) : (
            <div className="h-56 p-4 bg-slate-50 border border-slate-200 rounded-xl overflow-y-auto">
              <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-xs space-y-2">
                {includeQuestion && questionHeader.trim() && (
                  <h4 className="text-xs font-bold text-indigo-700 pb-2 border-b border-indigo-50">
                    Q: {questionHeader}
                  </h4>
                )}
                <div className="prose prose-sm prose-slate max-w-none">
                  <Markdown>{editedContent || '_No content entered_'}</Markdown>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!editedContent.trim()}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors shadow-xs disabled:opacity-50"
          >
            <Check size={16} />
            Insert to Page Notes
          </button>
        </div>
      </div>
    </div>
  );
}
