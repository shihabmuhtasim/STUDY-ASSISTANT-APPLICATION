import React, { useState, useEffect } from 'react';
import { X, Check, Sparkles, HelpCircle } from 'lucide-react';
import { markdownToRichTextHtml, RichTextEditor, richTextToPlainText } from './RichTextEditor';

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

  useEffect(() => {
    if (isOpen) {
      setEditedContent(markdownToRichTextHtml(aiResponse));
      setQuestionHeader(promptQuestion);
      setIncludeQuestion(!!promptQuestion.trim());
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

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold text-slate-700">Format note content</h3>
              <span className="text-[11px] text-slate-400">Select text, then choose a format</span>
            </div>
            <RichTextEditor value={editedContent} onChange={setEditedContent} minHeight={280} />
          </div>
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
            disabled={!richTextToPlainText(editedContent).trim()}
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
