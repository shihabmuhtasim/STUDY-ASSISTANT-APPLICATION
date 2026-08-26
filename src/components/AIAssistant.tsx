import React, { useEffect, useState } from 'react';
import { Bot, Check, Copy, Image as ImageIcon, Loader2, Plus, Send, Sparkles } from 'lucide-react';
import { AccountIdentity, AccountSummary, AIInteraction, AIModelPreference } from '../types';
import { AIRequestError, askAIAboutPage } from '../services/ai';
import { v4 as uuidv4 } from 'uuid';
import Markdown from 'react-markdown';
import { EditInsertModal } from './EditInsertModal';

interface AIAssistantProps {
  pageNumber: number;
  pageImage: string | null;
  pageText: string;
  history: AIInteraction[];
  account: AccountSummary | AccountIdentity | null;
  onRemainingChange: (remaining: number) => void;
  onAddInteraction: (interaction: AIInteraction) => void;
  onInsertToNotes: (text: string, questionHeader?: string) => void;
}

const quickPrompts = ['Summarize this page', 'Explain the key ideas', 'Create 3 quiz questions'];
const modelOptions: Array<{ value: AIModelPreference; label: string }> = [
  { value: 'auto', label: 'Auto · Best available' },
  { value: 'gemini-flash', label: 'Gemini 3.6 Flash' },
  { value: 'gemini-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { value: 'qwen', label: 'Qwen 3' },
  { value: 'llama', label: 'Llama 3.2' },
];

function displayModel(model: string) {
  if (model === 'gemini-3.6-flash') return 'Gemini 3.6 Flash';
  if (model === 'gemini-3.5-flash-lite') return 'Gemini 3.5 Flash-Lite';
  if (model.includes('qwen')) return 'Qwen 3';
  if (model.includes('llama')) return 'Llama';
  if (model === 'page-text-fallback') return 'Page text';
  return model;
}

export function AIAssistant({
  pageNumber,
  pageImage,
  pageText,
  history,
  onAddInteraction,
  onInsertToNotes,
}: AIAssistantProps) {
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeImage, setIncludeImage] = useState(false);
  const [modelPreference, setModelPreference] = useState<AIModelPreference>('auto');
  const [allowFallback, setAllowFallback] = useState(true);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [insertModalState, setInsertModalState] = useState({ isOpen: false, promptQuestion: '', aiResponse: '' });

  useEffect(() => {
    const savedModel = window.localStorage.getItem('study-assistant-model') as AIModelPreference | null;
    if (savedModel && modelOptions.some((option) => option.value === savedModel)) setModelPreference(savedModel);
    setAllowFallback(window.localStorage.getItem('study-assistant-fallback') !== 'false');
    setPreferencesLoaded(true);
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    window.localStorage.setItem('study-assistant-model', modelPreference);
    window.localStorage.setItem('study-assistant-fallback', String(allowFallback));
  }, [modelPreference, allowFallback, preferencesLoaded]);

  useEffect(() => {
    setIncludeImage(!pageText.trim());
    setError(null);
  }, [pageNumber, pageText]);

  const handleAsk = async (text: string) => {
    if (!text.trim() || isLoading) return;
    if (!pageText.trim() && !pageImage) {
      setError('The page is still being prepared. Try again in a moment.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setPrompt('');
    try {
      const result = await askAIAboutPage({
        prompt: text.trim(),
        pageNumber,
        pageText,
        pageImage: includeImage ? pageImage || undefined : undefined,
        history,
        modelPreference,
        allowFallback,
      });
      onAddInteraction({
        id: uuidv4(),
        prompt: text.trim(),
        response: result.response,
        createdAt: Date.now(),
        insertedIntoNotes: false,
        provider: result.provider,
        model: result.model,
        requestedModel: result.requestedModel,
        fallbackUsed: result.fallbackUsed,
      });
    } catch (requestError) {
      if (requestError instanceof AIRequestError) setError(requestError.message);
      else setError('The AI assistant could not answer right now. Try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('The answer could not be copied automatically.');
    }
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
      <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={18} className="text-indigo-600 shrink-0" />
          <h3 className="font-medium text-slate-800 text-sm truncate">AI Page Assistant</h3>
        </div>
        <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Page-aware</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {history.length === 0 ? (
          <div className="py-8 text-center">
            <Sparkles size={24} className="mx-auto text-indigo-500" />
            <p className="mt-3 font-medium text-slate-700 text-sm">Ask about page {pageNumber}</p>
            <p className="text-xs text-slate-500 mt-1">Answers are grounded in this page's text and optional page image.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {quickPrompts.map((item) => (
                <button key={item} type="button" onClick={() => handleAsk(item)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:border-indigo-300 hover:text-indigo-700">{item}</button>
              ))}
            </div>
          </div>
        ) : (
          history.map((item) => (
            <div key={item.id} className="space-y-3">
              <div className="flex justify-end"><div className="bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-medium max-w-[85%]">{item.prompt}</div></div>
              <div className="bg-indigo-50/70 text-indigo-950 px-4 py-3 rounded-lg text-sm border border-indigo-100 space-y-3">
                <div className="prose prose-sm prose-slate max-w-none leading-relaxed"><Markdown>{item.response}</Markdown></div>
                {item.model && <div className="flex items-center gap-1.5 text-[11px] text-indigo-700"><Bot size={13} />Answered by {displayModel(item.model)}{item.fallbackUsed ? ' · automatic fallback' : ''}</div>}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-indigo-100">
                  <button type="button" onClick={() => setInsertModalState({ isOpen: true, promptQuestion: item.prompt, aiResponse: item.response })} className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-white hover:bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-200"><Plus size={14} />Insert to notes</button>
                  <button type="button" onClick={() => handleCopy(item.id, item.response)} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
                    {copiedId === item.id ? <><Check size={14} className="text-emerald-600" />Copied</> : <><Copy size={14} />Copy</>}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}

        {isLoading && <div className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin text-indigo-600" />Analyzing page {pageNumber}…</div>}
      </div>

      <div className="p-3 border-t border-slate-100 bg-white shrink-0">
        {error && <p role="alert" className="mb-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <Bot size={14} className="text-indigo-600" />
            <span className="sr-only">AI model</span>
            <select value={modelPreference} onChange={(event) => setModelPreference(event.target.value as AIModelPreference)} className="max-w-48 bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-700 focus:border-indigo-500">
              {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={allowFallback} onChange={(event) => setAllowFallback(event.target.checked)} className="accent-indigo-600" />
            Auto fallback
          </label>
        </div>
        <div className="flex items-center justify-between gap-2 mb-2">
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={includeImage} onChange={(event) => setIncludeImage(event.target.checked)} disabled={!pageImage} className="accent-indigo-600" />
            <ImageIcon size={14} />Include page image
          </label>
          <span className="text-[11px] text-slate-400">Useful for diagrams</span>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); handleAsk(prompt); }} className="relative flex items-center">
          <input
            type="text"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask about this page…"
            disabled={isLoading}
            maxLength={4000}
            className="w-full pl-4 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm focus:border-indigo-500 disabled:opacity-60"
          />
          <button type="submit" disabled={!prompt.trim() || isLoading} className="absolute right-2 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-30" aria-label="Send question"><Send size={18} /></button>
        </form>
      </div>

      <EditInsertModal
        isOpen={insertModalState.isOpen}
        onClose={() => setInsertModalState((current) => ({ ...current, isOpen: false }))}
        promptQuestion={insertModalState.promptQuestion}
        aiResponse={insertModalState.aiResponse}
        onConfirmInsert={onInsertToNotes}
      />
    </div>
  );
}
