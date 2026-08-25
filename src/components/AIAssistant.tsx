import React, { useState } from 'react';
import { Send, Sparkles, Loader2, Copy, Plus, Check } from 'lucide-react';
import { AIInteraction } from '../types';
import { askGeminiAboutPage } from '../services/ai';
import { v4 as uuidv4 } from 'uuid';
import Markdown from 'react-markdown';
import { EditInsertModal } from './EditInsertModal';

interface AIAssistantProps {
  pageImage: string | null;
  history: AIInteraction[];
  onAddInteraction: (interaction: AIInteraction) => void;
  onInsertToNotes: (text: string, questionHeader?: string) => void;
}

export function AIAssistant({ pageImage, history, onAddInteraction, onInsertToNotes }: AIAssistantProps) {
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Edit & Insert Modal State
  const [insertModalState, setInsertModalState] = useState<{
    isOpen: boolean;
    promptQuestion: string;
    aiResponse: string;
  }>({
    isOpen: false,
    promptQuestion: '',
    aiResponse: '',
  });

  const handleAsk = async (text: string) => {
    if (!text.trim() || !pageImage) return;

    setIsLoading(true);
    setPrompt("");

    try {
      const response = await askGeminiAboutPage(text, pageImage);
      
      const interaction: AIInteraction = {
        id: uuidv4(),
        prompt: text,
        response,
        createdAt: Date.now(),
        insertedIntoNotes: false,
      };
      
      onAddInteraction(interaction);
    } catch (error) {
      console.error(error);
      alert("Failed to get AI response. Please check your network or try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenInsertModal = (promptQuestion: string, aiResponse: string) => {
    setInsertModalState({
      isOpen: true,
      promptQuestion,
      aiResponse,
    });
  };

  const handleConfirmInsert = (editedContent: string, questionHeader?: string) => {
    onInsertToNotes(editedContent, questionHeader);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-500" />
          <h3 className="font-medium text-slate-800 text-sm">AI Page Assistant</h3>
        </div>
        <span className="text-[11px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
          Page Aware
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {history.length === 0 ? (
          <div className="text-center text-slate-400 text-sm my-auto py-12">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <Sparkles size={24} />
            </div>
            <p className="font-medium text-slate-700">Ask anything about this page</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Get summaries, explanations of complex diagrams, key takeaways, or custom notes.
            </p>
          </div>
        ) : (
          history.map((item) => (
            <div key={item.id} className="space-y-3">
              <div className="flex justify-end">
                <div className="bg-slate-800 text-white px-3.5 py-2 rounded-2xl rounded-tr-xs text-xs font-medium max-w-[85%] shadow-xs">
                  {item.prompt}
                </div>
              </div>
              <div className="flex justify-start">
                <div className="bg-indigo-50/70 text-indigo-950 px-4 py-3 rounded-2xl rounded-tl-xs text-sm max-w-[95%] border border-indigo-100/80 shadow-xs space-y-3">
                  <div className="prose prose-sm prose-indigo max-w-none text-slate-800 leading-relaxed">
                    <Markdown>{item.response}</Markdown>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-indigo-100">
                    <button
                      onClick={() => handleOpenInsertModal(item.prompt, item.response)}
                      className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 hover:text-indigo-800 bg-white hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg shadow-2xs border border-indigo-200 transition-all cursor-pointer"
                    >
                      <Plus size={14} className="text-indigo-600" />
                      Edit & Insert to Notes
                    </button>
                    <button
                      onClick={() => handleCopy(item.id, item.response)}
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 bg-white hover:bg-slate-100 px-2.5 py-1.5 rounded-lg shadow-2xs border border-slate-200 transition-all cursor-pointer"
                    >
                      {copiedId === item.id ? (
                        <>
                          <Check size={14} className="text-emerald-600" />
                          <span className="text-emerald-600">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-50 text-slate-600 px-4 py-3 rounded-2xl rounded-tl-xs text-sm flex items-center gap-2.5 border border-slate-200/80 shadow-2xs">
              <Loader2 size={16} className="animate-spin text-indigo-600" />
              <span>Analyzing this page...</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-100 bg-white shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk(prompt);
          }}
          className="relative flex items-center"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={pageImage ? "Ask AI about this page..." : "Loading page preview..."}
            disabled={isLoading || !pageImage}
            className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || isLoading || !pageImage}
            className="absolute right-2 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer"
          >
            <Send size={18} />
          </button>
        </form>
      </div>

      <EditInsertModal
        isOpen={insertModalState.isOpen}
        onClose={() => setInsertModalState((prev) => ({ ...prev, isOpen: false }))}
        promptQuestion={insertModalState.promptQuestion}
        aiResponse={insertModalState.aiResponse}
        onConfirmInsert={handleConfirmInsert}
      />
    </div>
  );
}
