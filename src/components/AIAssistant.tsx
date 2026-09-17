import React, { useEffect, useRef, useState } from 'react';
import { Bot, Check, ChevronDown, Copy, Crown, HelpCircle, Image as ImageIcon, KeyRound, ListFilter, Loader2, Lock, Mic, MicOff, Plus, Quote, Radio, Send, Sparkles, Square } from 'lucide-react';
import { AccountIdentity, AccountSummary, AIInteraction, AIModelPreference, AISourceReference, CustomAIConnection } from '../types';
import { AIRequestError, askAIAboutPage } from '../services/ai';
import { askCustomAI } from '../services/customAI';
import { v4 as uuidv4 } from 'uuid';
import Markdown from 'react-markdown';
import { EditInsertModal } from './EditInsertModal';
import { AIConnectionsModal } from './AIConnectionsModal';
import { loadCloudPreferences, saveCloudPreferences } from '../services/cloudData';
import { deleteEncryptedConnection, loadSavedConnections, saveEncryptedConnection } from '../services/connectionStore';
import { buildQuestionContextBundle } from '../utils/documentContext';
import { referencesUsedInAnswer } from '../utils/answerReferences';
import { useSpeechTranscription } from '../hooks/useSpeechTranscription';

interface AIAssistantProps {
  pageNumber: number;
  pageImage: string | null;
  pageText: string;
  documentContext: string;
  documentPages?: string[];
  isDocumentContextLoading: boolean;
  documentContextProgress?: string | null;
  scope?: 'page' | 'document';
  history: AIInteraction[];
  account: AccountSummary | AccountIdentity | null;
  onRemainingChange: (remaining: number, remainingPercent?: number) => void;
  onUpgrade: () => void;
  onAddInteraction: (interaction: AIInteraction) => void;
  onInsertToNotes: (text: string, questionHeader?: string) => void;
  onVoiceControls: () => void;
  voiceActive: boolean;
  voicePending: number;
  onReferenceSelect: (reference: AISourceReference) => void;
}

const pageQuickPrompts = ['Summarize this page', 'Explain the key ideas', 'Create 3 quiz questions'];
const documentQuickPrompts = ['Summarize the whole document', 'Create a complete study guide', 'List the main topics and conclusions'];
const modelOptions: Array<{ value: AIModelPreference; label: string }> = [
  { value: 'basic', label: 'Study Basic' },
  { value: 'auto', label: 'Auto · Best available' },
  { value: 'gemini-flash', label: 'Gemini 3.6 Flash' },
  { value: 'gemini-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { value: 'qwen', label: 'Qwen 3' },
  { value: 'glm', label: 'GLM 4.7 Flash' },
  { value: 'gemma', label: 'Gemma 4' },
  { value: 'llama', label: 'Llama 3.2' },
  { value: 'nemotron', label: 'NVIDIA Nemotron 3' },
];
const CONNECTIONS_SESSION_KEY = 'study-assistant-session-ai-connections';
const SELECTED_CONNECTION_SESSION_KEY = 'study-assistant-session-selected-ai-connection';
const customServices = new Set(['openai', 'openrouter', 'nvidia', 'groq', 'together', 'gemini', 'anthropic', 'custom']);
const customProviders = new Set(['openai-compatible', 'gemini', 'anthropic']);

function isCustomAIConnection(item: unknown): item is CustomAIConnection {
  if (!item || typeof item !== 'object') return false;
  const connection = item as Partial<CustomAIConnection>;
  return typeof connection.id === 'string'
    && typeof connection.name === 'string'
    && typeof connection.apiKey === 'string'
    && typeof connection.model === 'string'
    && typeof connection.service === 'string'
    && customServices.has(connection.service)
    && typeof connection.provider === 'string'
    && customProviders.has(connection.provider)
    && (connection.baseUrl === undefined || typeof connection.baseUrl === 'string');
}

function displayModel(model: string) {
  if (model.includes('llama-3.2-1b')) return 'Study Basic';
  if (model === 'gemini-3.6-flash') return 'Gemini 3.6 Flash';
  if (model === 'gemini-3.5-flash-lite') return 'Gemini 3.5 Flash-Lite';
  if (model.includes('qwen')) return 'Qwen 3';
  if (model.includes('glm-4.7')) return 'GLM 4.7 Flash';
  if (model.includes('gemma-4')) return 'Gemma 4';
  if (model.includes('nemotron-3')) return 'NVIDIA Nemotron 3';
  if (model.includes('llama')) return 'Llama';
  if (model === 'page-text-fallback') return 'Page text';
  return model;
}

function normalizeModelResponse(value: string) {
  return value
    .replace(/\\+\$/g, '$')
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\(\$([^\$\n]+)\$\)/g, '($1)')
    .replace(/\$([^\$\n]+)\$/g, '$1')
    .replace(/\\ge\b/g, '≥')
    .replace(/\\le\b/g, '≤')
    .replace(/\\times\b/g, '×')
    .replace(/\\cdot\b/g, '·')
    .replace(/\\approx\b/g, '≈')
    .replace(/\\neq\b/g, '≠')
    .replace(/\\pm\b/g, '±')
    .replace(/\\rightarrow\b/g, '→')
    .replace(/\\leftarrow\b/g, '←')
    .replace(/\*\*\*([^*]+)\*\*\*/g, '**$1**')
    .replace(/^\s*\*{3,}\s*$/gm, '')
    .replace(/\\([*_`])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function AIAssistant({
  pageNumber,
  pageImage,
  pageText,
  documentContext,
  documentPages = [],
  isDocumentContextLoading,
  documentContextProgress,
  scope = 'page',
  history,
  account,
  onRemainingChange,
  onUpgrade,
  onAddInteraction,
  onInsertToNotes,
  onVoiceControls,
  voiceActive,
  voicePending,
  onReferenceSelect,
}: AIAssistantProps) {
  const [prompt, setPrompt] = useState('');
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [includeImage, setIncludeImage] = useState(false);
  const [modelPreference, setModelPreference] = useState<AIModelPreference>('auto');
  const [allowFallback, setAllowFallback] = useState(true);
  const [referencesEnabled, setReferencesEnabled] = useState(false);
  const [manualRangeEnabled, setManualRangeEnabled] = useState(false);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(1);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [connections, setConnections] = useState<CustomAIConnection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const assistantRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const [modelMenuMaxHeight, setModelMenuMaxHeight] = useState(288);
  const [insertModalState, setInsertModalState] = useState({ isOpen: false, promptQuestion: '', aiResponse: '' });
  const hasProAccess = Boolean(account && 'plan' in account && account.plan === 'pro');
  const remainingPercent = account && 'aiRemainingPercent' in account ? account.aiRemainingPercent : 0;
  const maxPage = Math.max(1, documentPages.length);
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    isSupported: isSpeechSupported,
    isListening,
    toggleListening,
    stopListening,
  } = useSpeechTranscription({
    onTranscript: (spokenText) => {
      if (spokenText.trim()) setPrompt(spokenText);
    },
  });

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setPendingPrompt(null);
  };

  useEffect(() => {
    if (manualRangeEnabled) return;
    setRangeStart(Math.min(pageNumber, maxPage));
    setRangeEnd(Math.min(maxPage, pageNumber + 2));
  }, [manualRangeEnabled, maxPage, pageNumber]);

  useEffect(() => {
    const savedModel = window.localStorage.getItem('study-assistant-model') as AIModelPreference | null;
    let sessionConnections: CustomAIConnection[] = [];
    try {
      const parsed: unknown = JSON.parse(window.sessionStorage.getItem(CONNECTIONS_SESSION_KEY) || '[]');
      sessionConnections = Array.isArray(parsed) ? parsed.filter(isCustomAIConnection) : [];
    } catch {
      sessionConnections = [];
    }
    const savedConnectionId = window.sessionStorage.getItem(SELECTED_CONNECTION_SESSION_KEY);
    const selectedId = sessionConnections.some((item) => item.id === savedConnectionId) ? savedConnectionId : sessionConnections[0]?.id || null;
    setConnections(sessionConnections);
    setSelectedConnectionId(selectedId);
    if (savedModel === 'custom' && selectedId && hasProAccess) setModelPreference('custom');
    else if (savedModel && modelOptions.some((option) => option.value === savedModel)) setModelPreference(savedModel);
    setAllowFallback(window.localStorage.getItem('study-assistant-fallback') !== 'false');
    setReferencesEnabled(window.localStorage.getItem('study-assistant-references') === 'true');
    if (account) {
      if (!hasProAccess) {
        setModelPreference('basic');
        setAllowFallback(false);
      }
      Promise.all([
        (async () => {
          for (const connection of sessionConnections) await saveEncryptedConnection(connection);
          const saved = await loadSavedConnections();
          setConnections(saved);
          window.sessionStorage.removeItem(CONNECTIONS_SESSION_KEY);
          return saved;
        })(),
        loadCloudPreferences(account.userId),
      ])
        .then(([saved, cloud]) => {
          if (!cloud) {
            setSelectedConnectionId(saved[0]?.id || null);
            if (!hasProAccess) {
              setModelPreference('basic');
              setAllowFallback(false);
            }
            return;
          }
          if (hasProAccess) {
            if (cloud.modelPreference === 'basic') setModelPreference('auto');
            else if (modelOptions.some((option) => option.value === cloud.modelPreference) || cloud.modelPreference === 'custom') setModelPreference(cloud.modelPreference);
            setAllowFallback(cloud.allowFallback !== false);
          } else {
            setModelPreference('basic');
            setAllowFallback(false);
          }
          setReferencesEnabled(cloud.referencesEnabled === true);
          setSelectedConnectionId(saved.some((connection) => connection.id === cloud.selectedConnectionId) ? cloud.selectedConnectionId : saved[0]?.id || null);
        })
        .catch((loadError) => console.error('Failed to load cloud AI settings', loadError))
        .finally(() => setPreferencesLoaded(true));
    } else {
      setConnections([]);
      setSelectedConnectionId(null);
      setConnectionsOpen(false);
      setModelPreference('basic');
      setAllowFallback(false);
      setPreferencesLoaded(true);
    }
  }, [account?.userId, hasProAccess]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    window.localStorage.setItem('study-assistant-model', modelPreference);
    window.localStorage.setItem('study-assistant-fallback', String(allowFallback));
    window.localStorage.setItem('study-assistant-references', String(referencesEnabled));
    if (selectedConnectionId) window.sessionStorage.setItem(SELECTED_CONNECTION_SESSION_KEY, selectedConnectionId);
    else window.sessionStorage.removeItem(SELECTED_CONNECTION_SESSION_KEY);
    if (account) saveCloudPreferences(account.userId, { modelPreference: hasProAccess ? modelPreference : 'basic', allowFallback: hasProAccess ? allowFallback : false, selectedConnectionId, referencesEnabled }).catch((saveError) => console.error('Failed to save cloud AI preferences', saveError));
  }, [modelPreference, allowFallback, referencesEnabled, selectedConnectionId, preferencesLoaded, account?.userId, hasProAccess]);

  useEffect(() => {
    setIncludeImage(scope === 'page' && hasProAccess && !pageText.trim());
    setError(null);
  }, [pageNumber, pageText, hasProAccess, scope]);

  useEffect(() => {
    if (!modelMenuOpen) return;
    const fitMenuInsideAssistant = () => {
      const assistantBounds = assistantRef.current?.getBoundingClientRect();
      const triggerBounds = modelTriggerRef.current?.getBoundingClientRect();
      if (!assistantBounds || !triggerBounds) return;
      const availableHeight = Math.floor(triggerBounds.top - assistantBounds.top - 16);
      setModelMenuMaxHeight(Math.max(64, Math.min(420, availableHeight)));
    };
    const frame = window.requestAnimationFrame(() => {
      fitMenuInsideAssistant();
      if (modelMenuRef.current) modelMenuRef.current.scrollTop = 0;
    });
    const observer = new ResizeObserver(fitMenuInsideAssistant);
    if (assistantRef.current) observer.observe(assistantRef.current);
    if (modelTriggerRef.current) observer.observe(modelTriggerRef.current);
    window.addEventListener('resize', fitMenuInsideAssistant);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', fitMenuInsideAssistant);
    };
  }, [modelMenuOpen]);

  const handleAsk = async (text: string) => {
    if (!text.trim() || isLoading || isDocumentContextLoading) return;
    if (scope === 'page' && !pageText.trim() && !pageImage) {
      setError('The page is still being prepared. Try again in a moment.');
      return;
    }
    if (scope === 'document' && !documentContext.trim()) {
      setError('The whole document is still being prepared. Try again in a moment.');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setPendingPrompt(text.trim());
    setError(null);
    setPrompt('');
    try {
      const activeConnection = connections.find((connection) => connection.id === selectedConnectionId);
      if (modelPreference === 'custom' && !activeConnection) {
        setConnectionsOpen(true);
        throw new AIRequestError('Add or select an API connection before using your model.');
      }
      const normalizedStart = Math.max(1, Math.min(maxPage, rangeStart));
      const normalizedEnd = Math.max(normalizedStart, Math.min(maxPage, rangeEnd));
      const selectedRange = manualRangeEnabled ? { start: normalizedStart, end: normalizedEnd } : undefined;
      const contextBundle = buildQuestionContextBundle(documentPages, text, pageNumber, scope, referencesEnabled, undefined, selectedRange);
      const request = {
        prompt: text.trim(),
        pageNumber,
        pageText,
        documentContext: contextBundle.context || documentContext.slice(0, scope === 'document' ? 20_000 : 14_000),
        pageImage: scope === 'page' && includeImage ? pageImage || undefined : undefined,
        history,
        scope,
        referencesEnabled,
        signal: controller.signal,
      };
      let result;
      if (modelPreference === 'custom' && activeConnection) {
        try {
          result = { ...(await askCustomAI({ ...request, connection: activeConnection, signal: controller.signal })), requestedModel: 'custom' as const, fallbackUsed: false };
        } catch (customError) {
          if (controller.signal.aborted) return;
          if (!allowFallback) throw customError;
          const fallback = await askAIAboutPage({ ...request, modelPreference: 'auto', allowFallback: true, signal: controller.signal });
          result = { ...fallback, requestedModel: 'custom' as const, fallbackUsed: true };
        }
      } else {
        result = await askAIAboutPage({ ...request, modelPreference, allowFallback, signal: controller.signal });
      }
      if (typeof result.remaining === 'number') onRemainingChange(result.remaining, result.remainingPercent);
      const cleanedResponse = normalizeModelResponse(result.response);
      const usedReferences = referencesEnabled ? referencesUsedInAnswer(cleanedResponse, contextBundle.references) : [];
      onAddInteraction({
        id: uuidv4(),
        prompt: text.trim(),
        response: cleanedResponse,
        createdAt: Date.now(),
        insertedIntoNotes: false,
        provider: result.provider,
        model: result.model,
        requestedModel: result.requestedModel,
        fallbackUsed: result.fallbackUsed,
        references: usedReferences.length > 0 ? usedReferences : undefined,
      });
    } catch (requestError) {
      if (controller.signal.aborted) return;
      if (requestError instanceof AIRequestError) {
        if (typeof requestError.remaining === 'number') onRemainingChange(requestError.remaining, requestError.remainingPercent);
        setError(requestError.message);
      }
      else setError('The AI assistant could not answer right now. Try again.');
    } finally {
      abortControllerRef.current = null;
      setPendingPrompt(null);
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

  const activeConnection = connections.find((connection) => connection.id === selectedConnectionId) || null;
  const activeModelLabel = modelPreference === 'custom'
    ? activeConnection?.name || 'Custom model'
    : modelOptions.find((option) => option.value === modelPreference)?.label || 'Auto · Best available';

  const chooseModel = (value: AIModelPreference) => {
    setModelPreference(value);
    setModelMenuOpen(false);
  };

  const saveConnection = async (connection: CustomAIConnection) => {
    const saved = await saveEncryptedConnection(connection);
    window.dispatchEvent(new Event('study-ai-connections-changed'));
    setConnections((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [...current, saved]);
  };

  const deleteConnection = async (id: string) => {
    await deleteEncryptedConnection(id);
    window.dispatchEvent(new Event('study-ai-connections-changed'));
    setConnections((current) => {
      const next = current.filter((item) => item.id !== id);
      if (selectedConnectionId === id) {
        setSelectedConnectionId(next[0]?.id || null);
        if (next.length === 0) setModelPreference(hasProAccess ? 'auto' : 'basic');
      }
      return next;
    });
  };

  return (
    <div ref={assistantRef} className="flex flex-col h-full bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
      <div className="relative z-30 flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 p-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={18} className="text-indigo-600 shrink-0" />
          <h3 className="font-medium text-slate-800 text-sm truncate">{scope === 'document' ? 'AI Document Assistant' : 'AI Page Assistant'}</h3>
        </div>
        <div className="flex items-center gap-1">
          <span className="mr-1 hidden whitespace-nowrap text-xs font-medium text-slate-500 xl:inline">Document-aware</span>
          <button type="button" onClick={() => setIncludeImage((enabled) => !enabled)} disabled={!hasProAccess || !pageImage || scope === 'document'} className={`grid h-8 w-8 place-items-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${includeImage ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:text-indigo-700'}`} title={includeImage ? 'Page image is included' : 'Include the current page image'} aria-label="Include page image" aria-pressed={includeImage}><ImageIcon size={15} /></button>
          <button type="button" onClick={() => setReferencesEnabled((enabled) => !enabled)} className={`grid h-8 w-8 place-items-center rounded-md border transition-colors ${referencesEnabled ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:text-indigo-700'}`} title={referencesEnabled ? 'References are enabled' : 'Add clickable PDF references'} aria-label="References" aria-pressed={referencesEnabled}><Quote size={15} /></button>
          <div className="relative">
            <button type="button" onClick={() => { setRangeMenuOpen((open) => !open); }} className={`grid h-8 w-8 place-items-center rounded-md border transition-colors ${manualRangeEnabled ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500 hover:text-indigo-700'}`} title="Choose which PDF pages the AI should use" aria-label="Manual page range" aria-expanded={rangeMenuOpen}><ListFilter size={15} /></button>
            {rangeMenuOpen && <div className="absolute right-0 top-10 z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-xl">
              <label className="flex cursor-pointer items-center gap-2 font-semibold text-slate-700"><input type="checkbox" checked={manualRangeEnabled} onChange={(event) => setManualRangeEnabled(event.target.checked)} className="accent-indigo-600" />Use a manual page range</label>
              <p className="mt-1 text-[11px] text-slate-500">Limit answers to consecutive pages you choose.</p>
              {manualRangeEnabled && <div className="mt-3 flex items-center gap-1.5"><span>Pages</span><input type="number" min={1} max={maxPage} value={rangeStart} onChange={(event) => { const next = Math.max(1, Math.min(maxPage, Number(event.target.value) || 1)); setRangeStart(next); setRangeEnd((current) => Math.max(current, next)); }} className="h-8 w-14 rounded border border-slate-200 px-1.5 text-center" aria-label="First context page" /><span>to</span><input type="number" min={rangeStart} max={maxPage} value={rangeEnd} onChange={(event) => setRangeEnd(Math.max(rangeStart, Math.min(maxPage, Number(event.target.value) || rangeStart)))} className="h-8 w-14 rounded border border-slate-200 px-1.5 text-center" aria-label="Last context page" /><span>of {maxPage}</span></div>}
            </div>}
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={onVoiceControls} className={`relative grid h-8 w-8 place-items-center rounded-md border ${voiceActive ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-500'}`} title="Open lecture recording and voice notes" aria-label="Lecture voice notes"><Mic size={15} />{(voiceActive || voicePending > 0) && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />}</button>
            <button type="button" onClick={onVoiceControls} className="grid h-8 w-7 place-items-center text-slate-400" title="Transcribe lectures and create page notes using your Custom API only. Auto by page saves each page and continues on the next." aria-label="How voice notes work"><HelpCircle size={15} /></button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {history.length === 0 ? (
          <div className="py-8 text-center">
            <Sparkles size={24} className="mx-auto text-indigo-500" />
            <p className="mt-3 font-medium text-slate-700 text-sm">{scope === 'document' ? 'Ask about the whole document' : `Ask about page ${pageNumber}`}</p>
            <p className="text-xs text-slate-500 mt-1">{scope === 'document' ? 'Answers consider every indexed page and can be inserted into whole-document notes.' : "Answers are grounded in this page's text and optional page image."}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {(scope === 'document' ? documentQuickPrompts : pageQuickPrompts).map((item) => (
                <button key={item} type="button" onClick={() => handleAsk(item)} disabled={isDocumentContextLoading} className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-700 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-40">{item}</button>
              ))}
            </div>
          </div>
        ) : (
          history.map((item) => (
            <div key={item.id} className="space-y-3">
              <div className="flex justify-end"><div className="bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-medium max-w-[85%]">{item.prompt}</div></div>
              <div className="bg-indigo-50/70 text-indigo-950 px-4 py-3 rounded-lg text-sm border border-indigo-100 space-y-3">
                <div className="prose prose-sm prose-slate max-w-none leading-relaxed"><Markdown>{item.response}</Markdown></div>
                {referencesUsedInAnswer(item.response, item.references || []).length > 0 && (
                  <div className="rounded-md border border-indigo-100 bg-white/80 p-2.5">
                    <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase text-indigo-700"><Quote size={12} />Sources</div>
                    <div className="flex flex-wrap gap-2">
                      {referencesUsedInAnswer(item.response, item.references || []).map((reference) => (
                        <button key={`${reference.number}-${reference.pageNumber}-${reference.quote.slice(0, 20)}`} type="button" onClick={() => onReferenceSelect(reference)} className="group flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-left text-xs text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-slate-900" title={reference.quote}>
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded bg-indigo-600 font-bold text-white">{reference.number}</span>
                          <span className="truncate">Page {reference.pageNumber} · {reference.quote}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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

        {pendingPrompt && (
          <div className="space-y-3" aria-live="polite">
            <div className="flex justify-end"><div className="bg-slate-900 text-white px-3.5 py-2 rounded-lg text-xs font-medium max-w-[85%]">{pendingPrompt}</div></div>
            <div className="flex items-center justify-between gap-2 bg-indigo-50/70 border border-indigo-100 rounded-lg px-4 py-3 text-sm text-indigo-800">
              <div className="flex items-center gap-2 min-w-0">
                <Loader2 size={16} className="animate-spin text-indigo-600 shrink-0" />
                <span className="truncate">{scope === 'document' ? 'Finding the best passages and preparing an answer…' : `Thinking about page ${pageNumber} and the document…`}</span>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 bg-white hover:bg-red-50 px-2 py-1 rounded border border-red-200 transition-colors shrink-0 shadow-2xs cursor-pointer"
                title="Stop generating response"
                aria-label="Cancel AI response"
              >
                <Square size={11} className="fill-current" />
                <span>Stop</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-100 bg-white shrink-0">
        {isDocumentContextLoading && <p className="mb-2 flex items-center gap-2 text-xs text-slate-500"><Loader2 size={13} className="animate-spin text-indigo-600" />{documentContextProgress || 'Indexing the whole document…'}</p>}
        {error && <p role="alert" className="mb-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="relative flex items-center gap-2 text-xs text-slate-600">
            <Bot size={14} className="text-indigo-600" />
            <button ref={modelTriggerRef} type="button" onClick={() => setModelMenuOpen((open) => !open)} className="flex max-w-52 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-indigo-300" aria-haspopup="menu" aria-expanded={modelMenuOpen}>
              <span className="truncate">{hasProAccess ? activeModelLabel : 'Study Basic'}</span><ChevronDown size={13} className="shrink-0" />
            </button>
            {modelMenuOpen && <div ref={modelMenuRef} style={{ maxHeight: modelMenuMaxHeight }} className="custom-scrollbar absolute bottom-10 left-5 z-40 w-64 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl" role="menu">
              {!hasProAccess && <><button type="button" onClick={() => chooseModel('basic')} className="flex w-full items-center justify-between rounded-md bg-indigo-50 px-3 py-2 text-left text-xs font-semibold text-indigo-800"><span className="flex items-center gap-2"><Check size={14} />Study Basic</span><span className="text-[10px] font-medium text-indigo-600">Included</span></button><div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase text-slate-400">Premium models</div></>}
              {modelOptions.filter((option) => option.value !== 'basic').map((option) => hasProAccess
                ? <button key={option.value} type="button" onClick={() => chooseModel(option.value)} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-slate-50 ${modelPreference === option.value ? 'font-semibold text-indigo-700' : 'text-slate-700'}`} role="menuitem"><span>{option.label}</span>{modelPreference === option.value && <Check size={14} />}</button>
                : <button key={option.value} type="button" onClick={() => { setModelMenuOpen(false); onUpgrade(); }} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs text-slate-500 hover:bg-indigo-50 hover:text-indigo-700" role="menuitem"><span className="flex items-center gap-2"><Crown size={13} />{option.label}</span><Lock size={13} /></button>)}
              {hasProAccess && connections.length > 0 && <><div className="mx-2 my-1 h-px bg-slate-100" /><div className="px-3 py-1 text-[10px] font-semibold uppercase text-slate-400">Your models</div>{connections.map((connection) => <button key={connection.id} type="button" onClick={() => { setSelectedConnectionId(connection.id); chooseModel('custom'); }} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs hover:bg-slate-50 ${modelPreference === 'custom' && activeConnection?.id === connection.id ? 'font-semibold text-indigo-700' : 'text-slate-700'}`}><span className="truncate">{connection.name}</span>{modelPreference === 'custom' && activeConnection?.id === connection.id && <Check size={14} />}</button>)}</>}
            </div>}
            <button type="button" onClick={() => hasProAccess ? setConnectionsOpen(true) : onUpgrade()} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${hasProAccess ? 'border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-300 hover:text-indigo-700'}`} title={hasProAccess ? 'Manage Custom API connections' : 'Custom API requires Premium'} aria-label={hasProAccess ? 'Manage Custom API connections' : 'Upgrade for Custom API'}><KeyRound size={14} /><span>Custom API</span>{!hasProAccess && <Lock size={12} />}</button>
          </div>
          {hasProAccess ? <div className="flex items-center gap-3"><span className="text-xs font-semibold text-indigo-700">{remainingPercent}% left</span><label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer"><input type="checkbox" checked={allowFallback} onChange={(event) => setAllowFallback(event.target.checked)} className="accent-indigo-600" />Auto fallback</label></div> : <button type="button" onClick={onUpgrade} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"><Lock size={12} />{remainingPercent}% AI usage left · Upgrade</button>}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); handleAsk(prompt); }} className="relative flex items-center">
          <input
            type="text"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={isDocumentContextLoading ? 'Preparing document context…' : scope === 'document' ? 'Ask anything about the whole document…' : 'Ask about this page or the whole document…'}
            disabled={isLoading || isDocumentContextLoading}
            maxLength={4000}
            className={`w-full pl-4 ${isSpeechSupported ? 'pr-20' : 'pr-11'} py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs sm:text-sm focus:border-indigo-500 disabled:opacity-60`}
          />
          {isSpeechSupported && (
            <button
              type="button"
              onClick={toggleListening}
              disabled={isLoading || isDocumentContextLoading}
              className={`absolute right-10 p-1.5 rounded-lg transition-colors disabled:opacity-30 cursor-pointer ${
                isListening
                  ? 'text-red-600 bg-red-50 border border-red-200 animate-pulse'
                  : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'
              }`}
              title={isListening ? 'Stop voice transcription' : 'Dictate question with your voice'}
              aria-label={isListening ? 'Stop listening' : 'Voice dictation'}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}
          {isLoading ? (
            <button
              type="button"
              onClick={handleCancel}
              className="absolute right-2 p-1.5 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all shadow-xs cursor-pointer flex items-center justify-center"
              title="Stop AI response"
              aria-label="Cancel AI response"
            >
              <Square size={16} className="fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!prompt.trim() || isDocumentContextLoading}
              className="absolute right-2 p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-30 cursor-pointer"
              aria-label="Send question"
            >
              <Send size={18} />
            </button>
          )}
        </form>
      </div>

      <EditInsertModal
        isOpen={insertModalState.isOpen}
        onClose={() => setInsertModalState((current) => ({ ...current, isOpen: false }))}
        promptQuestion={insertModalState.promptQuestion}
        aiResponse={insertModalState.aiResponse}
        onConfirmInsert={onInsertToNotes}
      />
      <AIConnectionsModal
        isOpen={connectionsOpen}
        connections={connections}
        selectedId={selectedConnectionId}
        onSelect={(id) => { setSelectedConnectionId(id); if (hasProAccess) setModelPreference('custom'); }}
        onSave={saveConnection}
        onDelete={deleteConnection}
        onClose={() => setConnectionsOpen(false)}
      />
    </div>
  );
}
